"""Subprocess boundary, read-only host checks, and exact source verification."""

import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess

from .core import (CONFIG, HOST_IP, ORIGIN, PROJECT, ROOT, VOLUME, Refused,
                   redact, require, validate_ci, validate_model, validate_sha)


class Runner:
    def __init__(self, config=None, root=ROOT, env_file=CONFIG):
        self.config = config or {}
        self.root = Path(root)
        self.env_file = Path(env_file)
        # Do not inherit COMPOSE_*, build args, or production secrets into builds.
        self.environment = {key: value for key, value in os.environ.items() if key in
                            {"PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG",
                             "SSH_AUTH_SOCK", "GH_TOKEN", "GITHUB_TOKEN", "LANG", "TMPDIR"}}

    def run(self, args, extra_env=None, input_text=None, allow_failure=False, sensitive=False):
        result = subprocess.run(args, cwd=self.root, input=input_text, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env={**self.environment, **(extra_env or {})})
        if result.returncode and not allow_failure:
            # Captured tool output can contain interpolated env or SQL. Redact
            # before exposing diagnostics; argv never carries credentials.
            detail = ("Output withheld: command processed an independently managed secret-bearing configuration"
                      if sensitive else redact(result.stdout + result.stderr, self.config)[-12000:])
            raise Refused(f"{args[0]} failed (exit {result.returncode}):\n{detail}")
        return result

    def text(self, args, **kwargs):
        return self.run(args, **kwargs).stdout.strip()

    def json(self, args):
        return json.loads(self.text(args))

    def compose(self, sha, args, **kwargs):
        return self.run(["docker", "compose", "--project-name", PROJECT,
                         "--env-file", str(self.env_file), "--file",
                         str(self.root / "docker-compose.prod.yml"), *args],
                        extra_env={"RELEASE_SHA": sha, "COMPOSE_PARALLEL_LIMIT": "1"}, **kwargs)

    def model(self, sha):
        model = json.loads(self.compose(sha, ["config", "--format", "json"]).stdout)
        validate_model(model, sha, self.config)
        return model


def check_source(runner, sha):
    validate_sha(sha)
    require(runner.text(["git", "remote", "get-url", "origin"]) in
            ("git@github.com:avshukan/rank-vote.git", "https://github.com/avshukan/rank-vote.git"),
            "origin must be avshukan/rank-vote")
    runner.run(["git", "fetch", "origin", "main"])
    require(runner.text(["git", "rev-parse", "HEAD"]) == sha, "RELEASE_SHA must equal the checked-out commit")
    require(runner.run(["git", "symbolic-ref", "-q", "HEAD"], allow_failure=True).returncode == 1,
            "Production checkout must be detached at RELEASE_SHA")
    require(not runner.text(["git", "status", "--porcelain", "--untracked-files=all"]),
            "Production checkout must be clean (including untracked files)")
    runner.run(["git", "merge-base", "--is-ancestor", sha, "origin/main"])
    prefix = "repos/avshukan/rank-vote/actions"
    runs = runner.json(["gh", "api", f"{prefix}/workflows/ci.yml/runs?head_sha={sha}&branch=main&event=push&per_page=100"])
    require(runs["workflow_runs"], "No main CI push run for RELEASE_SHA")
    # Latest attempt/run must succeed, not an older green run followed by red.
    run = max(runs["workflow_runs"], key=lambda item: item["id"])
    jobs = runner.json(["gh", "api", f"{prefix}/runs/{run['id']}/jobs?per_page=100"])
    validate_ci(run, jobs["jobs"], sha)
    rules = runner.json(["gh", "api", "repos/avshukan/rank-vote/rules/branches/main"])
    required = {check["context"] for rule in rules if rule["type"] == "required_status_checks"
                for check in rule["parameters"]["required_status_checks"]}
    require({"checks", "containers"} <= required, "Owner must require both checks and containers on main")


def local_host(runner):
    require(os.geteuid() == 0, "Production commands require root")
    require(Path.cwd().resolve() == ROOT and runner.root.resolve() == ROOT,
            "Production checkout must be /opt/apps/rank-vote")
    require('ID=ubuntu' in Path("/etc/os-release").read_text(), "Expected the Ubuntu VPS")
    addresses = runner.json(["ip", "-json", "address", "show"])
    require(any(address.get("local") == HOST_IP for interface in addresses
                for address in interface.get("addr_info", [])), "This is not the intended VPS IPv4")
    context = runner.json(["docker", "context", "inspect"])[0]
    require(context["Endpoints"]["docker"]["Host"].startswith("unix://") and
            not runner.environment.get("DOCKER_HOST", "unix://").startswith(("tcp:", "ssh:")),
            "Production requires the host-local Docker daemon")


def caddy_container(runner):
    ids = runner.text(["docker", "ps", "--quiet", "--filter",
                       "label=com.docker.compose.project.working_dir=/opt/infrastructure/caddy",
                       "--filter", "label=com.docker.compose.service=caddy"]).split()
    require(len(ids) == 1, "Expected one running Caddy from /opt/infrastructure/caddy")
    return runner.json(["docker", "inspect", ids[0]])[0]


def network_boundary(runner, caddy, provisioned=True):
    networks = runner.json(["docker", "network", "inspect", "web"])
    require(caddy["Id"] in networks[0].get("Containers", {}), "Caddy must already join web")
    ids = runner.text(["docker", "ps", "--all", "--quiet", "--filter",
                       f"label=com.docker.compose.project={PROJECT}"]).split()
    containers = runner.json(["docker", "inspect", *ids]) if ids else []
    api_ids = []
    for container in containers:
        service = container["Config"]["Labels"].get("com.docker.compose.service")
        require(service in ("api", "web", "postgres", "migrate"), "Unknown production container")
        require(not container["HostConfig"].get("PortBindings") and
                container["HostConfig"].get("NetworkMode") != "host", "Production container publishes host ports")
        actual = set(container["NetworkSettings"]["Networks"])
        expected = {"api": {"rank-vote-api-proxy", "rank-vote-prod-db"}, "web": {"web"},
                    "postgres": {"rank-vote-prod-db"}, "migrate": {"rank-vote-prod-db"}}[service]
        require(actual == expected, "Unexpected production container network membership")
        if service == "postgres":
            require(any(mount.get("Type") == "volume" and mount.get("Name") == VOLUME and
                        mount.get("Destination") == "/var/lib/postgresql/data" for mount in container["Mounts"]),
                    "Existing PostgreSQL must use the exact external production data volume")
        if service == "api":
            api_ids.append(container["Id"])
    require(len(api_ids) <= 1, "More than one API container exists")
    if provisioned:
        proxy = runner.json(["docker", "network", "inspect", "rank-vote-api-proxy"])[0]
        members = set(proxy.get("Containers", {}))
        require(caddy["Id"] in members and members <= {caddy["Id"], *api_ids},
                "Only Caddy and Ranking Vote API may join rank-vote-api-proxy")
        # External volume lookup is fail-closed: ordinary deploy never creates it.
        runner.run(["docker", "volume", "inspect", VOLUME])
        db = runner.run(["docker", "network", "inspect", "rank-vote-prod-db"], allow_failure=True)
        if db.returncode == 0:
            network = json.loads(db.stdout)[0]
            require(network.get("Internal") is True, "Existing database network must be internal")
            require(set(network.get("Containers", {})) <= {c["Id"] for c in containers},
                    "Unexpected member of production database network")


def preflight(runner, provisioned=True):
    local_host(runner)
    engine = runner.text(["docker", "version", "--format", "{{.Server.Version}}"])
    compose = runner.text(["docker", "compose", "version", "--short"])
    require(int(engine.split(".")[0]) >= 24, "Docker Engine 24+ required")
    require(tuple(map(int, re.findall(r"\d+", compose)[:2])) >= (2, 20), "Compose 2.20+ required")
    free = shutil.disk_usage("/var/lib/docker").free
    memory = {line.split(":")[0]: int(line.split()[1]) for line in Path("/proc/meminfo").read_text().splitlines()
              if line.startswith(("MemAvailable:", "SwapFree:"))}
    require(free >= 5 * 1024**3, "At least 5 GiB free Docker disk required before building")
    require(sum(memory.values()) >= 1024**2, "At least 1 GiB available RAM + swap required")
    addresses = {entry[4][0] for entry in socket.getaddrinfo("rankvote.avshukan.com", 443, type=socket.SOCK_STREAM)}
    require(HOST_IP in addresses and all("." not in address or address == HOST_IP for address in addresses),
            "Production A record must point directly to the intended VPS")
    caddy = caddy_container(runner)
    network_boundary(runner, caddy, provisioned)
    print(f"Host {HOST_IP}; Docker {engine}; Compose {compose}; free disk {free // 1024**2} MiB; "
          f"available RAM+swap {sum(memory.values()) // 1024} MiB")
    print("DNS addresses: " + ", ".join(sorted(addresses)))
    print(runner.text(["docker", "exec", caddy["Id"], "caddy", "version"]))
    # No config/env/container inspection dumps: these reports contain no secrets.
    for command in (["ss", "-lntup"], ["ip", "-brief", "address"],
                    ["docker", "ps", "--format", "{{.Names}} {{.Ports}}"],
                    ["iptables", "-S"], ["iptables", "-t", "nat", "-S"],
                    ["ip6tables", "-S"], ["ip6tables", "-t", "nat", "-S"]):
        print("$ " + " ".join(command))
        print(runner.text(command))
    print("Operator must review IPv4/IPv6 firewall rules and cloud firewall; run external port probes. "
          "CORS does not block direct access. See docs/production.md.")
    return caddy
