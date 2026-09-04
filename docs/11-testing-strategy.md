# Testing Strategy

## Principles

- test business logic thoroughly
- keep integration tests focused on API contracts
- avoid over-testing UI in MVP
- tests are part of the Definition of Done

---

## Backend

### Unit Tests

Target: domain and application layer logic.

What to test:

- Borda count calculation
- ballot validation (strict ranking, all options present)
- domain entities and value objects

Framework: Jest (built-in with NestJS)

Location: co-located with source files (`*.spec.ts`)

---

### Integration Tests

Target: HTTP API endpoints.

What to test:

- create poll: valid and invalid inputs
- submit ballot: valid and invalid inputs
- get results: with and without ballots

Framework: Jest + Supertest (NestJS testing utilities)

Location: `apps/api/test/`

Notes:

- local Compose provisions a fixed `rank_vote_test` database separate from the
  development database
- `apps/api/test/run-e2e.mjs` gives every e2e process an explicit test-only
  `DATABASE_URL`; it reads only `TEST_DATABASE_URL` (or its fixed local test
  default), validates that the database name is exactly `rank_vote_test`, and
  never falls back to the development URL
- before Jest starts, that runner executes `prisma db push --force-reset`, so
  consecutive runs cannot inherit state
- CI supplies the same PostgreSQL test database through a native service
- unit tests continue to mock Prisma and remain database-free

### Rate limiting

Backlog #31 adds API-level tests for both protected POST routes. Tests exercise
the first allowed requests and the first `429`, independent route buckets and
client IPs, counting of invalid attempts, fixed-window expiry, non-extension by
rejected attempts, and the `Retry-After`/Nest error contract. They also prove
that representative product GETs and `/api/v1/health` remain unthrottled.

Time and production limits are injected or otherwise controlled in tests; the
suite uses a fake clock and small test-only limits instead of waiting or sending
hundreds of requests. Proxy tests cover both the zero-trust default (a supplied
forwarding header cannot select a key) and the explicitly configured trusted-hop
mode.

---

## Frontend

### Unit Tests

Target: utility functions and result display logic.

What to test:

- position labels in the score table, including the tie form (`1-2`, `1-2`, `3`)
- `localStorage` helpers for duplicate-vote protection

The API returns `scores` already sorted (score DESC, then option order ASC), so
the frontend has no sorting or counting logic of its own to test — only how that
order is rendered.

Framework: Vitest (built-in with Vite)

Location: co-located with source files (`*.test.ts`)

---

### Component Tests

MVP: minimal component testing.

Focus:

- ranking form renders options correctly and submits them in the displayed order
  (the list starts in the poll's own option order, so a ballot is always complete
  and the submit button is never disabled)
- results page renders winner, score table and the zero-ballot state
- loading and error/retry states of pages that fetch

Framework: Vitest + React Testing Library

---

## Repository Tooling

Node helpers under `scripts/` use the built-in `node:test` runner with
co-located `*.test.mjs` files. The root `pnpm test` runs these before the
workspace Jest and Vitest suites.

Manual browser helpers such as `make render-app` are smoke-verification tools,
not automated end-to-end tests.

---

## Containerization

Backlog #27 added infrastructure checks at the boundary where unit and existing
API integration tests cannot catch packaging errors:

- build both application images from a clean checkout, with an explicit local
  `VITE_API_URL` build argument for the web image
- validate the resolved Compose model
- start an isolated stack with a fresh PostgreSQL volume and wait for the
  `migrate`, API and web health conditions
- smoke-check `/api/v1/health`, one existing product API request, the web root
  and a direct nested SPA route

`make container-smoke` runs this check locally with isolated published ports
and removes its temporary database volume afterward. CI's `containers` job
runs the same image-build and container smoke path. The existing API e2e
suite may continue using CI's native PostgreSQL service; the container check is
about image contents, migration/startup ordering and networking rather than a
second exhaustive API suite. Manual browser verification still covers the full
create → share → vote → results flow through the containerized services.

---

## What Is NOT Tested in MVP

- end-to-end browser tests (Playwright/Cypress)
- performance tests
- accessibility audits (deferred)
- visual regression tests

---

## Coverage Expectations

- domain logic: high coverage
- API endpoints: covered by integration tests
- UI components: basic smoke coverage only
