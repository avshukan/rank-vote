# AGENTS.md

Instructions for AI agents working in this repository.

---

## Repository Overview

**rank-vote** is a monorepo web app for group decisions using ranked voting (Borda count).

Structure (planned):
```
apps/
  web/        # React + Vite + TypeScript + Tailwind CSS
  api/        # NestJS + TypeScript + Prisma + SQLite
packages/
  shared/     # Shared types, DTOs, enums, validation constants
docs/         # All project documentation
```

Package manager: **pnpm** with workspaces.

---

## Key Documentation

Read these files to understand the project before making changes:

| File | What it covers |
| ---- | -------------- |
| `docs/00-product.md` | Product vision and use cases |
| `docs/01-mvp-scope.md` | MVP features, constraints, out-of-scope |
| `docs/04-domain-model.md` | Core domain entities and enums |
| `docs/05-architecture.md` | Monorepo structure, tech stack, folder layout |
| `docs/06-decisions.md` | All architecture and technology decisions (ADRs) |
| `docs/09-api-design.md` | API endpoints, request/response shapes, constraints |
| `docs/10-storage.md` | Prisma schema, SQLite setup, duplicate vote protection |
| `docs/11-testing-strategy.md` | What to test, frameworks, coverage expectations |
| `docs/implementation-plan.md` | Phased implementation plan with all deliverables |
| `docs/backlog.md` | Prioritized backlog items |
| `docs/glossary.md` | Domain terminology |

---

## Development Commands

> Commands will be added here once the monorepo scaffold is in place.

```bash
# Install dependencies
pnpm install

# Run all apps in dev mode
pnpm dev

# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint all packages
pnpm lint
```

---

## Process Rules

- Follow **trunk-based development**: short-lived branches, squash merge to `main`
- Branch naming: `feat/<name>`, `fix/<name>`
- Each merged PR must be production-ready
- Iteration plans are flexible (Agile); see `docs/backlog.md` for current priorities
- Documentation is part of the Definition of Done — update relevant `docs/` files alongside code changes
- See `docs/07-process.md` for the full process definition

---

## Architecture Principles

- Backend follows a layered architecture: `domain/` → `application/` → `infrastructure/` → `presentation/`
- Frontend is feature-oriented: `features/` + `shared/` + `pages/`
- Shared types live in `packages/shared` — import from there, do not duplicate
- No authentication in MVP; all endpoints are public
- Counting method: **Borda count** (MVP only)
- Ballot format: **strict full ranking** (MVP only) — all options, no ties, ranks start at 1

---

## Key Constraints

- Poll options: 2–10
- Ballot entries must cover all options; ranks are unique consecutive integers starting at 1
- All IDs are UUIDs; timestamps are ISO 8601 UTC
- Borda formula: option at rank `r` out of `N` options → `N − r` points
- Duplicate vote protection: client-side only via `localStorage` key `voted_poll_ids`
