---
name: new-slice
description: Implement one backlog item as a thin vertical slice (shared → api → web) from branch to merged PR, following the layered-architecture golden path.
---

# new-slice

Build one backlog item as a **thin vertical slice** through every layer, so each
feature is a clean copy of the reference established by the create-poll slice
(git: `feat: create-poll vertical slice`). Slice vertically, not by layer: one
feature end to end beats one layer across many features.

## When to use

Starting any `Value`/`Quality` backlog item that needs backend + frontend work.
Pure refactors or single-package changes don't need the full sequence.

## Steps

1. **Pick & branch.** Choose the top open item in `docs/backlog.md`. Create
   `feat/<name>` (or `fix/`, `chore/`). Read the item's row and the relevant
   `docs/` (`09-api-design.md`, `10-storage.md`, `04-domain-model.md`). If the
   item's acceptance criteria still hold open questions, run `task-readiness`
   first and land its docs PR.

2. **shared** (`packages/shared`). Add only the types/DTOs/constants this slice
   needs — they are the single source of truth for the wire contract. Keep them
   plain (no validation decorators, no ORM types). shared builds to CommonJS on
   `postinstall`, so the CJS NestJS API can `require` it.

3. **api**, bottom-up by layer (dependency direction `domain → application →
infrastructure → presentation`):
   - `infrastructure/` — persistence (Prisma). For schema changes see the
     Prisma notes in `docs/10-storage.md`.
   - `application/` — a service plus a **mapper** from persisted rows to shared
     DTOs. Prisma types must not leak past this boundary.
   - `presentation/` — a controller and a `class-validator` DTO that
     `implements` the shared DTO; validation lives only here, at the edge.
   - Wire the feature module into `AppModule`; runtime config (prefix,
     `ValidationPipe`, CORS) goes through the shared `configureApp` in
     `src/app.setup.ts` so tests exercise what production runs.
   - Tests: co-located `*.spec.ts` unit tests (mock Prisma) + `test/*.e2e-spec.ts`
     (supertest against a throwaway SQLite db via non-destructive `prisma db
push`). e2e runs under `--experimental-vm-modules` (already in `test:e2e`).

4. **web** (`apps/web`). A feature folder under `src/features/`, calls through
   `src/shared/api/` (fetch client using the shared DTO types), routed from
   `src/App.tsx`. Tests: Vitest + React Testing Library (validation, submit,
   rendered result).

5. **Gate.** Run the full verification from `AGENTS.md` — it mirrors CI:
   `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
   Green locally ⇒ green CI.

6. **Backlog.** Move the completed item(s) from `## Todo` to `## Done` in
   `docs/backlog.md` — part of the Definition of Done.

7. **Verify runtime.** Boot the app and drive the real flow (e.g. `curl` the API,
   or the browser), not just tests. Confirm the happy path plus the error codes.

8. **PR.** Commit, push, open a PR to `main`, wait for green CI, merge, delete
   the branch.

9. **Report.** Open the summary with the backlog ID and the item's essence in one
   line — "#18 Not-found page — shared 404 surface plus a catch-all route" —
   before the PR link, the gate result and anything left undone. Whatever was
   found but not fixed gets its own backlog ID, named just as explicitly.

## Gotchas learned the hard way

- `git fetch` before judging what is merged. A stale `origin/main` makes local
  work look unmerged, and `gh pr list` defaults to `--state open`, so a merged
  PR reads as one that was never opened — use `--state all`.
- Internal packages are consumed from their built `dist`; they build on
  `postinstall` so `lint`/`typecheck`/`test` (which run before `build` in CI)
  see them. If a consumer reports unresolved `@rank-vote/*` types, the dep's
  `dist` is missing — reinstall or build it.
- The gate must include `format:check`; Prettier ignores generated code via
  `.prettierignore` (e.g. `apps/api/src/generated`).
- `pnpm dev` renders a blank web app (backlog #21): Vite serves the CJS-only
  `packages/shared` dist to the browser unbundled, so named imports throw. For
  step 7, drive the production build instead: `vite build`, then
  `vite preview --port 5173`. The port matters — `CORS_ORIGIN` pins 5173, and on
  any other port the API rejects the preflight and every fetch looks like a
  network error. Delete this bullet when #21 lands.
