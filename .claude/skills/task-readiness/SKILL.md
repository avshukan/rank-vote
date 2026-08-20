---
name: task-readiness
description: Check whether a backlog item is ready to implement — contracts, acceptance criteria and open questions — and land the answers as a docs PR before any code is written.
---

# task-readiness

Answer one question about a backlog item: **can it be implemented as specified,
or does something still need deciding?** Everything ambiguous is cheaper to
settle in `docs/` than in review. Runs before `new-slice`, not instead of it.

## When to use

Before starting any `Value`/`Quality` backlog item — especially when the user
asks whether the documentation for a task is sufficient. Skip for pure refactors
and for items whose acceptance criteria were written in the same session.

## Steps

1. **Read the specification, in this order.** The row in `docs/backlog.md` (note
   the ID — titles repeat across items, IDs do not), then the item's section in
   `docs/acceptance-criteria.md`, then `docs/09-api-design.md` for the wire
   contract. `docs/04-domain-model.md` and `docs/10-storage.md` when the item
   touches data.

2. **Find out what already exists.** Read the code, do not assume the item is
   greenfield: routes in `apps/web/src/App.tsx`, DTOs in `packages/shared/src/`,
   the API client in `apps/web/src/shared/api/`, the controller, and the e2e
   specs in `apps/api/test/`. Items are often partly delivered by an earlier
   slice — which layers remain decides whether this is a full vertical slice or
   a single-package change.

3. **Collect the gaps.** Two buckets, and keep them apart:
   - _needs a decision_ — the docs allow several behaviours (what a shared link
     points at, how tied positions are numbered, whether a UI surface exists at
     all). These block the item.
   - _judgment call_ — a sensible default exists; state it and move on.

   Read `docs/02-user-stories.md` against the acceptance criteria: a story with
   no matching criterion is either a missing criterion or a separate backlog
   item. Cross-check `docs/11-testing-strategy.md` and
   `docs/implementation-plan.md` against the code — statements about behaviour
   that already shipped are the ones that go stale first.

4. **Get the decisions.** Present the gaps compactly with a recommendation for
   each, and wait. Do not implement around an open question.

5. **Write the answers down.** Decisions go into the item's section of
   `docs/acceptance-criteria.md`, contract changes into `docs/09-api-design.md`.
   Add an _Out of Scope_ block naming the backlog items that absorbed the
   deferred work — a criterion that was dropped without a destination comes back.

6. **File the follow-ups.** New rows in `docs/backlog.md` with the next free ID,
   each stating its dependency direction (`blocks #N` / `needs #N`), and put a
   blocking item above the one it blocks. A blocker that is cross-cutting (a
   shared page, a shared component, a route change) ships as its own PR — folding
   it into the feature makes that PR touch unrelated flows.

7. **Ship the docs.** Own branch `docs/<name>`, `make format-check`, PR — then
   stop at green CI and hand it over, exactly as `new-slice` step 8 does. The
   merge is the repository owner's call. `new-slice` starts once the docs PR has
   actually landed, so the code is written against decisions that are on `main`.

## Gotchas learned the hard way

- Deciding an item is "documented enough" without reading the code is how a
  finished endpoint gets built twice.
- The backlog `## Todo` table is ordered by priority, not by ID, and the ID
  column is what everything else references.
