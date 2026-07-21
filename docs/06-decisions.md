# Decisions

## Repository

### Monorepo

Status:

- accepted

Reason:

- simpler MVP development
- shared documentation
- easier CI/CD
- easier type sharing
- easier future expansion

---

## Applications

Initial applications:

- apps/web
- apps/api

Possible future applications:

- apps/mobile

---

## Frontend

Initial stack:

- React
- TypeScript
- Vite
- Tailwind CSS

Reason:

- fast MVP development
- large ecosystem
- good AI tooling support
- Tailwind CSS: utility-first, no design system dependency, fast to iterate in MVP
- shadcn/ui and a full component library are deferred; plain Tailwind is sufficient for MVP

---

## Backend

Initial stack:

- Node.js
- TypeScript
- NestJS
- Prisma

Reason:

- existing experience
- shared language across frontend/backend
- good ecosystem
- NestJS provides structured architecture aligned with layered backend design
- Prisma provides type-safe database access and easy migrations

---

## Package Manager

### pnpm

Status:

- accepted

Reason:

- efficient disk usage via symlinked node_modules
- native monorepo workspace support (`pnpm workspaces`)
- faster installs than npm
- stricter dependency resolution (avoids phantom dependencies)

---

## Monorepo Tool

### pnpm Workspaces

Status:

- accepted

Reason:

- sufficient for MVP without extra tooling overhead
- native to pnpm; no additional dependency required
- Turborepo can be added later if build orchestration becomes a bottleneck

---

## Deployment

MVP deployment targets:

| App        | Platform                     | Notes                 |
| ---------- | ---------------------------- | --------------------- |
| `apps/web` | Docker image (nginx, static) | separately scalable   |
| `apps/api` | Docker image (Node.js)       | separately scalable   |
| Database   | Neon (managed PostgreSQL)    | serverless, free tier |

Notes:

- no Kubernetes, no Redis in MVP

---

## Containerization

### Docker, separate images per app

Status:

- accepted

Chosen:

- one image per app (`web`: nginx serving the static build; `api`: Node.js),
  orchestrated with `docker-compose`
- introduced **just before the first deploy**, not during early development

Reason:

- separate images give **independent scaling** of web and api
- for this stack `pnpm dev` is enough locally, so early containers only slow
  iteration; dockerizing a settled structure is cheaper and less churn
- `docker-compose` also runs Postgres locally → dev/prod parity for free

Rejected:

- single combined image (api also serving the frontend) — simpler to operate but
  couples web and api scaling, which contradicts the scaling goal

---

## Storage

### PostgreSQL + Prisma

Status:

- accepted (supersedes the earlier SQLite decision below)

Chosen:

- PostgreSQL as the database, accessed via Prisma
- migrate **now**, before the first deploy while there is no production data

Reason:

- SQLite is a single-writer file → it cannot back multiple `api` replicas, which
  breaks the independent-scaling goal (see Containerization / Deployment)
- the cheapest moment to migrate a stateful DB is with **zero data**; migrating
  later under live data is a separate, risky project
- Prisma keeps the swap small: change `provider`, regenerate migrations

### SQLite + Prisma (superseded)

Status:

- superseded by PostgreSQL

Reason (historical):

- zero-ops setup for the initial MVP
- full TypeScript type safety via Prisma
- was chosen for easy future migration to PostgreSQL — that future is now

See `docs/10-storage.md` for schema details.

---

## Database Hosting

### Neon (managed PostgreSQL)

Status:

- accepted

Chosen:

- Neon serverless Postgres for production; local Postgres container for dev

Reason:

- MVP has **no authentication** (see MVP Principles), so a BaaS platform's
  batteries (auth/realtime/storage) add no value — a plain Postgres is the fit,
  and Neon is exactly that with no platform baggage
- scale-to-zero that **auto-resumes** on the first query (no manual un-pausing),
  which suits a low-traffic hobby app
- DB branching gives cheap dev/preview parity

Rejected:

- Supabase — great product, but its value is the BaaS layer we do not use; its
  free tier also pauses after ~1 week idle and needs manual waking
- self-hosted Postgres — full control, but volume/backups become our problem

---

## Duplicate Vote Protection

### localStorage

Status:

- accepted

Reason:

- client-side only, no server state required
- simpler than cookies
- acceptable soft protection for anonymous MVP

Implementation: store voted poll IDs in `localStorage` key `voted_poll_ids`.

---

## MVP Principles

- minimal feature set
- fast delivery
- anonymous usage
- no authentication

---

## Voting Model

The system separates:

- ballot format
- counting method

Reason:

- allows multiple counting strategies
- supports future extensibility

---

## Ballot Format

Initial supported format:

- STRICT_RANKING

Future possible formats:

- RANKING_WITH_TIES
- PARTIAL_RANKING
- PAIRWISE

---

## Counting Methods

Initial supported method:

- BORDA

Future possible methods:

- IRV
- CONDORCET
- SCHULZE
- RANKED_PAIRS

---

## Mobile Strategy

Initial strategy:

- responsive web app
- possible PWA support later

Native mobile app is deferred.

---

## Frontend Routing

### react-router-dom

Status:

- accepted

Reason:

- de-facto standard for React SPAs
- v7 supports file-based routing for future upgrade path
- required for `/`, `/poll/:id`, `/poll/:id/results` routes

---

## Drag-and-Drop

### @dnd-kit/core

Status:

- accepted

Reason:

- lightweight, accessible, React-native
- no jQuery or external DOM dependency
- required for the ranked-ballot UI (drag & drop ranking)

---

## Agent Instructions

### Single canonical AGENTS.md

Status:

- accepted

Chosen:

- one canonical `AGENTS.md` at the repo root (open standard; read natively by
  Codex, Copilot coding agent, and Copilot code review)
- `CLAUDE.md` is a one-line `@AGENTS.md` import shim for Claude Code

Rejected:

- per-tool instruction files (`.github/copilot-instructions.md`, standalone
  `CLAUDE.md`) — duplicated content drifts
- symlink instead of import shim — poor Windows/portability story

See `docs/12-ai-first.md` for the wider AI-first strategy.

---

## Backlog

### Backlog-as-code

Status:

- accepted

Chosen:

- `docs/backlog.md` is the single source of truth for work items
- GitHub Issues are an ephemeral surface for launching agents, not a store
- a PR completing an item updates `docs/backlog.md` in the same PR (part of DoD)

Rejected:

- GitHub Issues/Projects as the backlog store — moves the source of truth out
  of the repository and drifts from the docs
