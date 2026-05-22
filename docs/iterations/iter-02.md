# Iteration 02 — Backend: Create Poll + Get Poll

## Goal

Deliver the first two working API endpoints so that a poll can be created and retrieved.

Backlog: #1, #2

---

## Scope

### Database

- Write Prisma schema: `Poll`, `PollOption`, `Ballot`, `BallotEntry`
- Run initial migration (`prisma migrate dev`)
- Configure `DATABASE_URL` in `.env`

### Domain Layer

- No domain logic required for this iteration

### Application Layer

- `PollService.createPoll(dto)` — creates `Poll` + `PollOption` records, returns full poll DTO
- `PollService.getPoll(id)` — returns poll with options, throws `NotFoundException` if missing

### Presentation Layer

- `POST /api/v1/polls` — validates input, calls `createPoll`, returns 201
- `GET /api/v1/polls/:id` — calls `getPoll`, returns 200 or 404
- Global `ValidationPipe` configured
- CORS origin set via env var

### Tests

- Unit: `PollService` (create, get, not-found)
- Integration: `POST /api/v1/polls` (valid + invalid), `GET /api/v1/polls/:id` (found + not found)

---

## Out of Scope

- Ballot submission
- Result calculation
- Frontend

---

## Definition of Done

- Both endpoints return correct responses and status codes
- Invalid inputs return 400; missing poll returns 404
- Unit and integration tests pass
- Application builds successfully
