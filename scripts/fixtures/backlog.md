# Backlog fixture

A fixed backlog in the `docs/backlog.md` format, for
`scripts/backlog-promotion.test.mjs`. Its rows are made up. Its columns (names,
widths, alignment) and Legend values must match the real backlog's; the format
test of `docs/backlog.md` checks that, so changing either means editing both
files. The tests that need particular rows read this file, so moving,
cancelling or rewording rows in `docs/backlog.md` never requires a test change.

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

## Todo

<!-- prettier-ignore -->
| ID  | Title                      | Type     | Level  | State   | Notes                                               |
| --- | -------------------------- | -------- | ------ | ------- | --------------------------------------------------- |
| 4   | Fixture item 4             | Value    | High   | Ready   | Synthetic row; IDs, titles and notes are made up    |
| 9   | Fixture item 9             | Ops      | Medium | —       | Readiness not run yet                               |
| 2   | Fixture item 2             | Quality  | Low    | Design  | Needs a spike first                                 |
| 7   | Fixture item 7             | Refactor | Medium | Blocked | Waits for ID-2                                      |
| 8   | Fixture item 8             | Value    | Low    | Ready   | Exactly 51 characters wide; `code` and → count once |
| 10  | Fixture item 10 full width | Ops      | High   | —       | Promoted last, so it holds the highest ID           |

---

## Done

<!-- prettier-ignore -->
|  ID | Title                      | Type     | Level  | Notes                                                         |
| --: | -------------------------- | -------- | ------ | ------------------------------------------------------------- |
|   1 | Fixture item 1             | Value    | High   | Synthetic row; Done IDs are right-aligned                     |
|   6 | Fixture item 6             | Ops      | Low    | Finished before ID-3, so it stays above it                    |
|   3 | Fixture item 3             | Quality  | Medium | Exactly 61 characters wide; as wide as the whole Notes column |

---

## Cancelled

Items the owner decided are no longer wanted. They keep their ID, Title, Type
and Level; Notes records the reason.

<!-- prettier-ignore -->
|  ID | Title                      | Type     | Level  | Notes                                                         |
| --: | -------------------------- | -------- | ------ | ------------------------------------------------------------- |
|   5 | Fixture item 5             | Refactor | Low    | No longer wanted; superseded by ID-6                          |
