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
  api/        # NestJS + TypeScript + Prisma + PostgreSQL
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
pnpm dev              # run all apps in dev mode (api + web + shared in watch)
pnpm build            # build all packages
pnpm test             # run all tests (Node tooling, Jest api, Vitest web/shared)
pnpm lint             # ESLint, check only (use lint:fix in a package to auto-fix)
pnpm typecheck        # per-package tsc
pnpm format           # Prettier write; format:check for CI-style check
```

Target one package with `pnpm --filter <name>`, e.g. `pnpm --filter @rank-vote/api test`,
`pnpm --filter @rank-vote/shared build`.

The `Makefile` wraps the multi-step rituals; `make help` lists them. Worth
knowing: `make setup` (install + `.env` files), `make db-up` (local PostgreSQL),
`make verify` (the full gate below), and `make web` / `make api` / `make seed` /
`make down` for running the app. `make stack-up` / `make stack-down` run the
complete container stack, while `make container-smoke` tests it with fresh,
isolated storage. `make render-app` renders a local `URL` through an installed
Chromium-compatible browser. `make prune-merged` deletes
local branches whose PR is merged — squash merges leave no trace for
`git branch --merged`, so it asks GitHub instead. Anything that is a single
pnpm script stays a pnpm script.

`packages/shared` builds twice — CommonJS for the API to `require`, ESM for
Vite and the browser to `import` — and its `exports` map routes each consumer
to the right one. A CommonJS-only build is what used to leave `pnpm dev`
serving a blank page, so keep both halves when changing how it is built.
Its `build` must not wipe `dist` first: `pnpm dev` starts every package in
parallel, and the API's watcher then compiles against a missing `dist`. The
dual-output test in `packages/shared/src` wipes and rebuilds on its own.
`docs/06-decisions.md` records why the one-line `optimizeDeps.include` fix was
rejected.

Pre-commit hook (Prettier via lint-staged) is managed by `simple-git-hooks`;
after changing its config in `package.json`, re-run `pnpm simple-git-hooks`.

---

## Environment Variables

Copy `.env.example` to `.env` in each app before running locally.

| Variable             | App        | Description                                           |
| -------------------- | ---------- | ----------------------------------------------------- |
| `DATABASE_URL`       | `apps/api` | PostgreSQL URL (development DB is `rank_vote`)        |
| `PORT`               | `apps/api` | API listen port (default `3000`)                      |
| `CORS_ORIGIN`        | `apps/api` | Allowed frontend origin                               |
| `TRUSTED_PROXY_HOPS` | `apps/api` | Exact trusted proxy hops (default `0`, direct client) |
| `VITE_API_URL`       | `apps/web` | Backend API base URL                                  |

---

## Verification First

Before declaring any task complete, run:

```bash
make verify   # pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

and report the results. This mirrors the CI `checks` job exactly (same steps,
same order); container changes must additionally pass `make container-smoke`,
as the separate `containers` job does. Re-run a single step with
`make lint`, `make test`, … while fixing. A change without a passing
verification run is not done. New behavior requires new tests.

---

## Definition of Done

- `make verify` passes locally
- Tests added/updated for changed behavior
- Relevant docs updated (or none affected) — `docs/`, plus `README.md`,
  `AGENTS.md`, `.claude/`, `.agents/` and `.github/` if a workflow or the
  process changed
- Manually verified end-to-end
- CI is green before merge
- The PR has been through code review — a green gate says the build passed, not
  that anyone read the diff. An agent opens the PR and hands it over; merging is
  the repository owner's call, never the agent's

When a change touches a command, grep for a stable part of its **old** form
(`pnpm lint`) rather than the part you are changing — a copy that has already
drifted matches only the stable part.

---

## Skills & Workflows

- Recurring procedures live canonically in `.claude/skills/` and follow the
  Agent Skills `SKILL.md` format. Read them before inventing your own approach.
- `.agents/skills/` contains only relative symlinks to those canonical folders,
  so Codex discovers the same repository skills without duplicated content.
  Add the matching symlink whenever a skill is added; never edit through a
  second copy.
- **Automatic skills** should be recognised when the procedure applies
  (`new-slice` when picking up a backlog item, `task-readiness` before
  implementing one).
- **Explicit-only skills** are rituals the human starts at a chosen moment
  (`retro`, `handoff`). Keep them manual-only for every supported agent: set
  `disable-model-invocation: true` in the `SKILL.md` frontmatter — Claude Code's
  documented control, which also blocks subagent preload and scheduled-task
  firing — backed by `"user-invocable-only"` in `.claude/settings.json`
  `skillOverrides`; for Codex, `allow_implicit_invocation: false` in the skill's
  `agents/openai.yaml`. The description and body must also state that user intent
  is required, since the portable Agent Skills standard has no cross-client
  invocation policy.
- Both skill locations are committed. Check them before writing a new one.
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
- Invoke the `handoff` skill explicitly: `/handoff` in Claude Code and Copilot
  CLI, `$handoff` in Codex, or ask the agent to "write a handoff per AGENTS.md".

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

| File                          | What it covers                                      |
| ----------------------------- | --------------------------------------------------- |
| `docs/00-product.md`          | Product vision and use cases                        |
| `docs/01-mvp-scope.md`        | MVP features, constraints, out-of-scope             |
| `docs/04-domain-model.md`     | Core domain entities and enums                      |
| `docs/05-architecture.md`     | Monorepo structure, tech stack, folder layout       |
| `docs/06-decisions.md`        | All architecture and technology decisions (ADRs)    |
| `docs/09-api-design.md`       | API endpoints, request/response shapes, constraints |
| `docs/10-storage.md`          | PostgreSQL setup, Prisma schema, duplicate voting   |
| `docs/11-testing-strategy.md` | Frameworks, test isolation, coverage expectations   |
| `docs/12-ai-first.md`         | AI-first strategy, tooling roadmap                  |
| `docs/implementation-plan.md` | Phased implementation plan with all deliverables    |
| `docs/acceptance-criteria.md` | Agreed criteria per backlog item                    |
| `docs/backlog.md`             | Prioritized backlog items                           |
| `docs/glossary.md`            | Domain terminology                                  |
