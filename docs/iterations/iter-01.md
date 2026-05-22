# Iteration 01 — Monorepo Scaffold + Shared Package

## Goal

Set up the monorepo workspace and shared types package so that all subsequent iterations can build on a consistent foundation.

---

## Scope

### Monorepo Scaffold

- Initialize `pnpm` workspace (`pnpm-workspace.yaml`, root `package.json`)
- Create workspace packages: `apps/web`, `apps/api`, `packages/shared`
- Add root-level scripts: `dev`, `build`, `test`, `lint`
- Configure TypeScript project references across all packages
- Set up ESLint + Prettier at the root

### Shared Package (`packages/shared`)

- Define enums: `BallotFormat`, `CountingMethod`
- Define API DTOs:
  - `CreatePollDto` / `CreatePollResponseDto`
  - `GetPollResponseDto`
  - `SubmitBallotDto` / `SubmitBallotResponseDto`
  - `GetResultsResponseDto`
- Export validation constants: `MIN_OPTIONS = 2`, `MAX_OPTIONS = 10`

---

## Out of Scope

- Application logic (backend or frontend)
- Database setup
- Any UI

---

## Definition of Done

- `pnpm install` succeeds at the root
- `pnpm build` compiles all packages without errors
- `pnpm lint` passes across all packages
- `packages/shared` types are importable from `apps/api` and `apps/web`
