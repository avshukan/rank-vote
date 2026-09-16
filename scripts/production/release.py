"""The release sequence, with an injectable runner for failure-path tests."""

from datetime import datetime, timezone
import json
import tempfile
from pathlib import Path

from .core import (API_URL, DEVELOPMENT_ENDPOINT, ORIGIN, atomic_write, redact, require)
from .runtime import caddy_container, network_boundary


def timestamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def image_identity(runner, service, sha):
    tag = f"rank-vote-{service}:{sha}"
    image = runner.json(["docker", "image", "inspect", tag])[0]
    require(image["Config"].get("Labels", {}).get("org.opencontainers.image.revision") == sha,
            f"Image revision label does not match {service} release SHA")
    if service == "api":
        require(image["Config"]["Cmd"] == ["node", "dist/main.js"], "API must run one Node process without entrypoint migrations")
    return tag, image["Id"]


def prepare_images(runner, sha):
    images = {}
    for service in ("api", "web"):
        tag = f"rank-vote-{service}:{sha}"
        found = runner.run(["docker", "image", "inspect", tag], allow_failure=True)
        if found.returncode:
            print(f"Building {service} for {sha}; sequential build")
            command = ["docker", "build", "--file", f"apps/{service}/Dockerfile",
                       "--tag", tag, "--label", f"org.opencontainers.image.revision={sha}"]
            if service == "web":
                command.extend(["--build-arg", f"VITE_API_URL={API_URL}"])
            # Archive only tracked files from the verified commit. Ignored local
            # files (including secrets/generated artifacts) cannot enter layers.
            with tempfile.TemporaryDirectory(prefix="rank-vote-build-") as directory:
                archive = str(Path(directory) / "source.tar")
                runner.run(["git", "archive", "--format=tar", "--output", archive, sha])
                context = Path(directory) / "context"
                context.mkdir()
                runner.run(["tar", "-xf", archive, "-C", str(context)])
                # Dockerfile paths are relative to the caller, so point at the
                # archived Dockerfile explicitly along with the archived context.
                command[command.index("--file") + 1] = str(context / f"apps/{service}/Dockerfile")
                runner.run([*command, str(context)])
        # Never overwrite an existing SHA tag: repeated deploys reuse its identity.
        images[service] = image_identity(runner, service, sha)
        if service == "api":
            check = "test -f dist/main.js && test -f prisma/schema.prisma && test -f prisma.config.ts && test ! -e src"
        else:
            check = (f"grep -r -F -q '{API_URL}' /usr/share/nginx/html/assets && "
                     f"! grep -r -E '{DEVELOPMENT_ENDPOINT}' /usr/share/nginx/html/assets")
        runner.run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "sh",
                    images[service][1], "-c", check])
        if service == "api":
            runner.run(["docker", "run", "--rm", "--network", "none", images[service][1],
                        "pnpm", "exec", "prisma", "--version"])
    return images


def verify_image_ids(runner, sha, images):
    for service, identity in images.items():
        require(image_identity(runner, service, sha) == identity,
                "Saved image tag now points elsewhere; do not rebuild or retag during recovery")


def start_application(runner, sha):
    for service in ("api", "web"):
        runner.compose(sha, ["up", "--detach", "--no-deps", "--no-build", "--pull", "never",
                             "--force-recreate", "--wait", "--wait-timeout", "180", service])


def internal_verify(runner, sha, images, migration=True):
    for service in ("postgres", "api", "web"):
        ids = runner.compose(sha, ["ps", "--all", "--quiet", service]).stdout.split()
        require(len(ids) == 1, f"Expected exactly one {service} container")
        info = runner.json(["docker", "inspect", ids[0]])[0]
        require(info["State"]["Status"] == "running" and
                info["State"].get("Health", {}).get("Status") == "healthy", f"{service} is not healthy")
        if service in images:
            require(info["Image"] == images[service][1], f"Running {service} image differs from release")
        if service == "api":
            processes = runner.text(["docker", "top", ids[0], "-eo", "comm"]).splitlines()[1:]
            require(sum(line.strip() == "node" for line in processes) == 1, "API must have exactly one Node process")
    if migration:
        ids = runner.compose(sha, ["ps", "--all", "--quiet", "migrate"]).stdout.split()
        require(len(ids) == 1, "Expected completed migrate container")
        job = runner.json(["docker", "inspect", ids[0]])[0]
        require(job["State"]["Status"] == "exited" and job["State"]["ExitCode"] == 0 and
                job["Image"] == images["api"][1], "Migration did not complete for this release image")
    network_boundary(runner, caddy_container(runner))


def deploy(runner, state, sha, verify_public):
    images = prepare_images(runner, sha)
    verify_image_ids(runner, sha, images)
    state.prepare()
    print("Images passed; stopping web/API before migration")
    runner.compose(sha, ["stop", "web", "api"])
    # --no-recreate leaves an existing PostgreSQL container (and its credentials)
    # alone. On first deploy, the explicitly provisioned external volume is used.
    runner.compose(sha, ["up", "--detach", "--no-deps", "--no-recreate", "--wait",
                         "--wait-timeout", "180", "postgres"])
    print("Running migrate once; failure leaves web/API stopped")
    result = runner.compose(sha, ["up", "--no-deps", "--no-build", "--pull", "never", "--force-recreate",
                                 "--abort-on-container-exit", "--exit-code-from", "migrate", "migrate"],
                            allow_failure=True)
    log = state.directory / ("migration-" + sha + "-" + timestamp().replace(":", "") + ".log")
    atomic_write(log, redact(result.stdout + result.stderr, runner.config))
    require(result.returncode == 0, f"Migration failed. Application remains stopped; PostgreSQL remains running. Diagnostics: {log}")
    start_application(runner, sha)
    internal_verify(runner, sha, images)
    poll_id = verify_public(sha)
    internal_verify(runner, sha, images)
    candidate = {"RELEASE_SHA": sha, "PRODUCTION_URL": ORIGIN, "DEPLOYED_AT": timestamp(),
                 "RELEASE_TAG": "", "SMOKE_POLL_ID": poll_id}
    for service, (tag, identity) in images.items():
        candidate[f"{service.upper()}_IMAGE"] = tag
        candidate[f"{service.upper()}_IMAGE_ID"] = identity
    state.promote(candidate)
    print(f"Release {sha} passed smoke and is current; smoke poll {poll_id}")


def rollback(runner, state, confirm, verify_public):
    previous = state.rollback_target()
    sha = previous["RELEASE_SHA"]
    confirm(f"COMPATIBLE {sha}", "Confirm previous code is compatible with EVERY applied migration. "
            "If uncertain, stop for a reviewed forward fix or separately chosen restore.")
    images = {service: (previous[f"{service.upper()}_IMAGE"], previous[f"{service.upper()}_IMAGE_ID"])
              for service in ("api", "web")}
    verify_image_ids(runner, sha, images)
    # Do not build, migrate, or operate PostgreSQL during application rollback.
    runner.compose(sha, ["stop", "web", "api"])
    start_application(runner, sha)
    internal_verify(runner, sha, images, migration=False)
    poll_id = verify_public(sha)
    internal_verify(runner, sha, images, migration=False)
    restored = {**previous, "DEPLOYED_AT": timestamp(), "SMOKE_POLL_ID": poll_id}
    # Keep previous pointing at the confirmed compatible release. Never offer a
    # failed candidate as the next rollback target.
    state.promote(restored)
    print(f"Application rollback to {sha} passed smoke; database unchanged")
