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

- PostgreSQL (via Prisma)
- complete local Compose stack, with `make db-up` retaining the
  PostgreSQL-only host-native development path
- separate `rank_vote` development and `rank_vote_test` e2e databases

Accepted production target:

- PostgreSQL container on the application VPS
- persistent storage independent of the container lifecycle
- offsite backups outside the VPS and DigitalOcean

Backlog #17 introduced the database-only Compose file and the fixed PostgreSQL
test database; CI provides PostgreSQL through its native service mechanism.
Backlog #27 added separate `web` and `api` images plus `migrate`, `api` and
`web` services to the Compose stack. See `docs/06-decisions.md` for the hosting
and staged-containerization decisions and `docs/10-storage.md` for storage,
testing, backup, and recovery requirements.

---

## Accepted Container Topology

Backlog #27 extended the local Compose model without replacing its
PostgreSQL contract:

```text
postgres (healthy) → migrate (completed) → api (healthy) → web
```

- `migrate` is a one-shot `prisma migrate deploy` job using the same image as
  `api`; migration is not part of each API replica's entrypoint
- `api` receives `DATABASE_URL`, `PORT` and `CORS_ORIGIN` at runtime and reaches
  PostgreSQL through `postgres:5432`
- `web` is a Vite static build served by nginx on container port `80` with SPA
  fallback; required `VITE_API_URL` is embedded at image build time
- the local stack publishes web/API/PostgreSQL as `5173`/`3000`/`5432`; #29
  decides production-facing ports, domain, TLS, secrets and release mechanics
- `/api/v1/health` proves API-process liveness only. Dependency-aware readiness,
  external monitoring and alerting remain #33

The web and API images stay separate and independently scalable. nginx does not
proxy API traffic, and no runtime frontend configuration layer is introduced.

### Accepted write-limiter boundary

Backlog #31 implemented per-client-IP, in-memory rate limits on the two
anonymous write routes. Forwarding headers remain untrusted by default. For the
first production deployment, #29 must place the API behind exactly one trusted
reverse proxy hop, block direct API access, configure that hop count explicitly
and run exactly one API replica. A restart may clear counters. Horizontal API
scaling requires #34 to replace the per-process counters with shared state; the
application images remain independently scalable once that follow-up lands.

---

## Future Extensions

Possible future additions:

- PWA
- native mobile app
- multiple counting engines
- real-time updates
