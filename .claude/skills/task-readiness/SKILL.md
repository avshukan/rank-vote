---
name: task-readiness
description: Check a backlog item's readiness, settle decisions and acceptance criteria, or record design work and blockers before implementation.
---

# task-readiness

Answer one question: **can this backlog item be implemented as specified,
or does something significant still need deciding or unblocking?**
Settle ambiguity before implementation, without turning simple tasks into
large documentation exercises.

## When to use

Use for any `Todo` item not yet `Ready` (`—`, `Design` or `Blocked`), regardless
of Type (`Value`, `Quality`, `Refactor` or `Ops`), before implementation.
Recheck a `Ready` item when its scope, dependencies, contract or assumptions
may have become stale. Do not repeat readiness for a current `Ready` item.

Scale the work to the risk: a small refactor may need only a clear boundary
and verification plan; a voting algorithm, schema change or production operation
may need explicit contracts, examples, failure cases and owner decisions.

## Steps

1. **Establish the baseline.** Read the row in `docs/backlog.md`, its existing
   `docs/acceptance-criteria.md` section, dependencies and relevant accepted
   decisions. Inspect the current `main` state. Read only applicable documents:
   API design for wire contracts, domain model for voting rules, storage for
   persistence, production runbooks for operations, and user stories for
   user-facing behaviour. Do not treat a future target as shipped behaviour.

2. **Inspect implementation and tests.** Check the relevant routes, DTOs, code,
   tests and existing user flows before assuming greenfield work. Identify
   what is already delivered, what would change and what must remain compatible.
   Read more broadly only when a real cross-cutting dependency warrants it.

3. **Identify material gaps.** Separate:
   - **Owner decision:** multiple meaningful product, architecture or scope
     options remain; the agent must not choose for the owner.
   - **Implementation judgment:** the contract permits a reasonable technical
     choice; record it as a proposal or implementation choice, not approval.
   - **Known blocker:** an external dependency or prerequisite prevents work.

   Check goal, scope, dependencies, risks, contracts and credible verification.
   For complex algorithms, confirm that examples, fixtures, invariants and
   API responses agree with the latest accepted semantics. Do not repeat
   already accepted decisions or invent requirements to fill documentation.

4. **Resolve the decisions.** Report only unresolved decisions, with concise
   options, trade-offs and a recommendation. Wait for owner approval before
   recording product/design decisions, new scope exclusions or owner-operated
   actions as accepted. A question that can be answered during ordinary
   readiness does not by itself justify `Design`.

5. **Choose and document one outcome:**
   - **`Ready`:** the goal and bounded scope are clear, material decisions are
     settled, dependencies are understood, and verification is credible.
     Write proportionate, testable criteria in `docs/acceptance-criteria.md`;
     update `docs/09-api-design.md` or other permanent contract/ADR documents
     only where relevant. Record confirmed decisions separately from technical
     judgment calls. Set the backlog row to `Ready` through task-readiness only.
   - **`Design`:** substantial analysis or design decisions remain and cannot
     be closed in the ordinary readiness pass. Set `Design` and name the
     unanswered questions in the backlog note. If one row is insufficient,
     use optional `docs/backlog/<id>-<slug>.md` with **confirmed facts**,
     **open owner decisions**, **unconfirmed proposals** and **next step**.
     Do not write speculative answers as acceptance criteria. Once resolved,
     rerun readiness; move durable decisions to permanent docs and delete
     the temporary file when superseded.
   - **`Blocked`:** a known unresolved prerequisite prevents implementation
     even if the design is sufficiently clear. Set `Blocked`; state precisely
     what blocks it (an existing `ID-N`, Issue `#N` or external condition)
     and what would unblock it. Recheck readiness after the blocker clears.

   Do not label an item `Ready` merely because an agent suggested a solution.
   `Design` and `Blocked` are outcomes, not mandatory stages.

6. **Keep boundaries explicit.** For `Ready`, describe testable behaviour,
   relevant edge/failure cases, compatibility, and a verification approach.
   Add `Out of Scope` with a destination for deferred work where relevant:
   an existing backlog item (`ID-N`) or a follow-up Issue (`#N`).
   Do not silently drop a requirement, add owner obligations or treat an
   implementation preference as a product constraint.

7. **Route new work through intake.** Before filing a follow-up, search for
   existing backlog items or open Issues. Otherwise create a GitHub Issue,
   leaving triage, owner decision and promotion to the established workflow.
   Never assign a backlog ID or apply `triage: accepted`. Note dependency
   direction (`blocks ID-N` / `needs ID-N`) for triage. Cross-cutting blockers
   that affect unrelated flows should be scoped as separate work, not hidden
   inside the feature.

8. **Ship a documentation PR.** Use `docs/<name>`; run `make format-check` and
   `node --test scripts/backlog-promotion.test.mjs`. Summarize the verified
   baseline, owner-approved decisions, chosen state and next action.
   Stop at a PR with green CI for the owner's review and merge. For `Ready`,
   implementation starts only after the readiness PR lands on `main`.
   For `Design` or `Blocked`, do not start implementation around open gaps.

## Gotchas learned the hard way

- Read existing code before declaring work missing, or an already shipped
  endpoint can be built again.
- `Todo` is ordered for work selection, not by backlog ID. Keep fixed-width
  rows intact; put longer temporary notes outside the table.
- Match criteria to risk. A minor quality fix does not need a production
  evidence protocol; a risky operational change may need one.
- A scope exclusion already fixed by canonical documentation, an accepted
  decision or another tracked item needs a citation, not a new owner decision.
  New product/design exclusions and owner-operated checks need owner approval.
- ID-32 exercised `Design → Ready`: distinguish facts, unconfirmed options
  and decisions, then remove temporary design notes after settling them.
- ID-8 showed why algorithm fixtures and API examples must be reconciled
  against the final accepted rules before implementation.
