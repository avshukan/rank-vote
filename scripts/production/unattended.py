"""The tag-triggered release (ID-42): the non-interactive path of the CLI.

The forced-command wrapper (`deploy/rank-vote-release`) starts it after the
owner's `production` approval. It reuses the manual deployment and asks
nothing: the approval replaces the typed confirmations, and the
first-deployment operator checks stay with `make prod-deploy`. Its standard
output reaches the public Actions log, so it prints only curated status lines;
everything else, the host audit included, goes to a root-only diagnostics file.
"""

import contextlib
import os
import sys
import traceback

from .core import (CommandFailed, Refused, ReleaseState, private_path, read_config, redact,
                   release_plan, require, validate_release_tag, validate_sha)
from .probe import automated_public_verification
from .release import deploy, timestamp
from .runtime import check_source, preflight

STAGES = {
    "images": "Building and checking images; the running release stays untouched until they pass",
    "stopping": "Stopping web and API; PostgreSQL keeps running",
    "migrating": "Running the migration once",
    "starting": "Starting API, then web",
    "verifying": "Verifying internally and through the public origin",
}

UNCHANGED = "Nothing changed: production still runs the last verified release."


def outcome(stage, current):
    """The state a failure leaves and the next step, by the stage it reached."""
    if stage == "checks" or stage == "images":
        return UNCHANGED, "Fix the cause, then re-run this workflow run (same tag and SHA)."
    if stage == "plan":
        return UNCHANGED, ("This tag cannot be released. Release tags are immutable, so prepare a new release; "
                           "going back to an earlier release is make prod-rollback.")
    if stage in ("stopping", "migrating"):
        return ("Web and API may be stopped and PostgreSQL keeps running; nothing was rolled back. A failed "
                "migration left its redacted log in deploy-state.",
                "Owner-operated recovery: read the diagnostics before anything else and never re-run blindly; then "
                "release a forward fix as a new patch tag, or run make prod-rollback if the previous release is "
                "compatible with every applied migration.")
    label = f"{current['RELEASE_TAG'] or 'untagged'} at {current['RELEASE_SHA']}" if current else "the last verified release"
    return (f"current.env still names {label}; the candidate may be running unverified, and nothing was rolled back.",
            "Owner-operated recovery: make prod-rollback (with its COMPATIBLE confirmation) or a forward fix released "
            "as a new patch tag. Re-run this tag only when the cause was transient.")


def curated(error):
    # Raw tool output (build logs, Compose errors) stays in the diagnostics.
    if isinstance(error, CommandFailed):
        return error.summary
    if isinstance(error, Refused):
        return str(error)
    return "unexpected error"


def is_ancestor(runner, older, newer):
    result = runner.run(["git", "merge-base", "--is-ancestor", older, newer], allow_failure=True)
    require(result.returncode in (0, 1), "Could not compare the release with the current release")
    return result.returncode == 0


def run_release(runner, state_dir, tag, sha, status, progress):
    status(f"Checking source, configuration and host for {tag} at {sha}")
    runner.config = read_config()
    check_source(runner, sha)
    runner.model(sha)
    require(runner.text(["git", "cat-file", "-t", "refs/tags/" + tag]) == "tag" and
            runner.text(["git", "rev-parse", "refs/tags/" + tag + "^{commit}"]) == sha,
            f"{tag} must be an annotated tag on {sha}")
    state = ReleaseState(state_dir)
    for name in ("current", "previous"):
        path = state_dir / f"{name}.env"
        if path.exists():
            private_path(path, 0o600)
            state.read(name)
    current = progress["current"] = state.read("current")
    progress["stage"] = "plan"
    if release_plan(current, tag, sha, lambda older, newer: is_ancestor(runner, older, newer)) == "current":
        # Nothing is built, stopped, prepared, migrated or written.
        status(f"Already current: {tag} at {sha} is the verified release; nothing was deployed")
        return
    progress["stage"] = "checks"
    preflight(runner)

    def stage(name):
        progress["stage"] = name
        status(STAGES[name])

    candidate = deploy(runner, state, sha, lambda selected: automated_public_verification(current["SMOKE_POLL_ID"]),
                       release_tag=tag, progress=stage)
    status(f"Verified: {tag} at {sha} is the current release; smoke poll {candidate['SMOKE_POLL_ID']}")


def release(runner, tag, sha, state_dir, public=None):
    """Run one release and return its exit status. Reads no input."""
    public = public or sys.stdout

    def status(line):
        print(line, file=public, flush=True)

    validate_release_tag(tag)
    validate_sha(sha)
    require(state_dir.is_dir(), "No release state exists; the first deployment stays manual (make prod-deploy)")
    private_path(state_dir, 0o700, directory=True)
    log = state_dir / ("release-" + tag + "-" + timestamp().replace(":", "") + ".log")
    progress = {"stage": "checks", "current": None}
    descriptor = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as diagnostics, contextlib.redirect_stdout(diagnostics), \
            contextlib.redirect_stderr(diagnostics):
        try:
            run_release(runner, state_dir, tag, sha, status, progress)
            return 0
        except Exception as error:  # Every failure is reported; nothing is retried or rolled back.
            print(redact(traceback.format_exc(), runner.config), file=diagnostics)
            state, step = outcome(progress["stage"], progress["current"])
            status("Release failed: " + curated(error))
            status("State: " + state)
            status("Next step: " + step)
            status(f"Diagnostics (root-only): {log}")
            return 1
