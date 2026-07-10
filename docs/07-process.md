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

1. Maintain a single backlog in `docs/backlog.md`
2. Before implementation, create an iteration plan in `docs/iterations/`
3. Pick a small stable scope for the iteration
4. Implement features as vertical slices
5. Merge changes to `main` via PR
6. Each merge should be production-ready
7. Finish iteration with a release

---

## Definition of Done (DoD)

A task or iteration is considered done when:

- implementation is merged to `main`
- application builds successfully
- manual testing is completed
- related documentation is updated
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

AI tools are part of the workflow.

Examples:

- brainstorming
- scaffolding
- refactoring
- test generation
- documentation support

Human review is required for important decisions.
