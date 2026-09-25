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

| Level  | Description                                         |
| ------ | --------------------------------------------------- |
| High   | Important to address soon; significant impact      |
| Medium | Valuable work that can reasonably wait             |
| Low    | Nice-to-have, speculative, or longer-term work     |

---

### State

| State   | Description                                      |
| ------- | ------------------------------------------------ |
| —       | Task-readiness has not been run                 |
| Ready   | Ready to implement                               |
| Design  | Needs analysis or design before implementation   |
| Blocked | Cannot start until a known blocker is resolved   |

---

## Workflow

- Raw ideas are captured as GitHub Issues. No extra metadata is required at
  capture time.
- Triage decides whether to keep, discard, merge, or split an idea. Kept ideas
  become `Todo` rows; the source issue is then closed as moved to the backlog.
- New backlog items start with `State = —`.
- Task-readiness can run on demand for a chosen item or proactively for likely
  next work. It sets `State` to `Ready`, `Design`, or `Blocked`.
- Backlog sweeps keep items, levels, types, dependencies, and states current.
- Work is pulled continuously from `Ready` items. `Level` guides selection but
  is not a strict queue order.
- A detailed file under `docs/backlog/<id>-<slug>.md` is optional when one row
  is not enough. It is normally deleted when the task is done; durable decisions
  move to permanent documentation.

---

## Format

The `Todo` and `Done` tables have **fixed column widths**:

| Table | ID | Title | Type | Level | State | Notes |
| ----- | -- | ----- | ---- | ----- | ----- | ----- |
| Todo  | 3  | 26    | 8    | 6     | 7     | 51    |
| Done  | 3  | 26    | 8    | 6     | —     | 61    |

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
  Issue/PR numbers such as `#19`.
- Both backlog tables are preceded by `<!-- prettier-ignore -->`, so Prettier
  will not re-align them; pad the cells by hand.
- The `Legend` and width tables are ordinary Prettier-managed tables.

---

## Todo

<!-- prettier-ignore -->
| ID  | Title                      | Type     | Level  | State   | Notes                                               |
| --- | -------------------------- | -------- | ------ | ------- | --------------------------------------------------- |
| 6   | Mobile responsive layout   | Quality  | Medium | —       | Basic responsive UI                                 |
| 19  | Explain score calculation  | Value    | Medium | —       | How points produce ranking; needs ID-5              |
| 20  | Refresh results button     | Quality  | Medium | —       | Manual results refresh until ID-16                  |
| 8   | Add IRV counting           | Value    | Medium | —       | Instant-runoff voting                               |
| 9   | Add Condorcet counting     | Value    | Medium | —       | Pairwise comparison winner                          |
| 10  | Compare counting methods   | Value    | Medium | —       | Show different winners; needs ID-8, ID-9            |
| 25  | Unify eslint and TS majors | Refactor | Medium | —       | web eslint 10/TS 6; rest eslint 9/TS 5              |
| 26  | Extract page fetch/retry   | Refactor | Medium | —       | BallotForm/ResultsView duplicate load/404/retry     |
| 30  | Drop the scaffold endpoint | Refactor | Medium | —       | `GET /api/v1` stays; liveness separate in ID-27     |
| 32  | Automate offsite backups   | Ops      | High   | —       | Schedule dumps to independent object storage        |
| 33  | Add production monitoring  | Ops      | Medium | —       | Dependency health, monitoring and alerts            |
| 34  | Share rate-limit state     | Quality  | Low    | —       | Shared counters before API replicas >1              |
| 11  | Add PWA support            | Quality  | Low    | —       | Installable web app                                 |
| 12  | Add poll editing           | Value    | Low    | —       | Edit poll after creation                            |
| 13  | Add poll expiration        | Value    | Low    | —       | Closing date/time                                   |
| 14  | Add ranking with ties      | Value    | Low    | —       | Multiple options can share same rank                |
| 15  | Add partial ranking        | Value    | Low    | —       | Allow ranking only subset of options                |
| 16  | Add real-time updates      | Quality  | Low    | —       | Live result updates                                 |
| 22  | Add OpenAPI spec           | Quality  | Low    | —       | Deferred until an outside client lands (app, bot)   |
| 23  | `/critique` command        | Ops      | Low    | —       | Design self-critique; seen 2×; write on 3rd         |
| 24  | `pnpm dev` orphans the API | Ops      | Low    | —       | Ctrl+C leaves `node dist/main` on 3000              |

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
|  27 | Dockerize web and api      | Quality  | High   | Separate images + healthy local stack; blocks ID-29           |
|  31 | Rate-limit write endpoints | Quality  | High   | Per-IP fixed windows on both public write endpoints           |
|  35 | Graceful API shutdown      | Quality  | High   | SIGTERM drains HTTP, closes Prisma; process + Docker tests    |
|  28 | Manual offsite backup      | Quality  | High   | Offsite dump + clean restore + v0.1.0 API proof               |
|  29 | First production deploy    | Ops      | High   | Production deployment completed; VPS live                     |
