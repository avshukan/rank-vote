# AI-First Strategy

How this repository is set up for development with AI agents, and the roadmap
for deepening that setup. Agents in use: **Claude Code**, **OpenAI Codex**,
**GitHub Copilot** (coding agent).

---

## Principles

- **Single source of truth for instructions**: `AGENTS.md` (read natively by
  Codex and both Copilot surfaces; `CLAUDE.md` is a one-line `@AGENTS.md`
  import shim for Claude Code). Tool-specific files never duplicate content.
- **Honest feedback loops over trust**: an agent is only as good as how fast
  it learns it broke something. Lint, typecheck, tests, and build must
  genuinely fail; CI is a required gate, not a report.
- **Skills are code**: recurring procedures live in `.claude/skills/`, change
  via PR, and are proposed by agents but approved by a human (until autonomy
  is earned).
- **CLI-first for agent tools**: an MCP server is added only when no CLI can
  do the job — every connected server permanently costs context.
- **Autonomy is increased gradually**, only after the gates around it are
  proven to catch failures.

---

## Wave 1 — Foundation (done)

- Real feedback loops: Vitest in `web`/`shared`, per-package `typecheck`,
  api lint without auto-fix, toolchain pinned (`packageManager`, `.nvmrc`)
- CI on PRs and `main` (format, lint, typecheck, test, build) + PR template
  with the Definition of Done
- Pre-commit Prettier hook (`simple-git-hooks` + `lint-staged`)
- Canonical `AGENTS.md` with verification-first rule and DoD; `CLAUDE.md` shim
- Skill lifecycle levels 0–1: skill-proposal rule in `AGENTS.md` + `/retro`
  command (`.claude/commands/retro.md`)

Manual (repo settings): ruleset on `main` requiring PR + green `checks`.

---

## Roadmap

### Wave 2 — AI cross-review

`anthropics/claude-code-action@v1` workflow reviews every PR (including
`copilot/*` ones — one agent checks another) against `AGENTS.md`: DoD,
architecture principles, Borda/ballot constraints. Requires the Claude GitHub
App and `ANTHROPIC_API_KEY` secret (`/install-github-app` from Claude Code).

### Wave 3 — MCP tools

Committed `.mcp.json` with **Playwright MCP** — browser eyes/hands so agents
verify UI flows themselves (create poll → vote → results); becomes valuable
from Phase 3. GitHub stays on `gh` CLI, SQLite on `sqlite3`/`prisma` CLI — no
MCP for those. Mirror config for Codex (`config.toml`) and Copilot agent
(repo settings) — verify current syntax when implementing.

### Wave 4 — Autonomy

`.claude/settings.json` with a permissions allowlist (pnpm scripts, read-only
git) and deny rules for secrets (`.env*`). Loosen gradually as gates prove
themselves. Parallel agents in git worktrees for independent slices.

### Wave 5 — Skill lifecycle automation (levels 2–3)

- Level 2: Claude Code hook at session end reminding to run `/retro`
  (Codex has only `notify`; Copilot agent only `copilot-setup-steps.yml` —
  re-verify capabilities when implementing, the ecosystem moves fast)
- Level 3: weekly scheduled meta-agent that reviews recent PRs and proposes
  skill/instruction updates as PRs

### Wave 6 — Backlog automation

Scheduled grooming agent: splits backlog items into vertical slices with
acceptance criteria, flags contradictions with `docs/`. Nested per-package
`AGENTS.md` files once packages grow distinct conventions.

---

## Backlog workflow (backlog-as-code)

- `docs/backlog.md` is the single source of truth for work items.
- GitHub Issues are an ephemeral launch surface for agents (assign the Copilot
  agent, mention `@claude`), not a store.
- A PR that completes an item must update `docs/backlog.md` in the same PR —
  that is part of the Definition of Done, so the repo never drifts from
  reality.
