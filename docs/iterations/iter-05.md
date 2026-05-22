# Iteration 05 — Frontend: Vote Page

## Goal

Deliver the voting UI so that a participant can rank options and submit a ballot.

Backlog: #3

---

## Scope

### Vote Page (`features/vote/`)

- On load: check `localStorage` key `voted_poll_ids`
  - If poll ID is present → redirect to Results page immediately
- Fetch poll via `GET /api/v1/polls/:id`; show 404 message if not found
- Display question title and draggable option list
- Drag-and-drop reordering (all options visible, initial order from API)
- Submit button enabled only when all options have been given a rank (i.e. list is fully ordered)
- On submit: `POST /api/v1/polls/:id/ballots`
  - Build `entries` from current order: position 1 → rank 1, position 2 → rank 2, …
- On success:
  - Store poll ID in `localStorage` under key `voted_poll_ids`
  - Redirect to `/poll/:id/results`
- Loading and error states

### Tests

- Component: ranking list renders all options; submit button disabled before interaction (Vitest + RTL)

---

## Out of Scope

- Results display
- Duplicate vote protection beyond localStorage check (already implemented here)

---

## Definition of Done

- Participant can rank all options via drag-and-drop
- Submit is blocked until all options are ordered
- Successful submission stores the poll ID in localStorage and redirects
- Application builds and runs successfully
