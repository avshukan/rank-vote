"""Validation and release state. No Docker or production side effects on import."""

import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from urllib.parse import quote, unquote, urlsplit

ORIGIN = "https://rank-vote.avshukan.com"
API_URL = ORIGIN + "/api/v1"
HOST_IP = "165.22.91.190"
ROOT = Path("/opt/apps/rank-vote")
CONFIG = Path("/etc/rank-vote/prod.env")
VOLUME = "rank_vote_prod_postgres_data"
PROJECT = "rank-vote-prod"
SHA = re.compile(r"[0-9a-f]{40}")
IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}")
# React Router includes a bare http://localhost URL-parser base in every build.
# Reject development endpoints (ports or API paths), not that library constant.
DEVELOPMENT_ENDPOINT = r"https?://(localhost|127[.]0[.]0[.]1|0[.]0[.]0[.]0|\[::1\])(:[0-9]+|/api/v1)"
CONFIG_KEYS = {
    "DATABASE_URL", "PORT", "CORS_ORIGIN", "TRUSTED_PROXY_HOPS",
    "POSTGRES_BOOTSTRAP_PASSWORD", "POSTGRES_APP_PASSWORD",
}


class Refused(RuntimeError):
    """An operator-facing error whose message contains no secret values."""


def require(condition, message):
    if not condition:
        raise Refused(message)


def parse_env(text):
    """A deliberately small literal format: no shell execution or interpolation."""
    result = {}
    for line in text.splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        require(separator and re.fullmatch(r"[A-Z][A-Z0-9_]*", key),
                "Invalid env syntax; use literal KEY=value lines")
        require(key not in result, "Duplicate env key")
        require(not any(c.isspace() for c in value) and
                not any(c in value for c in "'$`\"\\"), "Unsupported env value syntax")
        result[key] = value
    return result


def validate_sha(sha):
    require(isinstance(sha, str) and SHA.fullmatch(sha), "RELEASE_SHA must be 40 lowercase hex characters")
    return sha


def validate_web_bundle(bundle, expected=API_URL):
    require(expected in bundle and not re.search(DEVELOPMENT_ENDPOINT, bundle),
            "Web bundle must contain the production API URL and no development endpoint")


def validate_config(values):
    require(set(values) == CONFIG_KEYS and all(values.values()),
            "Production config has missing, empty or unknown keys")
    for key in ("POSTGRES_BOOTSTRAP_PASSWORD", "POSTGRES_APP_PASSWORD"):
        password = values[key]
        # Generated hex is the default; URL-safe punctuation is accepted too.
        require(re.fullmatch(r"[A-Za-z0-9_.~!@%+:=/,-]{32,128}", password) and
                len(set(password)) >= 12 and
                not any(word in password.lower() for word in
                        ("rank_vote", "password", "changeme", "development", "generate", "example")),
                f"{key} must be an independently generated strong password")
    require(values["POSTGRES_BOOTSTRAP_PASSWORD"] != values["POSTGRES_APP_PASSWORD"],
            "Bootstrap and application passwords must differ")
    require(values["PORT"] == "3000", "PORT must be 3000")
    require(values["CORS_ORIGIN"] == ORIGIN, "CORS_ORIGIN must be the production origin")
    require(values["TRUSTED_PROXY_HOPS"] == "1", "TRUSTED_PROXY_HOPS must be 1")
    expected = ("postgresql://rank_vote_app:" + quote(values["POSTGRES_APP_PASSWORD"], safe="") +
                "@postgres:5432/rank_vote_prod?schema=public")
    require(values["DATABASE_URL"] == expected,
            "DATABASE_URL must use the production role/host/database and percent-encoded app password")
    return values


def private_path(path, mode, directory=False):
    info = path.lstat()
    require(info.st_uid == 0 and info.st_gid == 0 and stat.S_IMODE(info.st_mode) == mode and
            (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)),
            f"Expected root:root {mode:04o} {'directory' if directory else 'file'}: {path}")


def read_config(path=CONFIG):
    private_path(path.parent, 0o700, directory=True)
    private_path(path, 0o600)
    return validate_config(parse_env(path.read_text()))


def redact(text, config):
    values = set()
    for key in ("DATABASE_URL", "POSTGRES_BOOTSTRAP_PASSWORD", "POSTGRES_APP_PASSWORD"):
        value = config.get(key, "")
        if value:
            values.update((value, quote(value, safe=""), unquote(value)))
    for value in sorted(values, key=len, reverse=True):
        text = text.replace(value, "[REDACTED]")
    return re.sub(r"postgres(?:ql)?://[^\s\"']+", "[REDACTED_DATABASE_URL]", text)


def validate_model(model, sha, config):
    """Check the rendered model before any container is changed. Never print it."""
    validate_sha(sha)
    validate_config(config)
    require(model.get("name") == PROJECT, "Wrong Compose project")
    services = model.get("services", {})
    require(set(services) == {"postgres", "migrate", "api", "web"}, "Unexpected production services")
    required_env = {
        "postgres": {"POSTGRES_DB": "postgres", "POSTGRES_USER": "rank_vote_bootstrap",
                     "POSTGRES_PASSWORD": config["POSTGRES_BOOTSTRAP_PASSWORD"],
                     "POSTGRES_APP_PASSWORD": config["POSTGRES_APP_PASSWORD"],
                     "POSTGRES_INITDB_ARGS": "--auth-host=scram-sha-256"},
        "migrate": {"DATABASE_URL": config["DATABASE_URL"]},
        "api": {key: config[key] for key in ("DATABASE_URL", "PORT", "CORS_ORIGIN", "TRUSTED_PROXY_HOPS")},
        "web": {},
    }
    for name, service in services.items():
        require(not any(service.get(key) for key in
                        ("ports", "network_mode", "build", "env_file", "privileged")),
                f"Unsafe production service settings: {name}")
        require(service.get("environment", {}) == required_env[name], f"Unexpected environment: {name}")
        require(service.get("restart") == ("no" if name == "migrate" else "unless-stopped"),
                f"Wrong restart policy: {name}")
        expected_networks = {"postgres": {"db"}, "migrate": {"db"},
                             "api": {"db", "api_proxy"}, "web": {"web"}}[name]
        require(set(service["networks"]) == expected_networks, f"Wrong networks: {name}")
        if name != "postgres":
            image_name = "api" if name == "migrate" else name
            require(service["image"] == f"rank-vote-{image_name}:{sha}" and
                    service["pull_policy"] == "never", f"Wrong release image: {name}")
    require(services["postgres"]["image"] == "postgres:17-alpine", "PostgreSQL 17 is required")
    require(services["api"].get("scale") == 1 and
            services["api"].get("stop_grace_period") == "30s", "API requires one replica and 30s stop grace")
    require(services["migrate"]["command"] == ["pnpm", "run", "db:deploy"], "Wrong migration command")
    for service, network, alias in (("web", "web", "rank-vote-web"), ("api", "api_proxy", "rank-vote-api")):
        require(services[service]["networks"][network].get("aliases") == [alias], "Wrong proxy alias")
    networks = model["networks"]
    require(set(networks) == {"web", "api_proxy", "db"}, "Unexpected networks")
    for key, name in (("web", "web"), ("api_proxy", "rank-vote-api-proxy")):
        require(networks[key].get("name") == name and networks[key].get("external") is True,
                "Proxy networks must be external")
    require(networks["db"].get("name") == "rank-vote-prod-db" and networks["db"].get("internal") is True,
            "Database network must be internal with its stable name")
    require(model["volumes"] == {"postgres_data": {"name": VOLUME, "external": True}},
            "Production volume must be explicitly named and external")
    mounts = services["postgres"]["volumes"]
    require(len(mounts) == 2 and any(m.get("source") == "postgres_data" and
            m["target"] == "/var/lib/postgresql/data" for m in mounts) and
            any(m.get("source", "").endswith("/docker/postgres/init-production.sql") and
                m.get("read_only") is True for m in mounts), "Wrong PostgreSQL mounts")


def validate_ci(runs, jobs, sha):
    require(runs.get("head_sha") == sha and runs.get("head_branch") == "main" and
            runs.get("event") == "push" and runs.get("conclusion") == "success" and
            runs.get("path") == ".github/workflows/ci.yml", "Exact main SHA needs a successful CI push run")
    by_name = {job["name"]: job for job in jobs}
    require(all(by_name.get(name, {}).get("conclusion") == "success" and
                by_name[name].get("head_sha") == sha for name in ("checks", "containers")),
            "Both checks and containers must succeed on the exact SHA")


def atomic_write(path, text):
    """Same-filesystem rename; fsync file and directory for durable promotion."""
    fd, name = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


MANIFEST_KEYS = {"RELEASE_SHA", "API_IMAGE", "WEB_IMAGE", "API_IMAGE_ID", "WEB_IMAGE_ID",
                 "PRODUCTION_URL", "DEPLOYED_AT", "RELEASE_TAG", "SMOKE_POLL_ID"}


def validate_manifest(values):
    require(set(values) == MANIFEST_KEYS, "Malformed release manifest")
    sha = validate_sha(values["RELEASE_SHA"])
    for service in ("API", "WEB"):
        require(values[f"{service}_IMAGE"] == f"rank-vote-{service.lower()}:{sha}" and
                IMAGE_ID.fullmatch(values[f"{service}_IMAGE_ID"]), "Invalid manifest image identity")
    require(values["PRODUCTION_URL"] == ORIGIN and
            re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", values["DEPLOYED_AT"]) and
            re.fullmatch(r"(?:v\d+\.\d+\.\d+)?", values["RELEASE_TAG"]) and
            re.fullmatch(r"[0-9a-f-]{36}", values["SMOKE_POLL_ID"]), "Invalid manifest metadata")
    return values


class ReleaseState:
    def __init__(self, directory):
        self.directory = Path(directory)

    def read(self, name):
        path = self.directory / f"{name}.env"
        if not path.exists():
            return None
        require(not path.is_symlink(), "Release manifest must not be a symlink")
        return validate_manifest(parse_env(path.read_text()))

    def write(self, name, values):
        validate_manifest(values)
        atomic_write(self.directory / f"{name}.env", "".join(f"{key}={values[key]}\n" for key in sorted(values)))

    def prepare(self):
        # Before downtime, save the last smoke-verified application for a failed
        # candidate too. On the first deploy there is no previous release.
        current = self.read("current")
        if current:
            self.write("previous", current)

    def promote(self, candidate):
        self.write("current", candidate)

    def rollback_target(self):
        previous = self.read("previous")
        require(previous is not None, "No previous release exists; use a reviewed forward fix or separately chosen restore")
        return previous


@contextlib.contextmanager
def deployment_lock(path):
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refused("Another production operation holds the deployment lock") from None
        yield
    finally:
        os.close(fd)  # Kernel releases the lock even after process failure.
