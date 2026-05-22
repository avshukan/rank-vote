# Iteration 06 — Frontend: Results Page

## Goal

Deliver the results UI so that participants can see the winner and score breakdown immediately after voting.

Backlog: #5

---

## Scope

### Results Page (`features/results/`)

- Fetch results via `GET /api/v1/polls/:id/results`
- Winner banner: highlight the winning option prominently
- Score table: all options sorted by score descending, showing option text and score
- Total ballots count displayed
- Zero-ballot state: "No votes yet" message (winner is null, scores empty)
- Poll not found: 404 message
- Loading and error states

### Tests

- Unit: score sort helper (descending), score formatter
- Component: winner banner renders correctly; score table lists all options

---

## Out of Scope

- Multiple counting methods display
- Real-time updates

---

## Definition of Done

- Results are shown immediately after ballot submission (redirect from vote page)
- Winner is clearly identified
- Score table is complete and correctly sorted
- Zero-vote state is handled gracefully
- Application builds and runs successfully
