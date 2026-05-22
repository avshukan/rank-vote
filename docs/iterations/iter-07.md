# Iteration 07 — Duplicate Vote Protection

## Goal

Prevent a user from voting on the same poll twice using soft client-side protection.

Backlog: #7

---

## Scope

This feature is partially implemented as part of iter-05 (storing the poll ID in localStorage after a successful vote). This iteration ensures the protection is complete and robust.

### Client-Side Check

- Before rendering the Vote page, read `localStorage` key `voted_poll_ids` (array of poll ID strings)
- If the current poll ID is found → redirect to `/poll/:id/results` without showing the vote form
- After a successful ballot submission → append poll ID to the array and persist back to `localStorage`

### Edge Cases

- `localStorage` unavailable (private browsing, storage quota exceeded): catch error and allow voting (fail open)
- Malformed `voted_poll_ids` value: reset to empty array and continue

### Tests

- Unit: localStorage read/write helpers (parse, append, handle errors)
- Component: Vote page redirects when poll ID is already in localStorage

---

## Out of Scope

- Server-side duplicate vote enforcement
- Cookie-based protection

---

## Definition of Done

- A user who has already voted is redirected to results without seeing the vote form
- Edge cases (unavailable storage, malformed data) do not break the app
- Tests pass
- Application builds successfully
