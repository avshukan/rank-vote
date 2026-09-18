"""Disposable LOCAL production-model integration test. Never uses production names."""

import json
import os
from pathlib import Path
import tempfile
import time
from uuid import uuid4

from .cli import fresh_config
from .core import API_URL, ROOT, Refused, atomic_write, redact, require
from .probe import proxy_probe, request, smoke, verify_poll
from .runtime import Runner


def main():
    root = Path(__file__).resolve().parents[2]
    require(root.resolve() != ROOT, "prod-smoke is local/CI only, never run it in the production checkout")
    project = "rank-vote-prod-smoke-" + uuid4().hex[:12]
    sha = "a" * 40  # Rendering fixture only, not a deployable release.
    with tempfile.TemporaryDirectory(prefix=project) as temporary:
        directory = Path(temporary)
        config = fresh_config()
        env_path = directory / "dummy.env"
        atomic_write(env_path, "".join(f"{key}={value}\n" for key, value in config.items()))
        runner = Runner(config, root=root, env_file=env_path)
        model = runner.model(sha)
        # Validate the real production model first, then isolate EVERY named
        # resource. No production external network/volume is looked up or created.
        model["name"] = project
        for key in model["networks"]:
            model["networks"][key] = {"name": project + "-" + key,
                                      **({"internal": True} if key == "db" else {})}
        model["volumes"]["postgres_data"] = {"name": project + "-data"}
        for service in ("api", "web", "migrate"):
            model["services"][service]["image"] = project + ("-web" if service == "web" else "-api")
        caddy_path = directory / "Caddyfile"
        snippet = (root / "deploy/Caddyfile.rank-vote").read_text()
        caddy_path.write_text("http://existing.test:80 {\n respond existing-site\n}\n\n" +
                              snippet.replace("rankvote.avshukan.com", ":80"))
        model["services"]["caddy"] = {
            "image": "caddy:2.10.2-alpine", "networks": {"web": {}, "api_proxy": {}},
            "volumes": [{"type": "bind", "source": str(caddy_path), "target": "/etc/caddy/Caddyfile", "read_only": True}],
            "ports": [{"target": 80, "published": "0", "host_ip": "127.0.0.1", "protocol": "tcp"}],
            "healthcheck": {"test": ["CMD", "wget", "-q", "-O", "-", "http://127.0.0.1/api/v1/health"],
                            "interval": "2s", "timeout": "5s", "retries": 30},
        }
        compose_path = directory / "compose.json"
        # Values are literal JSON. Dollar signs are rejected by config validation.
        atomic_write(compose_path, json.dumps(model))
        def compose(*args, **kwargs):
            return runner.run(["docker", "compose", "--project-name", project, "--file", str(compose_path), *args], **kwargs)
        def container(service):
            return compose("ps", "--all", "--quiet", service).stdout.strip()
        try:
            print("production smoke: sequential API and production-URL web builds", flush=True)
            for service in ("api", "web"):
                command = ["docker", "build", "--file", f"apps/{service}/Dockerfile", "--tag", project + "-" + service]
                if service == "web":
                    command += ["--build-arg", "VITE_API_URL=" + API_URL]
                runner.run([*command, "."])
            print("production smoke: bootstrap and one-shot migrations", flush=True)
            compose("up", "--detach", "--no-deps", "--wait", "--wait-timeout", "180", "postgres")
            compose("up", "--no-deps", "--no-build", "--pull", "never", "--force-recreate",
                    "--abort-on-container-exit", "--exit-code-from", "migrate", "migrate")
            for service in ("api", "web", "caddy"):
                compose("up", "--detach", "--no-deps", "--wait", "--wait-timeout", "180", service)
            job = runner.json(["docker", "inspect", container("migrate")])[0]
            require(job["State"]["ExitCode"] == 0, "Production migration failed")
            query = "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname='rank_vote_app';"
            result = compose("exec", "-T", "postgres", "psql", "-U", "rank_vote_bootstrap", "-d", "postgres", "-Atc", query).stdout.strip()
            require(result == "f|f|f|f", "Application role has excessive privileges")
            query = "SELECT datname,pg_get_userbyid(datdba) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1');"
            result = compose("exec", "-T", "postgres", "psql", "-U", "rank_vote_bootstrap", "-d", "postgres", "-Atc", query).stdout.strip()
            require(result == "rank_vote_prod|rank_vote_app", "Wrong production DB/owner or development database created")
            query = "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public';"
            require(compose("exec", "-T", "postgres", "psql", "-U", "rank_vote_bootstrap", "-d", "rank_vote_prod", "-Atc", query).stdout.strip() == "rank_vote_app",
                    "Application must own public schema")
            for service in ("api", "migrate"):
                info = runner.json(["docker", "inspect", container(service)])[0]
                environment = "\n".join(info["Config"]["Env"])
                require(config["POSTGRES_BOOTSTRAP_PASSWORD"] not in environment and "POSTGRES_APP_PASSWORD=" not in environment,
                        "Bootstrap credentials leaked into application")
                require(not info["HostConfig"]["PortBindings"], "Application publishes a host port")
            endpoint = compose("port", "caddy", "80").stdout.strip()
            origin = "http://" + endpoint
            print("production smoke: real Caddy routes and forged forwarding headers", flush=True)
            caddy_command = ["docker", "exec", "-i", "--workdir", "/etc/caddy", container("caddy"), "caddy"]
            runner.run([*caddy_command, "validate", "--config", "-", "--adapter", "caddyfile"], input_text=caddy_path.read_text())
            runner.run([*caddy_command, "reload", "--config", "-", "--adapter", "caddyfile"], input_text=caddy_path.read_text())
            invalid = runner.run([*caddy_command, "reload", "--config", "-", "--adapter", "caddyfile"],
                                 input_text="{ definitely_invalid_directive }", allow_failure=True)
            require(invalid.returncode != 0, "Invalid Caddy reload unexpectedly succeeded")
            require(request(origin + "/api/v1")[0] == 200, "Exact API prefix not routed")
            require(request(origin + "/", headers={"Host": "existing.test"})[1] == "existing-site", "Existing Caddy site changed")
            proxy_probe(origin)
            # A second socket peer from a disposable container must get its own
            # bucket; Caddy must not use its own address for every caller.
            peer = runner.run(["docker", "run", "--rm", "--network", project + "-web", "--entrypoint", "node", project + "-api",
                               "-e", "fetch('http://caddy/api/v1/polls',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>{if(r.status!==400)process.exit(1)})"])
            require(peer.returncode == 0, "Distinct Caddy peer did not have an independent bucket")
            compose("restart", "api")
            compose("up", "--detach", "--no-deps", "--wait", "--wait-timeout", "90", "api")
            print("production smoke: create/fetch/full ballot/Borda/SPA via Caddy", flush=True)
            poll_id = smoke(origin)
            print("production smoke: unavailable DB during API startup, then automatic recovery", flush=True)
            compose("stop", "postgres")
            compose("up", "--detach", "--no-deps", "--force-recreate", "api")
            time.sleep(3)
            compose("up", "--detach", "--no-deps", "--wait", "--wait-timeout", "120", "postgres")
            compose("up", "--detach", "--no-deps", "--no-recreate", "--wait", "--wait-timeout", "120", "api")
            verify_poll(poll_id, origin)
            print("production smoke: controlled PostgreSQL/API/web recreation preserves data", flush=True)
            compose("up", "--detach", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "120", "postgres")
            compose("up", "--detach", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "120", "api", "web")
            verify_poll(poll_id, origin)
            started = time.monotonic()
            compose("stop", "api")
            info = runner.json(["docker", "inspect", container("api")])[0]
            require(time.monotonic() - started < 30 and info["State"]["ExitCode"] in (0, 143), "Production graceful stop failed")
            compose("up", "--detach", "--no-deps", "--wait", "--wait-timeout", "120", "api")
            verify_poll(poll_id, origin)
            print("production smoke: passed; isolated data will be removed", flush=True)
        except BaseException:
            # Diagnostics are captured/redacted by Runner; never dump config/env.
            print(redact(compose("logs", "--no-color", "--tail", "60", allow_failure=True).stdout, config))
            raise
        finally:
            require(project.startswith("rank-vote-prod-smoke-"), "Refusing non-test cleanup")
            compose("down", "--volumes", "--remove-orphans", allow_failure=True)
            runner.run(["docker", "image", "rm", project + "-api", project + "-web"], allow_failure=True)


if __name__ == "__main__":
    main()
