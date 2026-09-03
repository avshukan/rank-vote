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

## Shared Package Build

### Dual CommonJS + ESM output from `packages/shared`

Status:

- accepted

Chosen:

- `packages/shared` compiles twice — CommonJS to `dist/`, ESM to `dist/esm/` —
  and its `exports` map routes `require` (the NestJS API) and `import` (Vite and
  the browser) to the matching half
- `dist/esm/package.json` carries `{"type":"module"}`, so Node reads that
  subtree as ESM rather than as CommonJS
- `packages/shared/src/dist-exports.test.ts` pins both halves down

Reason:

- Vite does not pre-bundle **linked** workspace packages, so a CommonJS-only
  `dist` reached the browser raw, every named import threw, and `#root` stayed
  empty under `pnpm dev` (backlog #21)
- the break was dev-server-only — `vite build` was always fine, because Rollup
  converts CommonJS itself — so neither the gate nor `make web` could catch it,
  which is why the guard is a test rather than the `verify-app` ritual
- the `require` condition still points at the artifacts that already existed,
  so the API resolves exactly what it resolved before

Rejected:

- `optimizeDeps.include` in `vite.config.ts` — a one-liner that does clear the
  blank page, but Vite then never re-optimizes the linked dep, so rebuilding
  `shared` in watch mode left the dev server serving **stale code with no
  warning** (measured: `MAX_OPTIONS` changed to `9` on disk while the server
  kept serving `10` across a full page reload). `pnpm dev` runs `shared` in
  watch mode precisely so its edits flow through, and silent staleness is a
  worse failure than the loud one it would replace
- a single ESM-only build — the API is CommonJS and `require`s the package

---

## Deployment

MVP deployment targets:

| App        | Platform                     | Notes                  |
| ---------- | ---------------------------- | ---------------------- |
| `apps/web` | Docker image (nginx, static) | separately scalable    |
| `apps/api` | Docker image (Node.js)       | separately scalable    |
| Database   | PostgreSQL container         | on the application VPS |

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

### Self-hosted PostgreSQL on the application VPS

Status:

- accepted (supersedes the Neon decision below)

Chosen:

- run PostgreSQL in Docker on the same DigitalOcean VPS as the application
- store database data in persistent storage / a Docker volume whose lifecycle
  is independent of the PostgreSQL container
- establish offsite recovery in stages: first a manual backup copied outside
  the VPS and DigitalOcean, then automated backups to independent object storage

Reason:

- minimizing recurring cost is the priority at the current, early stage
- sharing the application VPS avoids the cost of a managed database or a
  dedicated database VPS
- persistent storage keeps data across routine container replacement or
  recreation
- an offsite copy preserves a recovery path even after complete loss of the VPS,
  the DigitalOcean account, or DigitalOcean infrastructure

Consequences:

- the project owns PostgreSQL operations, including backup, restore, upgrades,
  monitoring, and recovery testing
- the application and database share a failure domain; persistent storage does
  not replace backups, and backups provide recovery rather than high availability
- the first production deployment is followed immediately by a manual
  `pg_dump`-style offsite copy and a restore drill (#28)
- once that recovery path is proven, scheduled backups move to independent
  object storage outside DigitalOcean (#32), with retention, RPO/RTO, encryption
  and failed-backup monitoring defined there

Evolution:

1. self-host PostgreSQL on the application VPS and prove manual offsite
   backup/restore immediately after the first deployment
2. automate scheduled offsite backups to independent object storage
3. when reliability requirements justify the cost, migrate to managed
   PostgreSQL from a provider separate from application hosting; keep
   independent backups

Rejected:

- a separate PostgreSQL VPS now — additional cost and operational complexity are
  not justified at the current scale
- multi-provider replication now — additional cost and complexity are not
  justified at the current scale

### Neon (managed PostgreSQL, superseded)

Status:

- superseded by self-hosted PostgreSQL on the application VPS

Reason (historical):

- managed operations and scale-to-zero suited a low-traffic early deployment
- a plain managed PostgreSQL service avoided an unused BaaS layer

Why superseded:

- minimizing recurring cost now takes precedence; managed PostgreSQL remains the
  planned next stage when reliability requirements grow

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
