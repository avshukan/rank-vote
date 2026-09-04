# Implementation Plan

## Overview

Build a monorepo web app that lets small groups create a ranked-choice poll, vote via drag-and-drop, and see a Borda-count winner — all without registration.

See `docs/01-mvp-scope.md` for scope constraints and `docs/07-process.md` for process rules.

Iteration planning is done flexibly per Agile principles. Current priorities are tracked in `docs/backlog.md`.

---

## Phase 0 — Monorepo Scaffold

**Status:** shipped.

**Goal:** Working skeleton, tooling ready.

- Initialize `pnpm` workspace at the repo root (`pnpm-workspace.yaml`, root `package.json`)
- Create three workspace packages:
  - `apps/web` — React + Vite + TypeScript + Tailwind CSS
  - `apps/api` — NestJS + TypeScript
  - `packages/shared` — plain TypeScript package (types, DTOs, enums)
- Add root-level scripts: `dev`, `build`, `test`, `lint`
- Configure TypeScript project references across all three packages
- Set up ESLint + Prettier at the root, shared config inherited by all packages

---

## Phase 1 — Shared Package (`packages/shared`)

**Status:** shipped.

**Goal:** Single source of truth for types used by both frontend and backend.

- Define enums: `BallotFormat`, `CountingMethod`
- Define DTOs matching the API contract:
  - `CreatePollDto` / `PollResponseDto` (also the `GET /polls/:id` response)
  - `PollOptionDto`
  - `SubmitBallotDto` / `BallotResponseDto`, with `BallotEntryDto`
  - `PollResultsResponseDto`, with `PollScoreDto`
- Export validation constants (min/max options count: 2–10)

---

## Phase 2 — Backend (`apps/api`)

**Status:** shipped on PostgreSQL.

**Goal:** All four API endpoints working with PostgreSQL + Prisma.

### 2.1 Database Layer

- Create Prisma schema from `docs/10-storage.md`: `Poll`, `PollOption`, `Ballot`, `BallotEntry`
- Run initial migration (`prisma migrate dev`)
- Configure `DATABASE_URL` via `.env`

### 2.2 Domain Layer (`src/domain/`)

- Implement `calculateBorda` (pure function, `domain/result/borda.ts`):
  - For N options, rank 1 → N−1 points, rank 2 → N−2 points, …, last → 0 points
  - Output: options sorted by total score, winners identified (all leaders on a tie)
- Implement ballot validator:
  - All poll options must be present
  - Ranks are unique consecutive integers starting from 1

### 2.3 Application Layer (`src/application/`)

- `PollService`:
  - `createPoll(dto)` → creates Poll + PollOptions, returns full poll DTO
  - `getPoll(id)` → returns poll with options or throws `NotFoundException`
- `BallotService`:
  - `submitBallot(pollId, dto)` → validates, persists ballot + entries, returns ballot DTO
- `ResultService`:
  - `getResults(pollId)` → loads all ballots, runs Borda count, returns results DTO

### 2.4 Presentation Layer (`src/presentation/`)

- `PollsController`:
  - `POST /api/v1/polls`
  - `GET /api/v1/polls/:id`
  - `POST /api/v1/polls/:id/ballots`
  - `GET /api/v1/polls/:id/results`
- Input validation via `class-validator` + NestJS `ValidationPipe`
- No custom exception filter: Nest's built-in `NotFoundException` /
  `BadRequestException` already produce the error shape documented in
  `docs/09-api-design.md`
- CORS origin configured via env var

### 2.5 Tests

- **Unit**: `BordaCount` algorithm, ballot validator (`*.spec.ts` co-located)
- **Integration**: all four endpoints against the isolated `rank_vote_test`
  PostgreSQL database + Supertest (`apps/api/test/`); see
  `docs/11-testing-strategy.md`

---

## Phase 3 — Frontend (`apps/web`)

**Status:** shipped. Full mobile layout is backlog #6.

**Goal:** Three usable pages; no registration required.

### 3.1 Routing

- `/` → Create Poll page
- `/poll/:id` → Vote page (or Results if already voted)
- `/poll/:id/results` → Results page

### 3.2 Create Poll Page (`features/create-poll/`)

- Title field + dynamic option fields (add/remove, 2–10 options enforced)
- On submit: `POST /api/v1/polls`
- On success: display shareable link + redirect or copy to clipboard

### 3.3 Vote Page (`features/vote/`)

- On load: check `localStorage` key `voted_poll_ids` — if poll ID present, redirect to Results
- Fetch poll via `GET /api/v1/polls/:id`
- Drag-and-drop ranking list (all options must be ordered)
- The list starts in the poll's option order, so the ballot is complete from the
  first render and the submit button never has to be disabled
- On success: store poll ID in `localStorage`, redirect to Results

### 3.4 Results Page (`features/results/`)

- Fetch results via `GET /api/v1/polls/:id/results`
- Winner banner + score table sorted by score descending
- Show `totalBallots` count
- Zero-ballot state: "No votes yet" message

### 3.5 Shared (`shared/`)

- API client (thin `fetch` wrapper pointing at `VITE_API_URL`)
- Loading and error states
- Basic responsive layout using Tailwind utility classes

### 3.6 Tests

- **Unit**: score-formatting helpers, rank-sort utilities (Vitest)
- **Component**: ranking form renders options and submits them in the displayed
  order; the list starts complete, so submit is never disabled (Vitest + RTL)

---

## Phase 4 — Integration & Local Dev

**Status:** shipped.

- Root `dev` script runs `apps/api` and `apps/web` concurrently
- Verify end-to-end flow: create → share → vote → results
- Ensure CORS, `VITE_API_URL`, and Prisma client generation are wired correctly

---

## Phase 5 — Deployment & Recovery

**Status:** PostgreSQL migration and application containerization shipped;
production deployment has not started. The remaining path is #31 (write rate
limiting), #29 (first production deploy), #28 (manual offsite backup/restore),
then #32 (automated offsite backups).

| App        | Platform                     | Notes                                     |
| ---------- | ---------------------------- | ----------------------------------------- |
| `apps/web` | Docker image (nginx, static) | Application VPS; set `VITE_API_URL`       |
| `apps/api` | Docker image (Node.js)       | Application VPS; set API environment vars |
| Database   | PostgreSQL container         | Same VPS; persistent volume               |

- PostgreSQL migration (#17) is complete: the database-only local Compose file
  and `make db-up` provision separate development and `rank_vote_test`
  databases, e2e resets only the test schema, and CI supplies PostgreSQL
- Separate multi-stage Docker images for `apps/web` and `apps/api` build
  from the workspace root so both consumers receive the correct half of
  `@rank-vote/shared`
- The nginx-served web bundle requires build-time `VITE_API_URL` (local
  Compose supplies the development value; #29 supplies production)
- The #17 Compose stack now includes `migrate`, `api` and `web`; API startup is
  gated on healthy PostgreSQL plus successful `prisma migrate deploy`
- Process-only `GET /api/v1/health` provides container liveness;
  dependency-aware health and external monitoring stay in #33
- CI and `make container-smoke` prove both clean image builds and the complete
  local container flow
- Implement #31's independent in-memory fixed-window limits: 5 poll creations
  and 300 ballot submissions per client IP per 60 minutes
- Configure application environment variables on the VPS; keep forwarding
  headers untrusted until #29 places the API behind one trusted proxy hop and
  blocks direct access
- Run one API replica for the first deployment; shared limiter state before
  horizontal scaling is #34
- Perform the first production deployment
- Immediately prove recovery with a manual logical dump copied outside
  DigitalOcean and restored into clean PostgreSQL
- Then automate scheduled offsite backups to independent object storage with a
  documented retention and restore-test policy

Dependency-aware health, production monitoring/alerting and error tracking are
tracked separately as #33.

See `docs/06-decisions.md` for the accepted deployment and database-hosting
decisions, and `docs/10-storage.md` for the staged backup and recovery plan.

---

## Key Constraints

- Poll options: 2–10
- Ballot must include **all** options with unique consecutive ranks starting at 1
- All IDs are UUIDs; timestamps are ISO 8601 UTC
- No authentication, no editing after creation, no real-time updates
- Borda formula: option at rank `r` out of `N` options → `N − r` points
