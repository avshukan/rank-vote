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

Reason:
- fast MVP development
- large ecosystem
- good AI tooling support

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

## Storage

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
