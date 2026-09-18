"""Owner-invoked Caddy routing change; never starts/stops/recreates Caddy."""

from pathlib import Path

from .core import ROOT, atomic_write, require
from .runtime import caddy_container, local_host


def candidate_config(previous, snippet):
    require("rankvote.avshukan.com" not in previous, "Ranking Vote domain already configured; review the existing route")
    return previous.rstrip() + "\n\n" + snippet


def apply_route(runner, path=Path("/opt/infrastructure/caddy/Caddyfile"), snippet_path=ROOT / "deploy/Caddyfile.rank-vote"):
    local_host(runner)
    caddy = caddy_container(runner)
    # A supported, explicit path is safer than guessing where imported configs live.
    require(not path.is_symlink() and path.is_file(), "Expected a regular Caddyfile at /opt/infrastructure/caddy/Caddyfile")
    require(any(mount.get("Source") in (str(path), str(path.parent)) and
                mount.get("Destination") in ("/etc/caddy/Caddyfile", "/etc/caddy")
                for mount in caddy["Mounts"]), "Caddyfile mount layout differs; review before applying")
    previous = path.read_text()
    candidate = candidate_config(previous, snippet_path.read_text())
    command = ["docker", "exec", "--interactive", "--workdir", "/etc/caddy", caddy["Id"], "caddy"]
    # '-' is Caddy's documented stdin config input; relative imports resolve in /etc/caddy.
    runner.run([*command, "validate", "--config", "-", "--adapter", "caddyfile"], input_text=previous, sensitive=True)
    runner.run([*command, "validate", "--config", "-", "--adapter", "caddyfile"], input_text=candidate, sensitive=True)
    backup = path.with_name("Caddyfile.before-rank-vote")
    require(not backup.exists(), "Caddy backup already exists; inspect previous attempt first")
    atomic_write(backup, previous)
    try:
        # Reload accepts the complete candidate atomically. A failed reload leaves
        # Caddy serving its old config. Preserve the host file for the next restart.
        runner.run([*command, "reload", "--config", "-", "--adapter", "caddyfile"], input_text=candidate, sensitive=True)
        # Write in place: a single-file Docker bind mount keeps its inode.
        with path.open("w") as handle:
            handle.write(candidate)
            handle.flush()
            import os
            os.fsync(handle.fileno())
    except BaseException:
        path.write_text(previous)
        runner.run([*command, "reload", "--config", "-", "--adapter", "caddyfile"], input_text=previous, sensitive=True)
        raise
    print("Caddy route validated and reloaded; previous config preserved at " + str(backup))
