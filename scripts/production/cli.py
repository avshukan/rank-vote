"""Production commands. Mutating commands are reserved for the post-merge phase."""

import argparse
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
from urllib.parse import quote

from .caddy import apply_route
from .core import (CONFIG, HOST_IP, ORIGIN, PROJECT, ROOT, VOLUME, Refused, ReleaseState,
                   atomic_write, deployment_lock, private_path, read_config, require, validate_config,
                   validate_sha)
from .probe import request, smoke, verify_poll
from .release import deploy, rollback
from .runtime import Runner, check_source, local_host, preflight


def confirm(expected, explanation):
    print(explanation)
    require(sys.stdin.isatty(), "This step requires an interactive operator; do not pipe confirmation")
    require(input(f"Type {expected}: ").strip() == expected, "Operator confirmation not supplied; stopped")


def fresh_config():
    app = secrets.token_hex(32)
    return {"DATABASE_URL": "postgresql://rank_vote_app:" + quote(app, safe="") +
            "@postgres:5432/rank_vote_prod?schema=public", "PORT": "3000", "CORS_ORIGIN": ORIGIN,
            "TRUSTED_PROXY_HOPS": "1", "POSTGRES_APP_PASSWORD": app,
            "POSTGRES_BOOTSTRAP_PASSWORD": secrets.token_hex(32)}


def dry_run(root):
    # Entirely local: no production config, host, networks, images or volume needed.
    with tempfile.TemporaryDirectory(prefix="rank-vote-prod-check-") as directory:
        path = Path(directory) / "dummy.env"
        config = fresh_config()
        atomic_write(path, "".join(f"{key}={value}\n" for key, value in config.items()))
        runner = Runner(config, root=root, env_file=path)
        runner.model("a" * 40)
        print("Production Compose rendered and validated with disposable generated dummy credentials; no resources created")


def public_verification(runner, sha, recreate_check=True):
    print("First deployment: apply the reviewed Caddy route from a second SSH session now (docs/production.md).")
    confirm(f"PROXY VERIFIED {sha}", "Complete the external proxy + second-peer + IPv4/IPv6 port checks. "
            "Confirm Caddy uses the actual socket peer and existing sites still respond.")
    # Clear only the single API's process-local test buckets, before user smoke.
    runner.compose(sha, ["restart", "api"])
    runner.compose(sha, ["up", "--detach", "--no-deps", "--no-recreate", "--wait", "--wait-timeout", "180", "api"])
    poll_id = smoke()
    persistence = ("Then perform the controlled persistence/recovery check in docs/production.md using poll " + poll_id
                   if recreate_check else "Verify the saved previous smoke poll is still readable; leave PostgreSQL untouched during rollback.")
    confirm(f"PUBLIC VERIFIED {sha}", "Open the frontend and smoke results route in an external browser. "
            "Confirm valid HTTPS, no mixed content/console errors, correct results, and ALL existing Caddy sites. "
            + persistence)
    verify_poll(poll_id)
    return poll_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check", "config", "preflight", "provision", "deploy", "rollback", "caddy", "tag"])
    parser.add_argument("--sha", default=os.environ.get("RELEASE_SHA", ""))
    parser.add_argument("--before-provision", action="store_true")
    parser.add_argument("--tag")
    args = parser.parse_args()
    if args.action == "check":
        dry_run(Path(__file__).resolve().parents[2])
        return
    runner = Runner()
    local_host(runner)
    if args.action == "caddy":
        # A separate lock permits the first-deploy operator to apply routing while
        # deploy holds its release lock and waits at the public-verification step.
        with deployment_lock("/run/lock/rank-vote-caddy.lock"):
            check_source(runner, validate_sha(args.sha or runner.text(["git", "rev-parse", "HEAD"])))
            apply_route(runner)
        return
    with deployment_lock("/run/lock/rank-vote-prod.lock"):
        if args.action == "config":
            check_source(runner, validate_sha(args.sha or runner.text(["git", "rev-parse", "HEAD"])))
            preflight(runner, provisioned=False)
            require(not CONFIG.exists(), "Production config already exists; refusing to replace credentials")
            CONFIG.parent.mkdir(mode=0o700, exist_ok=True)
            private_path(CONFIG.parent, 0o700, directory=True)
            values = validate_config(fresh_config())
            atomic_write(CONFIG, "".join(f"{key}={value}\n" for key, value in values.items()))
            print("Generated independent credentials directly in root-only /etc/rank-vote/prod.env")
            return
        runner.config = read_config()
        if args.action == "preflight":
            preflight(runner, provisioned=not args.before_provision)
            return
        if args.action == "provision":
            check_source(runner, validate_sha(args.sha))
            runner.model(args.sha)
            preflight(runner, provisioned=False)
            require(not (ROOT / "deploy-state").exists(), "Release state exists; provisioning is only for the first deployment")
            require(runner.run(["docker", "volume", "inspect", VOLUME], allow_failure=True).returncode != 0,
                    "Production volume already exists; ordinary deploy must reuse it")
            confirm(f"PROVISION {VOLUME}", "First initialization only. Verify DNS, host and both firewalls before creating empty storage.")
            proxy = runner.run(["docker", "network", "inspect", "rank-vote-api-proxy"], allow_failure=True)
            if proxy.returncode:
                runner.run(["docker", "network", "create", "rank-vote-api-proxy"])
            else:
                require(not json.loads(proxy.stdout)[0].get("Containers"), "New API proxy network must be empty")
            runner.run(["docker", "volume", "create", "--label", "com.rank-vote.purpose=production", VOLUME])
            print("External volume provisioned. Attach Caddy using the reviewed overlay procedure, then run prod-deploy.")
            return
        # Both deploy and rollback validate the currently checked-out tooling on
        # clean CI-green main. Rollback selects previous application images below.
        sha = validate_sha(args.sha if args.action == "deploy" else
                           (args.sha or runner.text(["git", "rev-parse", "HEAD"])))
        check_source(runner, sha)
        runner.model(sha)
        preflight(runner)
        state_dir = ROOT / "deploy-state"
        state_dir.mkdir(mode=0o700, exist_ok=True)
        private_path(state_dir, 0o700, directory=True)
        state = ReleaseState(state_dir)
        for name in ("current", "previous"):
            path = state_dir / f"{name}.env"
            if path.exists():
                private_path(path, 0o600)
                state.read(name)
        if args.action == "tag":
            current = state.read("current")
            require(current and args.tag and current["RELEASE_SHA"] == sha, "Tag must identify the current verified SHA")
            require(runner.text(["git", "cat-file", "-t", args.tag]) == "tag" and
                    runner.text(["git", "rev-parse", args.tag + "^{commit}"]) == sha, "Expected annotated tag on current SHA")
            state.promote({**current, "RELEASE_TAG": args.tag})
            return
        confirm(f"HOST VERIFIED {HOST_IP}", "Review preflight output and the cloud firewall; confirm Caddy-only API access, "
                "no unreviewed IPv6 route, and no other project affected. Bootstrap credentials are never given to API/migrate.")
        if args.action == "deploy":
            deploy(runner, state, sha, lambda selected: public_verification(runner, selected))
        else:
            rollback(runner, state, confirm, lambda selected: public_verification(runner, selected, recreate_check=False))


if __name__ == "__main__":
    try:
        main()
    except (Refused, OSError, ValueError, KeyError, EOFError) as error:
        # Unknown exceptions may carry env/SQL text: expose only curated errors.
        print(str(error) if isinstance(error, Refused) else "Production operation failed; check prerequisites and root-only diagnostics", file=sys.stderr)
        sys.exit(1)
