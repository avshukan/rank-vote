---
name: backlog-sweep
description: Review every Todo item in docs/backlog.md when a backlog sweep is requested (the `backlog-sweep` tracker Issue is open) or the owner asks for one; recommend changes, wait for the owner's decisions, and land only the approved ones as a docs PR.
---

# backlog-sweep

Keep `docs/backlog.md` honest: is every `Todo` item still wanted, still
described correctly, and is there enough `Ready` work to pull? A sweep only
**recommends**. The owner decides, and only their approved changes reach
`docs/` through a normal reviewed PR. This file is the one canonical procedure;
the request workflow and the tracker Issue only point here.

## When to use

When the tracker Issue — the one with the `backlog-sweep` label — is open,
meaning a sweep was requested (why and when requests are made: `docs/backlog.md`,
`Workflow`), or when the owner asks for a sweep. Not for preparing one item:
that is `task-readiness`, which stays a separate step.

## Steps

1. **Read the request.** Find the tracker with
   `gh issue list --label backlog-sweep --state all`. Its comments since it was
   last opened are the trigger reasons — a picked item that left the `Ready`
   pool short, a release, the periodic check. They tell you what to look at
   first, not what to skip.

2. **Read the current state.** All of `docs/backlog.md` (Legend, Workflow,
   Format, `Todo`, `Done`, `Cancelled`); the `docs/acceptance-criteria.md`
   sections of `Ready`, `Design` and `Blocked` items; any
   `docs/backlog/<id>-<slug>.md`; open Issues (the idea inbox, including
   accepted ones not yet promoted); and what merged since the tracker was last
   closed (`git log`, merged PRs). Read code where a question depends on it.

3. **Review every `Todo` item** — every row, none skipped:
   - **Still needed?** Already delivered, superseded, contradicted by a decision
     in `docs/06-decisions.md`, or no longer wanted → a candidate for
     `Cancelled`.
   - **Type still correct?** **Level still correct?** Against the Legend.
   - **Dependencies still valid?** Each `needs ID-N` / `blocks ID-N` points at
     an item that still exists and still matters: one in `Done` is satisfied,
     one in `Cancelled` is broken.
   - **State still correct?** A `Blocked` item whose blocker is gone, a
     `Design` item whose question was answered elsewhere.
   - **Readiness stale?** For a `Ready` item: do its criteria still match `main`
     — code, contracts and decisions that changed since they were written?
   - **A candidate for the `Ready` pool?** Count the `Ready` items. When the
     pool is small, name the best candidates for `task-readiness`, by Level and
     dependencies.

4. **Recommend, then wait.** Present one compact list: the item (`ID-N`), the
   proposed change and its reason, grouped as cancel / Type or Level /
   dependencies or Notes / State / readiness candidates. Items with no change
   go on one line. Do not edit anything yet, and do not decide a product or
   process question — put it to the owner as a question with a recommendation.

5. **Apply only what the owner approved,** on a branch
   `docs/backlog-sweep-<YYYY-MM-DD>`:
   - Edit rows by the `Format` rules: fixed widths, cells padded by hand.
   - A cancelled item moves from `Todo` to the end of `Cancelled` with its ID,
     Title, Type and Level unchanged; Notes becomes the reason. Never delete a
     row or reuse an ID.
   - Never set `State` to `Ready`; only `task-readiness` does. A sweep may move
     a stale item out of `Ready` when the owner approves.
   - Moving a row within `Todo` changes its priority; do it only when approved.

6. **Ship the docs.** `make format-check` and
   `node --test scripts/backlog-promotion.test.mjs` (the backlog format rules),
   then a PR whose body lists the trigger reasons it covered and links the
   tracker as `Tracker: #N`. Stop at green CI and hand it over; the merge is
   the owner's call.

7. **Leave the tracker to the owner.** It stays open. The owner closes it once
   the approved changes have merged, or once they accept a no-change sweep,
   after checking that the latest reasons on it were covered. Readiness for
   the named candidates is a separate `task-readiness` run.

## Gotchas

- Never write a closing keyword (`Closes`, `Fixes`, `Resolves` and their
  forms) next to the tracker number, in the PR body or in a commit message:
  merging would close the tracker while a newer request may be waiting.
- A no-change sweep is a valid result; say so and leave the tracker to the
  owner.
- `Todo` is ordered by priority, not by ID, and its Notes column is narrower
  than `Cancelled`'s (51 vs 61 characters) — a reason may need its own wording.
