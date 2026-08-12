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
7. Finish iteration with a release

---

## Definition of Done (DoD)

A task or iteration is considered done when:

- implementation is merged to `main`
- CI is green (format, lint, typecheck, tests, build)
- tests are added/updated for changed behavior
- manual testing is completed
- related documentation is updated (including `docs/backlog.md`)
- deployment works correctly

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

- merge to `main` triggers automatic deployment
- each merge should be production-ready
- releases are tagged manually

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

Human review is required for important decisions.
