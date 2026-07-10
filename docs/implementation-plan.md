# Implementation Plan

## Overview

Build a monorepo web app that lets small groups create a ranked-choice poll, vote via drag-and-drop, and see a Borda-count winner — all without registration.

See `docs/01-mvp-scope.md` for scope constraints and `docs/07-process.md` for process rules.

Iteration planning is done flexibly per Agile principles. Current priorities are tracked in `docs/backlog.md`.

---

## Phase 0 — Monorepo Scaffold

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

**Goal:** Single source of truth for types used by both frontend and backend.

- Define enums: `BallotFormat`, `CountingMethod`
- Define DTOs matching the API contract:
  - `CreatePollDto` / `CreatePollResponseDto`
  - `GetPollResponseDto`
  - `SubmitBallotDto` / `SubmitBallotResponseDto`
  - `GetResultsResponseDto`
- Export validation constants (min/max options count: 2–10)

---

## Phase 2 — Backend (`apps/api`)

**Goal:** All four API endpoints working with SQLite + Prisma.

### 2.1 Database Layer

- Create Prisma schema from `docs/10-storage.md`: `Poll`, `PollOption`, `Ballot`, `BallotEntry`
- Run initial migration (`prisma migrate dev`)
- Configure `DATABASE_URL` via `.env`

### 2.2 Domain Layer (`src/domain/`)

- Implement `BordaCount` service:
  - For N options, rank 1 → N−1 points, rank 2 → N−2 points, …, last → 0 points
  - Output: options sorted by total score, winner identified
- Implement ballot validator:
  - All poll options must be present
  - Ranks are unique consecutive integers starting from 1

### 2.3 Application Layer (`src/application/`)

- `PollService`:
  - `createPoll(dto)` → creates Poll + PollOptions, returns full poll DTO
  - `getPoll(id)` → returns poll with options or throws `NotFoundException`
- `BallotService`:
  - `submitBallot(pollId, dto)` → validates, persists ballot + entries, returns ballot DTO
  - `getResults(pollId)` → loads all ballots, runs Borda count, returns results DTO

### 2.4 Presentation Layer (`src/presentation/`)

- `PollsController`:
  - `POST /api/v1/polls`
  - `GET /api/v1/polls/:id`
  - `POST /api/v1/polls/:id/ballots`
  - `GET /api/v1/polls/:id/results`
- Input validation via `class-validator` + NestJS `ValidationPipe`
- Global exception filter for 400/404 responses
- CORS origin configured via env var

### 2.5 Tests

- **Unit**: `BordaCount` algorithm, ballot validator (`*.spec.ts` co-located)
- **Integration**: all four endpoints with in-memory SQLite + Supertest (`apps/api/test/`)

---

## Phase 3 — Frontend (`apps/web`)

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
- Submit button enabled only when all options have been ranked
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
- **Component**: ranking form renders options; submit disabled until full ranking (Vitest + RTL)

---

## Phase 4 — Integration & Local Dev

- Root `dev` script runs `apps/api` and `apps/web` concurrently
- Verify end-to-end flow: create → share → vote → results
- Ensure CORS, `VITE_API_URL`, and Prisma client generation are wired correctly

---

## Phase 5 — Deployment

| App        | Platform               | Notes                                            |
| ---------- | ---------------------- | ------------------------------------------------ |
| `apps/web` | Vercel                 | Set `VITE_API_URL` env var; SPA routing fallback |
| `apps/api` | Railway                | Set `DATABASE_URL`, `CORS_ORIGIN`; Dockerfile    |
| Database   | SQLite on Railway host | Path defined in `DATABASE_URL`                   |

- Add `Dockerfile` for `apps/api` (multi-stage Node.js build)
- Add `vercel.json` for `apps/web` (SPA fallback route)
- Configure env vars in each platform's dashboard

---

## Key Constraints

- Poll options: 2–10
- Ballot must include **all** options with unique consecutive ranks starting at 1
- All IDs are UUIDs; timestamps are ISO 8601 UTC
- No authentication, no editing after creation, no real-time updates
- Borda formula: option at rank `r` out of `N` options → `N − r` points
