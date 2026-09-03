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

- use a throwaway SQLite file for the test database
- create the empty SQLite target before
  `prisma db push`; Prisma 7 rejects a missing target during its connectivity
  check
- no external services are required by the current implementation

Backlog #17 replaces that lifecycle with PostgreSQL under these settled rules:

- local Compose provisions a fixed `rank_vote_test` database separate from the
  development database
- every e2e run requires an explicit test-only `DATABASE_URL` pointing at
  `rank_vote_test`; there is no fallback to the development URL
- before Jest starts, `prisma db push --force-reset` recreates the test schema,
  so consecutive runs cannot inherit state
- the reset must never target the development database
- CI supplies PostgreSQL; it may use a native database service rather than the
  local-development Compose file
- unit tests continue to mock Prisma and remain database-free

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
