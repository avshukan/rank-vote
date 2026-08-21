---
name: retro
description: Review the current session for reusable workflows, stale instructions, and avoidable friction when the user explicitly requests a retrospective.
disable-model-invocation: true
---

# retro

Run a session retrospective to grow this repository's procedural knowledge.

Analyze the current session (conversation, commands run, files changed — use
`git diff` / `git log` for the branch if the conversation alone is not enough)
and answer:

1. **Missing skills**: which multi-step procedures were performed manually this
   session and will clearly recur? For each, propose a skill as
   `.claude/skills/<name>/SKILL.md` with a one-line description and an outline
   of its steps. The matching `.agents/skills/<name>` Codex adapter is part of
   the same change.
2. **Broken or stale knowledge**: did any instruction in `AGENTS.md`, an
   existing skill, or a doc in `docs/` turn out to be wrong, stale, or missing
   during this session? Propose the concrete fix.
3. **Friction**: what took more attempts or tool calls than it should have
   (failed commands, wrong assumptions, missing permissions)? Suggest what
   would remove that friction next time.

Rules:

- Only propose skills for procedures that actually occurred and will recur —
  do not invent hypothetical ones.
- Present proposals as a short list with rationale and wait for confirmation.
  Do not create or edit any skill or instruction file until the user approves.
- Skill roadmap candidates for this repo (create only once the procedure has
  actually been performed): `new-slice` (Phase 1+), `db-migration` (Phase 2+),
  `verify-app` end-to-end poll flow (Phase 4+).
