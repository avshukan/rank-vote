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

## Todo

| ID  | Title                           | Type    | Priority | Notes                                                                           |
| --- | ------------------------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| === | =============================== | ======= | ======== | =============================================================================== |
| 21  | Fix `pnpm dev` blank web app    | Quality | High     | Vite serves the CJS-only `shared` dist raw; named imports throw, `#root` empty  |
| 5   | Show results                    | Value   | High     | Winner(s) and score table; use the `NotFound` from #18 for the missing poll     |
| 17  | Migrate SQLite → PostgreSQL     | Quality | High     | Decision accepted in `docs/06-decisions.md`; do it before the first deploy      |
| 6   | Mobile responsive layout        | Quality | Medium   | Basic responsive UI                                                             |
| 19  | Explain score calculation       | Value   | Medium   | Show how the points produced the ranking; per counting method — needs #5        |
| 20  | Refresh results button          | Quality | Medium   | Manual re-fetch on the results page while there are no live updates (#16)       |
| 8   | Add IRV counting                | Value   | Medium   | Instant-runoff voting                                                           |
| 9   | Add Condorcet counting          | Value   | Medium   | Pairwise comparison winner                                                      |
| 10  | Compare counting methods        | Value   | Medium   | Show different winners for same ballots                                         |
| 11  | Add PWA support                 | Quality | Low      | Installable web app                                                             |
| 12  | Add poll editing                | Value   | Low      | Edit poll after creation                                                        |
| 13  | Add poll expiration             | Value   | Low      | Closing date/time                                                               |
| 14  | Add ranking with ties           | Value   | Low      | Multiple options can share same rank                                            |
| 15  | Add partial ranking             | Value   | Low      | Allow ranking only subset of options                                            |
| 16  | Add real-time updates           | Quality | Low      | Live result updates                                                             |

---

## Done

|  ID | Title                           | Type    | Priority | Notes                                                                           |
| --: | ------------------------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| === | =============================== | ======= | ======== | =============================================================================== |
|   1 | Create poll                     | Value   | High     | `POST`/`GET /api/v1/polls` + create page — golden-path slice across all layers  |
|   2 | Share poll link                 | Value   | High     | Shareable `/poll/:id` link with copy button, shown after creation               |
|   3 | Submit ballot                   | Value   | High     | `POST /polls/:id/ballots` + drag-and-drop vote page                             |
|   7 | Prevent duplicate voting        | Quality | Medium   | `voted_poll_ids` written on submit, checked in `VotePage` — delivered with #3   |
|   4 | Calculate Borda result          | Value   | High     | `GET /polls/:id/results` — Borda tally, ties give multiple winners              |
|  18 | Not-found page                  | Quality | High     | Shared `NotFound` + `*` catch-all route; vote flow uses it for a missing poll   |
