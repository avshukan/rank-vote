# Process

We follow **Incremental Delivery**.

---

## Terms

### Iteration

A short time-box (usually 1–2 weeks) with a fixed scope.

---

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

No release has been cut yet: there are no tags and no changelog file, because
nothing is deployed. Both start with the first production deployment
(backlog #29).

---

## Principles

- keep MVP minimal
- prefer simplicity over completeness
- avoid premature optimization
- deliver working software frequently
- documentation is part of development

---

## How We Work

1. Maintain a single backlog in `docs/backlog.md` — it is the source of truth
2. Pick the next item(s) from the backlog and agree scope in
   `docs/acceptance-criteria.md` **before** starting the work — the PR
   description then refers to those criteria instead of restating them
3. Pick a small stable scope for the iteration
4. Implement features as vertical slices, sized to fit one agent session
5. Merge changes to `main` via PR; the PR updates `docs/backlog.md` for the items it completes
6. Each merge should be production-ready
7. Finish iteration with a merged, production-ready increment; cut a release
   once deployment exists

---

## Definition of Done (DoD)

A task or iteration is considered done when:

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
  job builds both application images and smoke-tests an isolated Compose stack
- **CD does not exist yet.** Images are verified but are not pushed, deployed or
  released on merge. Write rate limiting (#31) is complete; the remaining
  first-deploy step is #29 (first production deployment), then recovery proceeds
  through #28 (manual offsite backup and restore drill) and #32 (automated
  offsite backups)
- each merge should be production-ready
- releases will be tagged manually once there is something to release

---

## Release Flow

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
