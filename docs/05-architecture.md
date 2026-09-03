# Architecture

## Monorepo

The project uses a monorepo structure managed with **pnpm workspaces**.

Goals:

- keep frontend and backend together
- simplify development
- share types and contracts
- simplify CI/CD

---

## Applications

### apps/web

Frontend application.

Responsibilities:

- poll creation UI
- voting UI
- results UI

Tech (initial):

- React
- TypeScript
- Vite
- Tailwind CSS

---

### apps/api

Backend application.

Responsibilities:

- store polls
- store ballots
- calculate results
- expose HTTP API

Tech (initial):

- Node.js
- TypeScript
- NestJS
- Prisma

---

## Shared Package

### packages/shared

Shared types and contracts.

Examples:

- DTOs
- enums
- validation constants
- API contracts

The package is built **twice** — CommonJS for the NestJS API to `require`, ESM
for Vite and the browser to `import` — and its `exports` map routes each
consumer to the matching half. This is load-bearing, not incidental: a
CommonJS-only build renders a blank web app under `pnpm dev`. See the
"Shared Package Build" decision in `docs/06-decisions.md`.

---

## Backend Structure

The backend follows a simplified layered architecture.

```txt
apps/api/src/
  domain/
  application/
  infrastructure/
  presentation/
```

Current layer dependencies:

- `domain/` — pure functions (Borda count, strict-ranking validation). No
  framework, no ORM, no HTTP.
- `application/` — services that orchestrate a use case, plus a **mapper** per
  feature that turns persisted rows into shared DTOs.
- `infrastructure/` — `PrismaService`, exported by a `@Global()` module.
- `presentation/` — controllers and `class-validator` DTOs that `implement` the
  shared DTOs. Input validation lives only here, at the edge.

Two implementation details are worth recording because contributors need to
understand the code that exists today:

- **There is currently no repository abstraction.** Application services inject
  `PrismaService` and issue Prisma queries directly. Each mapper declares its
  own structural interface (`PersistedPoll`, `PersistedBallot`, …), which keeps
  Prisma-generated types out of shared DTOs and callers. This describes the
  current MVP coupling; it is not a rule that repository abstractions are
  forbidden if a future change gives them a concrete benefit.
- **Runtime configuration is shared with the tests.** Prefix, `ValidationPipe`
  and CORS are applied by `configureApp` in `src/app.setup.ts`, which both
  `main.ts` and the e2e suite call, so the tests exercise what production runs.

---

## Frontend Structure

Frontend is feature-oriented.

```txt
apps/web/src/
  features/
  shared/
  pages/
```

---

## Storage

Current implementation:

- SQLite (via Prisma)

Accepted production target:

- PostgreSQL (via Prisma)
- PostgreSQL container on the application VPS
- persistent storage independent of the container lifecycle
- offsite backups outside the VPS and DigitalOcean

The PostgreSQL migration is backlog item #17 and must land before the first
deployment. See `docs/06-decisions.md` for the hosting and staged-backup decision
and `docs/10-storage.md` for storage, backup, and recovery requirements.

---

## Future Extensions

Possible future additions:

- PWA
- native mobile app
- multiple counting engines
- real-time updates
