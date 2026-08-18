# Backlog

## Legend

### Type

| Type     | Description                           |
| -------- | ------------------------------------- |
| Value    | User-facing functionality             |
| Quality  | UX, reliability, performance, safety  |
| Refactor | Internal code or architecture cleanup |

---

### Priority

| Priority | Description                 |
| -------- | --------------------------- |
| High     | Required for MVP            |
| Medium   | Important after MVP         |
| Low      | Nice-to-have or future work |

---

## Format

The `Todo` and `Done` tables have **fixed column widths**:

| ID  | Title | Type | Priority | Notes |
| --- | ----- | ---- | -------- | ----- |
| 3   | 26    | 7    | 8        | 60    |

With the separators that makes every row exactly 120 characters wide, and the
`| --- | ---…` row under each header doubles as the ruler to pad against.

Never widen a column. That is what keeps a backlog diff down to the lines that
actually changed, instead of a re-alignment of every row.

- **One item is one row.** A note that does not fit its 60 characters gets
  shortened, never wrapped onto a second row — `Notes` is a one-line hint, and
  anything longer belongs in `docs/` or in the item's PR.
- Both tables are preceded by `<!-- prettier-ignore -->`, so Prettier will not
  re-align them — pad the cells by hand.
- The two `Legend` tables are ordinary Prettier-managed tables; this rule covers
  the backlog tables only.

---

## Todo

<!-- prettier-ignore -->
| ID  | Title                      | Type    | Priority | Notes                                                        |
| --- | -------------------------- | ------- | -------- | ------------------------------------------------------------ |
| 5   | Show results               | Value   | High     | Winner(s) and score table; `NotFound` (#18) if poll is gone  |
| 17  | Migrate to PostgreSQL      | Quality | High     | Accepted in `docs/06-decisions.md`; before first deploy      |
| 6   | Mobile responsive layout   | Quality | Medium   | Basic responsive UI                                          |
| 19  | Explain score calculation  | Value   | Medium   | How the points produced the ranking, per method; needs #5    |
| 20  | Refresh results button     | Quality | Medium   | Manual re-fetch on the results page until #16 lands          |
| 8   | Add IRV counting           | Value   | Medium   | Instant-runoff voting                                        |
| 9   | Add Condorcet counting     | Value   | Medium   | Pairwise comparison winner                                   |
| 10  | Compare counting methods   | Value   | Medium   | Show different winners for same ballots                      |
| 11  | Add PWA support            | Quality | Low      | Installable web app                                          |
| 12  | Add poll editing           | Value   | Low      | Edit poll after creation                                     |
| 13  | Add poll expiration        | Value   | Low      | Closing date/time                                            |
| 14  | Add ranking with ties      | Value   | Low      | Multiple options can share same rank                         |
| 15  | Add partial ranking        | Value   | Low      | Allow ranking only subset of options                         |
| 16  | Add real-time updates      | Quality | Low      | Live result updates                                          |
| 22  | Add OpenAPI spec           | Quality | Low      | Deferred until an outside client lands (mobile app, bot)     |
| 23  | `/critique` command        | Quality | Low      | Design self-critique; seen 1× 2026-08-13, write on the 2nd   |

---

## Done

<!-- prettier-ignore -->
|  ID | Title                      | Type    | Priority | Notes                                                        |
| --: | -------------------------- | ------- | -------- | ------------------------------------------------------------ |
|   1 | Create poll                | Value   | High     | `POST`/`GET /api/v1/polls` + create page; golden-path slice  |
|   2 | Share poll link            | Value   | High     | Shareable `/poll/:id` link with copy button after creation   |
|   3 | Submit ballot              | Value   | High     | `POST /polls/:id/ballots` + drag-and-drop vote page          |
|   7 | Prevent duplicate voting   | Quality | Medium   | `voted_poll_ids` on submit, checked in `VotePage`; with #3   |
|   4 | Calculate Borda result     | Value   | High     | `GET /polls/:id/results` — Borda tally, ties give winners    |
|  18 | Not-found page             | Quality | High     | Shared `NotFound` + `*` catch-all; used by the vote flow     |
|  21 | Fix `pnpm dev` blank app   | Quality | High     | shared builds ESM beside CJS; `exports` routes each one      |
