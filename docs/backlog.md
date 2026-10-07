# Backlog

## Legend

### Type

| Type     | Description                                                          |
| -------- | -------------------------------------------------------------------- |
| Value    | New user-facing functionality                                        |
| Quality  | Product quality: UX, reliability, performance, safety                |
| Refactor | Internal code or architecture cleanup                                |
| Ops      | Operations and engineering infrastructure, including developer tools |

---

### Level

| Level  | Description                                    |
| ------ | ---------------------------------------------- |
| High   | Important to address soon; significant impact  |
| Medium | Valuable work that can reasonably wait         |
| Low    | Nice-to-have, speculative, or longer-term work |

---

### State

| State   | Description                                    |
| ------- | ---------------------------------------------- |
| —       | Task-readiness has not been run                |
| Ready   | Ready to implement                             |
| Design  | Needs analysis or design before implementation |
| Blocked | Cannot start until a known blocker is resolved |

---

## Workflow

- Raw ideas are captured as GitHub Issues, the raw idea inbox. No extra metadata
  is required at capture time.
- Triage recommends `Keep`, `Discard`, or `Duplicate` for an idea. An Issue
  that holds several independent items stays `Keep` with a recommended split
  into several candidate backlog entries. Eligible newly opened Issues (opened
  by someone with write access) receive this recommendation automatically as one
  comment from `.github/workflows/issue-triage.md`; it changes nothing else and
  for `Keep` recommendations ends with an owner instruction to apply the
  `triage: accepted` label to accept and promote the item.
- The repository owner decides. Applying the `triage: accepted` label (repository
  admins only) starts backlog promotion, `.github/workflows/backlog-promotion.yml`:
  it appends the recommendation's candidate entries, exactly as written, to the
  end of `Todo` with the next free IDs and opens a pull request that closes the
  source Issue on merge. The label stays on the closed Issue as a record. When
  promotion cannot proceed safely, it changes nothing and comments the reason
  and the recovery step on the Issue. A manual run of the workflow with
  `dry_run` checks an Issue without changing anything.
- To accept a `Discard` recommendation, the owner closes the Issue as
  `not planned` by hand; no workflow closes it.
- New backlog items start with `State = —`.
- Task-readiness can run on demand for a chosen item or proactively for likely
  next work. It sets `State` to `Ready`, `Design`, or `Blocked`.
- Backlog sweeps keep `Todo` current: whether each item is still needed, its
  Type, Level, dependencies and State, stale readiness, and candidates for the
  `Ready` pool. `.github/workflows/backlog-sweep.yml` requests a sweep on the
  one Issue labelled `backlog-sweep`: open while a sweep is requested, closed by
  the owner once none is pending. Requests come when picking work leaves fewer
  than 2 `Ready` items, after a verified production release, and from a weekly
  check about 60 days after the last sweep. The `backlog-sweep` skill only
  recommends; the owner decides, and the approved changes land as a reviewed
  docs pull request.
- An item that is no longer wanted moves from `Todo` to the end of `Cancelled`
  by the owner's decision. It keeps its ID, Title, Type and Level, and Notes
  records the reason. Rows are never deleted.
- Work is pulled continuously from `Ready` items. `Level` guides selection but
  is not a strict queue order. The Ready-pool rule for picking an item is in
  `AGENTS.md` (Process Rules).
- A detailed file under `docs/backlog/<id>-<slug>.md` is optional when one row
  is not enough. It is normally deleted when the task is done; durable decisions
  move to permanent documentation.

---

## Format

The `Todo`, `Done` and `Cancelled` tables have **fixed column widths**:

| Table     | ID  | Title | Type | Level | State | Notes |
| --------- | --- | ----- | ---- | ----- | ----- | ----- |
| Todo      | 3   | 26    | 8    | 6     | 7     | 51    |
| Done      | 3   | 26    | 8    | 6     | —     | 61    |
| Cancelled | 3   | 26    | 8    | 6     | —     | 61    |

With the separators, every backlog row is exactly 120 characters wide, and the
separator row under each header doubles as the ruler to pad against.

Never change a column width without explicit repository-owner approval.
Re-padding every row is the diff this format exists to prevent, so content
adapts to the column rather than moving the column.

- **One item is one row.** A note that does not fit its column gets shortened,
  never wrapped. Longer temporary context belongs in
  `docs/backlog/<id>-<slug>.md`; durable context belongs in permanent docs.
- The `ID` column contains only the number. References elsewhere use `ID-N`,
  for example `needs ID-19`, so backlog IDs are not confused with GitHub
  Issue/PR numbers such as `#19`. IDs are never reused: a new item takes the
  number after the highest one.
- Completed items are appended to `Done`; existing `Done` rows are not reordered.
  Cancelled items are appended to `Cancelled` the same way, and no row is ever
  deleted.
- All three backlog tables are preceded by `<!-- prettier-ignore -->`, so Prettier
  will not re-align them; pad the cells by hand.
- The `Legend` and width tables are ordinary Prettier-managed tables.
- `pnpm test` checks these rules (`scripts/backlog-promotion.test.mjs`), so a
  misaligned row, an overflowing cell or a reused ID fails CI.

---

## Todo

<!-- prettier-ignore -->
| ID  | Title                      | Type     | Level  | State   | Notes                                               |
| --- | -------------------------- | -------- | ------ | ------- | --------------------------------------------------- |
| 6   | Mobile responsive layout   | Quality  | Medium | Ready   | Main flows from 320px; long-press touch drag        |
| 20  | Refresh results button     | Quality  | Medium | —       | Manual results refresh until ID-16                  |
| 8   | Add IRV counting           | Value    | Medium | —       | Instant-runoff voting                               |
| 9   | Add Condorcet counting     | Value    | Medium | —       | Pairwise comparison winner                          |
| 10  | Compare counting methods   | Value    | Medium | —       | Show different winners; needs ID-8, ID-9            |
| 25  | Unify eslint and TS majors | Refactor | Medium | —       | web eslint 10/TS 6; rest eslint 9/TS 5              |
| 26  | Extract page fetch/retry   | Refactor | Medium | —       | BallotForm/ResultsView duplicate load/404/retry     |
| 30  | Drop the scaffold endpoint | Refactor | Medium | —       | Remove scaffold `GET /api/v1`; prod smoke checks it |
| 32  | Automate offsite backups   | Ops      | High   | Ready   | Daily dump to R2; 30d lock, 90d keep; email alerts  |
| 33  | Add production monitoring  | Ops      | High   | —       | Dependency health, monitoring and alerts            |
| 34  | Share rate-limit state     | Quality  | Low    | —       | Shared counters before API replicas >1              |
| 11  | Add PWA support            | Quality  | Low    | —       | Installable web app                                 |
| 12  | Add poll editing           | Value    | Low    | —       | Edit poll after creation                            |
| 13  | Add poll expiration        | Value    | Low    | —       | Closing date/time                                   |
| 14  | Add ranking with ties      | Value    | Low    | —       | Multiple options can share same rank                |
| 15  | Add partial ranking        | Value    | Low    | —       | Allow ranking only subset of options                |
| 16  | Add real-time updates      | Quality  | Low    | —       | Live result updates                                 |
| 22  | Add OpenAPI spec           | Quality  | Low    | —       | Deferred until an outside client lands (app, bot)   |
| 23  | Design self-critique skill | Ops      | Low    | —       | Design self-critique; seen 2×; write on 3rd         |
| 24  | `pnpm dev` orphans the API | Ops      | Low    | —       | Ctrl+C leaves `node dist/main` on 3000              |
| 36  | Export results as CSV      | Value    | Low    | —       | Download scores/ranks from results page or API      |
| 37  | Add short poll links       | Quality  | Low    | —       | Replace/alias UUID with short ID; redirect needed   |
| 38  | Breakdown hover preview    | Value    | Low    | —       | Hover preview of score breakdown; needs ID-19       |
<<<<<<< HEAD
| 42  | Automate tagged releases   | Ops      | High   | —       | Tag-triggered workflow; owner approval; auto deploy |
=======
| 41  | Fix backlog lint fixture   | Ops      | Medium | —       | Fixture backlog; drop hard-coded live-file IDs      |
>>>>>>> origin/main

---

## Done

<!-- prettier-ignore -->
|  ID | Title                      | Type     | Level  | Notes                                                         |
| --: | -------------------------- | -------- | ------ | ------------------------------------------------------------- |
|   1 | Create poll                | Value    | High   | `POST`/`GET /api/v1/polls` + create page; golden-path slice   |
|   2 | Share poll link            | Value    | High   | Shareable `/poll/:id` link with copy button after creation    |
|   3 | Submit ballot              | Value    | High   | `POST /polls/:id/ballots` + drag-and-drop vote page           |
|   7 | Prevent duplicate voting   | Quality  | Medium | `voted_poll_ids` on submit, checked in `VotePage`; with ID-3  |
|   4 | Calculate Borda result     | Value    | High   | `GET /polls/:id/results` — Borda tally, ties give winners     |
|  18 | Not-found page             | Quality  | High   | Shared `NotFound` + `*` catch-all; used by the vote flow      |
|  21 | Fix `pnpm dev` blank app   | Quality  | High   | shared builds ESM beside CJS; `exports` routes each one       |
|   5 | Show results               | Value    | High   | Winner(s) and score table; `NotFound` (ID-18) if poll is gone |
|  17 | Migrate to PostgreSQL      | Quality  | High   | PostgreSQL adapter, local Compose, isolated e2e + CI          |
|  27 | Dockerize web and api      | Quality  | High   | Separate images + healthy local stack; enabled ID-29          |
|  31 | Rate-limit write endpoints | Quality  | High   | Per-IP fixed windows on both public write endpoints           |
|  35 | Graceful API shutdown      | Quality  | High   | SIGTERM drains HTTP, closes Prisma; process + Docker tests    |
|  28 | Manual offsite backup      | Quality  | High   | Offsite dump + clean restore + v0.1.0 API proof               |
|  29 | First production deploy    | Ops      | High   | Production deployment completed; VPS live                     |
|  39 | Add backlog sweep process  | Ops      | Medium | Sweep skill; request workflow + tracker Issue; `Cancelled`    |
|  40 | Record v0.1.0 evidence     | Ops      | Medium | #29 Completion evidence; changelog dated; stale docs fixed    |
|  19 | Explain score calculation  | Value    | Medium | Per-place Borda `breakdown`; score links to a Details view    |

---

## Cancelled

Items the owner decided are no longer wanted. They keep their ID, Title, Type
and Level; Notes records the reason.

<!-- prettier-ignore -->
|  ID | Title                      | Type     | Level  | Notes                                                         |
| --: | -------------------------- | -------- | ------ | ------------------------------------------------------------- |
