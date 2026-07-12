Hand off unfinished work to the next session (any tool, any device).

Follow the **Session Handoff** section of `AGENTS.md` in write mode: collect
goal, state (branch/PR, last gate run), uncommitted files, gotchas/decisions,
and the single next step from the current session, then write them to
`.agents/HANDOFF.md` (overwrite if present).

Convert relative dates ("today", "yesterday") to absolute ones.

Then ask the user whether the handoff should travel to another device. If yes,
commit the note together with the WIP changes on the current work branch
(mark the commit `wip:`) and push the branch — never to `main` directly.

End by reminding the user: the next session (Claude Code, Codex, or any agent
that loads AGENTS.md) picks the note up at session start automatically; the PR
that finishes the slice must delete `.agents/HANDOFF.md`.
