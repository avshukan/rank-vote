# Process

We follow **Incremental Delivery**.

---

## Terms

### Vertical Slice

One end-to-end feature that includes:

- domain logic
- backend
- frontend
- integration
- basic testing

and is usable by the user.

---

### Release

A deployed increment with:

- git tag
- changelog update

Versioning follows SemVer.

The first verified release is tagged `v0.1.0` at
`7021f3137b597119e39ca13e6a86275da58b28e1` and recorded in `CHANGELOG.md`; its
runtime evidence is under #29 in `docs/acceptance-criteria.md`. See
`docs/production.md` for the reviewed tooling and operator sequence.

---

## Principles

- keep MVP minimal
- prefer simplicity over completeness
- avoid premature optimization
- deliver working software frequently
- documentation is part of development

---

## How We Work

1. Maintain a single backlog in `docs/backlog.md` — it is the source of truth.
   Raw ideas arrive as GitHub Issues and reach it through triage, the owner's
   decision and backlog promotion (see its `Workflow` section)
2. Pull work continuously, without fixed-length iterations:
   pick → readiness if needed → work → merge → pick again
3. Pick the next item, usually a `Ready` one. If it still needs readiness, agree
   scope in `docs/acceptance-criteria.md` **before** starting the work — the PR
   description then refers to those criteria instead of restating them. Keep a
   small `Ready` pool: when picking a `Ready` item leaves fewer than 2 others,
   whoever picked it requests a backlog sweep (the exact rule and command are in
   `AGENTS.md`, Process Rules)
4. Implement features as vertical slices, sized to fit one agent session
5. Merge changes to `main` via PR; the PR updates `docs/backlog.md` for the items it completes
6. Keep `Todo` current with backlog sweeps. A sweep is requested on the
   `backlog-sweep` tracker Issue — by the `Ready` pool rule, after a verified
   production release, and by a weekly check about 60 days after the last
   sweep. It runs with the `backlog-sweep` skill, which only recommends; the
   owner decides, the approved changes land as a reviewed docs PR, and the
   owner closes the tracker
7. Each merge should be production-ready; cut a release when there is something
   to release

---

## Definition of Done (DoD)

A task is considered done when:

- the PR has passed code review
- implementation is merged to `main`
- CI is green (format, lint, typecheck, tests, build) — `make verify` runs the
  same steps in the same order locally
- tests are added/updated for changed behavior
- manual testing is completed
- related documentation is updated (including `docs/backlog.md`)
- the change is production-ready

`AGENTS.md` restates this list as the agent-facing checklist, and
`.github/pull_request_template.md` carries the part an author can tick before
review. They repeat each other on purpose — a change here belongs in both.

---

## Branch Strategy

We use trunk-based development.

Rules:

- short-lived branches
- squash merge preferred
- no release branches

Examples:

- feat/create-poll
- feat/borda-count
- fix/mobile-layout

---

## CI/CD

- CI (`.github/workflows/ci.yml`) runs on every PR and on pushes to `main`:
  the `checks` job runs format, lint, typecheck, test and build; the `containers`
  job builds both application images, smoke-tests the local Compose stack and
  runs `make prod-check` plus the separate isolated `make prod-smoke`
- the active `protect-main` ruleset requires both `checks` and `containers`;
  the owner-authorized setting update for #29 was applied on 2026-09-16
- Issue triage (`.github/workflows/issue-triage.md`, a GitHub Agentic Workflow
  compiled to `issue-triage.lock.yml`) posts one recommend-only comment on each
  eligible newly opened Issue and changes nothing else. It is not a required
  check. It needs the owner-managed `COPILOT_GITHUB_TOKEN` repository secret,
  created as described in the gh-aw
  [authentication docs](https://github.github.com/gh-aw/reference/auth/)
- Backlog promotion (`.github/workflows/backlog-promotion.yml`, a plain,
  deterministic workflow) runs when a repository admin applies the
  `triage: accepted` label. It turns the accepted recommendation into `Todo`
  rows on a `docs/backlog-promote-<issue>` branch and opens a pull request that
  closes the Issue on merge; it never merges. It uses the built-in
  `GITHUB_TOKEN`, so it needs the owner-managed repository setting **Allow
  GitHub Actions to create and approve pull requests**, and CI on its pull
  requests starts once someone with write access selects **Approve workflows to
  run**. It is not a required check
- Backlog sweep request (`.github/workflows/backlog-sweep.yml`, a plain,
  deterministic workflow) is the one entry point for requesting a sweep:
  `workflow_dispatch` with a required `reason`, plus a weekly, best-effort check
  that requests one about 60 days after the tracker was last closed. It reopens
  or comments on the one Issue labelled `backlog-sweep`. The first explicit
  request creates the label and the Issue; until then the weekly check does
  nothing. It never runs the sweep or closes the tracker. It uses the built-in `GITHUB_TOKEN` and is not a required check.
  GitHub disables scheduled workflows in a public repository after 60 days
  without repository activity, and they stay off until someone re-enables them
  from the Actions tab; no external scheduler backs this up
- **Temporary scheduled end-to-end test of the backlog sweep request:** the
  periodic check currently runs daily (`17 6 * * *`) with a 2-day interval
  (`PERIODIC_DAYS` in `scripts/backlog-sweep.mjs`), to see a scheduled run
  reopen the closed tracker and record the periodic reason. Once one has, revert
  to weekly (`17 6 * * 1`) and 60 days, and delete this note. The decision and
  its criteria stay weekly and 60 days
- **Tagged releases (ID-42).** A merge never deploys. Prepare release
  (`.github/workflows/prepare-release.yml`, run by the owner with a version)
  opens one release-prep pull request that adds the `CHANGELOG.md` entry; it
  never tags or deploys. After the owner merges it, the owner pushes an
  annotated `vX.Y.Z` tag on exactly its merge commit. That starts Release
  (`.github/workflows/release.yml`): a job without secrets validates the tag,
  the merge commit and its successful `main` push CI run; the deploy job then
  waits for the owner's approval in the `production` Environment and runs the
  unattended release on the VPS through a restricted SSH key; and only after
  the release is verified, a separate job requests a backlog sweep through the
  same `workflow_dispatch` entry point with the release tag and full SHA as the
  reason. A tag push itself never requests a sweep. Neither workflow is a
  required check; `docs/production.md` (section 9) has the procedure and the
  owner's one-time setup
- each merge should be production-ready
- releases are tagged by the owner; `v0.1.0` was the first, tagged after a
  manual deployment

The owner-operated first release and the #28 manual offsite backup/restore
drill have completed, and #32 remains the next backup stage.

For the first production deployment (#29), the infrastructure/tooling PR was
reviewed and merged before the shared VPS was changed, and deployment used an
exact CI-green `main` SHA, `7021f31`, which also carried the follow-up fixes
#52 and #53. ID-29 moved to `Done` in a backlog sweep, and ID-40 recorded the
post-deployment evidence afterwards. The required #28 backup/restore drill
completed after the verified deployment without waiting for that record.

---

## Release Flow

1. Run **Prepare release** with the next version; it opens the release-prep pull
   request with the drafted `CHANGELOG.md` entry
2. Review and edit the entry, then merge the pull request; feature pull requests
   never edit the changelog
3. Push the annotated tag on exactly that merge commit, after its `main` push CI
   run passed; changes merged later need a new preparation
4. Approve the `production` deployment of the **Release** run; deployment,
   verification and the sweep request follow without operator input
5. A failed release is re-run with the same tag only for the same SHA; a code fix
   is a new patch release. Tags are never moved

### Versioning

SemVer:

- `v0.(x+1).0` — new features or visible increment
- `v0.x.(y+1)` — fixes and small improvements

Examples:

- v0.1.0
- v0.2.0
- v0.2.1

---

## AI Usage

AI agents are a primary part of the workflow: **Claude Code**, **OpenAI
Codex**, and **GitHub Copilot** (coding agent).

- `AGENTS.md` is the canonical instruction file for all agents; tool-specific
  files only point to it
- Agents follow the same Definition of Done and verification-first rule as
  humans; CI gates their work like anyone else's
- See `docs/12-ai-first.md` for the full AI-first strategy and tooling roadmap

Human review is required for important decisions, and every PR goes through
code review before it is merged — including PRs an agent opened. Agents take a
change as far as a pushed PR with green CI and then hand it over; the merge is a
human decision, and one merge is never standing permission for the next.
