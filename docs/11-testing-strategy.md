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

- use in-memory SQLite for test database
- no external services required

---

## Frontend

### Unit Tests

Target: utility functions and counting display logic.

What to test:

- score formatting
- rank sorting helpers

Framework: Vitest (built-in with Vite)

> **Note:** `vitest` and `@testing-library/react` are not yet installed. Add them to `apps/web` devDependencies in Phase 3.

Location: co-located with source files (`*.test.ts`)

---

### Component Tests

MVP: minimal component testing.

Focus:

- ranking form renders options correctly
- submit button is disabled until all options are ranked

Framework: Vitest + React Testing Library

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
