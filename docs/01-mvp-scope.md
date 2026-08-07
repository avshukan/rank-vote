# MVP Scope

## Goal

Deliver a minimal product that allows small groups to create a poll, rank options, and see a fair result.

---

## Core Features

### Create poll

- question (text)
- 2–10 options
- generate unique link

---

### Vote

- drag & drop ranking
- full ranking required
- anonymous
- after submit: redirect to results page, show toast confirmation
- on network error: show inline error, retry button, preserve form state
- duplicate vote protection: client-side via localStorage (poll_id stored after submit)

---

### Results

- show winner(s) (Borda count) — supports tie (multiple winners)
- show score table

---

## Constraints

- no authentication
- no roles
- no editing after creation
- no deadlines
- no real-time updates

---

## Out of Scope (for now)

- multiple voting methods (IRV, Condorcet)
- partial ranking
- vote privacy controls
- analytics
- mobile app (native)

---

## Success Criteria

- user can create a poll in < 1 minute
- users can vote without instructions
- result is clear and immediate
