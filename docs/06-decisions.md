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

| App       | Platform      | Notes                             |
| --------- | ------------- | --------------------------------- |
| `apps/web` | Vercel        | static/SSR React, free tier       |
| `apps/api` | Railway       | Node.js Docker deploy, free tier  |
| Database  | SQLite file   | stored on the api host filesystem |

Notes:
- no Kubernetes, no Redis, no managed DB in MVP
- migration to managed PostgreSQL (e.g. Neon or Railway Postgres) after MVP if needed

---



### SQLite + Prisma

Status:
- accepted

Reason:
- zero-ops setup for MVP
- full TypeScript type safety via Prisma
- easy migration to PostgreSQL in the future

See `docs/10-storage.md` for schema details.

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



MVP principles:
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
