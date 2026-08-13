# AGENTS.md

Instructions for AI agents working in this repository. This is the canonical
instruction file for all agents (Claude Code, Codex, GitHub Copilot);
tool-specific files must only point here, never duplicate content.

---

## Repository Overview

**rank-vote** is a monorepo web app for group decisions using ranked voting (Borda count).

```text
apps/
  web/        # React + Vite + TypeScript + Tailwind CSS
  api/        # NestJS + TypeScript (+ Prisma + SQLite from Phase 2)
packages/
  shared/     # Shared types, DTOs, enums, validation constants
docs/         # All project documentation
```

---

## Toolchain & Commands

Node 22 (`.nvmrc`), pnpm pinned via `packageManager` in the root `package.json`.
On a fresh machine, if `pnpm` is not on PATH, run `corepack enable` (ships with
Node) — it provides the pinned pnpm version automatically.

```bash
pnpm install          # install all workspace deps (also installs the pre-commit hook)
pnpm dev              # run all apps in dev mode — WEB IS BROKEN, see backlog #21
pnpm build            # build all packages
pnpm test             # run all tests (Jest in api, Vitest in web/shared)
pnpm lint             # ESLint, check only (use lint:fix in a package to auto-fix)
pnpm typecheck        # per-package tsc
pnpm format           # Prettier write; format:check for CI-style check
```

Target one package with `pnpm --filter <name>`, e.g. `pnpm --filter @rank-vote/api test`,
`pnpm --filter @rank-vote/shared build`.

The `Makefile` wraps the multi-step rituals; `make help` lists them. Worth
knowing: `make setup` (install + `.env` files), `make verify` (the full gate
below), and `make web` / `make api` / `make seed` / `make down` for running the
app. Anything that is a single pnpm script stays a pnpm script.

Until backlog #21 is fixed, `pnpm dev` serves a blank web app: Vite hands the
browser the CommonJS-only `packages/shared` dist unbundled, so named imports
throw and `#root` stays empty. The API half is fine. To run the app, use
`make api` and `make web` in two terminals (see the `verify-app` skill); delete
this paragraph and the `pnpm dev` row above with #21.

Pre-commit hook (Prettier via lint-staged) is managed by `simple-git-hooks`;
after changing its config in `package.json`, re-run `pnpm simple-git-hooks`.

---

## Environment Variables

Copy `.env.example` to `.env` in each app before running locally.

| Variable       | App        | Description                       |
| -------------- | ---------- | --------------------------------- |
| `DATABASE_URL` | `apps/api` | SQLite path, e.g. `file:./dev.db` |
| `PORT`         | `apps/api` | API listen port (default `3000`)  |
| `CORS_ORIGIN`  | `apps/api` | Allowed frontend origin           |
| `VITE_API_URL` | `apps/web` | Backend API base URL              |

---

## Verification First

Before declaring any task complete, run:

```bash
make verify   # pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

and report the results. This mirrors the CI job exactly (same steps, same
order), so a green local run means a green CI. Re-run a single step with
`make lint`, `make test`, … while fixing. A change without a passing
verification run is not done. New behavior requires new tests.

---

## Definition of Done

- `make verify` passes locally
- Tests added/updated for changed behavior
- Relevant docs updated (or none affected) — `docs/`, plus `README.md`,
  `AGENTS.md`, `.claude/` and `.github/` if a command or the process changed
- Manually verified end-to-end
- CI is green before merge

When a change touches a command, grep for a stable part of its **old** form
(`pnpm lint`) rather than the part you are changing — a copy that has already
drifted matches only the stable part.

---

## Skills & Commands

- Recurring procedures live in `.claude/skills/` — read them before inventing
  your own approach.
- `.claude/commands/` holds the same kind of knowledge in the other trigger
  mode. Which one a procedure belongs in:
  - **skill** — the agent should recognise on its own that the procedure
    applies (`new-slice` when picking up a backlog item, `task-readiness`
    before implementing one).
  - **command** — a ritual the human starts at a chosen moment, where firing
    automatically would be wrong (`/retro`, `/handoff`).
- Both directories are committed. Check both before writing a new one.
- If you performed a multi-step procedure this session that will clearly recur,
  or noticed an existing skill or instruction is wrong, propose creating or
  fixing it at the end of the session (do not create or change skills silently).

---

## Session Handoff

- **At session start**: if `.agents/HANDOFF.md` exists, read it before anything
  else — it is state handed off by a previous session (possibly from a
  different tool or device). Delete it once the work is picked up; a stale
  handoff is worse than none.
- **To hand off unfinished work**: write `.agents/HANDOFF.md` with: goal of the
  interrupted slice; state (done vs in progress, branch/PR, result of the last
  gate run); uncommitted files and their condition; gotchas and decisions made;
  the single concrete next step. Under ~40 lines; include only what cannot be
  recovered from AGENTS.md, docs/, or git history.
- The note is committed, but **only on work branches**: to hand off across
  devices, commit it (together with WIP code) and push the branch. The PR that
  finishes the slice must delete the note — it never reaches `main`.
- In Claude Code, `/handoff` runs this procedure; in other tools, ask the agent
  to "write a handoff per AGENTS.md".

---

## Process Rules

- Follow **trunk-based development**: short-lived branches merged to `main` via PR
- Branch naming: `feat/<name>`, `fix/<name>`, `chore/<name>`, `docs/<name>`
  (GitHub Copilot agent branches are `copilot/*`)
- CI must be green before merge; each merged PR must be production-ready
- Slice work vertically, sized to fit one agent session
- The backlog source of truth is `docs/backlog.md`; see current priorities there.
  Its tables have fixed column widths — read the `Format` section in that file
  before editing them
- Documentation is part of the Definition of Done — update relevant `docs/`
  files alongside code changes
- See `docs/07-process.md` for the full process, `docs/12-ai-first.md` for the
  AI-first strategy and roadmap

---

## Architecture Principles

- Backend follows a layered architecture: `domain/` → `application/` → `infrastructure/` → `presentation/`
- Frontend is feature-oriented: `features/` + `shared/` + `pages/`
- Shared types live in `packages/shared` — import from there, do not duplicate
- No authentication in MVP; all endpoints are public
- Counting method: **Borda count** (MVP only)
- Ballot format: **strict full ranking** (MVP only) — all options, no ties, ranks start at 1

---

## Key Constraints

- Poll options: 2–10
- Ballot entries must cover all options; ranks are unique consecutive integers starting at 1
- All IDs are UUIDs; timestamps are ISO 8601 UTC
- Borda formula: option at rank `r` out of `N` options → `N − r` points
- Duplicate vote protection: client-side only via `localStorage` key `voted_poll_ids`

---

## Key Documentation

Read these files to understand the project before making changes:

| File                          | What it covers                                         |
| ----------------------------- | ------------------------------------------------------ |
| `docs/00-product.md`          | Product vision and use cases                           |
| `docs/01-mvp-scope.md`        | MVP features, constraints, out-of-scope                |
| `docs/04-domain-model.md`     | Core domain entities and enums                         |
| `docs/05-architecture.md`     | Monorepo structure, tech stack, folder layout          |
| `docs/06-decisions.md`        | All architecture and technology decisions (ADRs)       |
| `docs/09-api-design.md`       | API endpoints, request/response shapes, constraints    |
| `docs/10-storage.md`          | Prisma schema, SQLite setup, duplicate vote protection |
| `docs/11-testing-strategy.md` | What to test, frameworks, coverage expectations        |
| `docs/12-ai-first.md`         | AI-first strategy, tooling roadmap                     |
| `docs/implementation-plan.md` | Phased implementation plan with all deliverables       |
| `docs/backlog.md`             | Prioritized backlog items                              |
| `docs/glossary.md`            | Domain terminology                                     |
