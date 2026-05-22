# Iteration 04 — Frontend: Create Poll Page

## Goal

Deliver the poll creation UI so that a user can create a poll and get a shareable link.

Backlog: #1, #2

---

## Scope

### Routing

- Set up React Router with initial routes: `/`, `/poll/:id`, `/poll/:id/results`

### API Client (`shared/`)

- Thin `fetch` wrapper configured with `VITE_API_URL`
- Typed methods for: `createPoll`, `getPoll`, `submitBallot`, `getResults`

### Create Poll Page (`features/create-poll/`)

- Title input field (required, non-empty)
- Dynamic option list:
  - Minimum 2 options, maximum 10
  - Add option button (disabled at 10)
  - Remove option button per row (disabled when only 2 remain)
- "Create" button — disabled while form is invalid
- On submit: `POST /api/v1/polls`
- On success: display shareable URL + copy-to-clipboard button
- Loading and error states

### Tests

- Unit: option list add/remove boundary logic

---

## Out of Scope

- Vote page
- Results page
- Drag-and-drop

---

## Definition of Done

- User can create a poll in under 1 minute
- Shareable link is displayed after creation
- Invalid forms cannot be submitted
- Application builds and runs successfully
