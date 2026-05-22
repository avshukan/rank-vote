# Iteration 03 — Backend: Submit Ballot + Borda Results

## Goal

Complete the backend by adding ballot submission and result calculation with the Borda count method.

Backlog: #3, #4, #5

---

## Scope

### Domain Layer

- `BordaCount` service:
  - Input: list of ballots with ranked entries
  - Algorithm: for N options, rank 1 → N−1 points, rank 2 → N−2 points, …, last → 0 points
  - Output: options sorted by total score descending, winner identified
- Ballot validator:
  - All poll options must be present in the submitted entries
  - Ranks are unique consecutive integers starting from 1

### Application Layer

- `BallotService.submitBallot(pollId, dto)` — validates ballot, persists `Ballot` + `BallotEntry` records, returns ballot DTO
- `BallotService.getResults(pollId)` — loads all ballots, runs Borda count, returns results DTO

### Presentation Layer

- `POST /api/v1/polls/:id/ballots` — validates input, calls `submitBallot`, returns 201 or 400/404
- `GET /api/v1/polls/:id/results` — calls `getResults`, returns 200 or 404
  - Returns `winner: null` and empty `scores` when no ballots submitted

### Tests

- Unit: `BordaCount` algorithm (multiple ballots, tie-breaking), ballot validator (valid, missing option, duplicate rank, non-consecutive rank)
- Integration: `POST /api/v1/polls/:id/ballots` (valid + invalid), `GET /api/v1/polls/:id/results` (with and without ballots)

---

## Out of Scope

- Frontend
- Multiple counting methods (IRV, Condorcet)

---

## Definition of Done

- All four API endpoints work end-to-end
- Borda count produces correct scores
- Invalid ballots are rejected with 400
- Unit and integration tests pass
- Application builds successfully
