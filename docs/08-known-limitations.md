# Known Limitations

## Product Scope

Current MVP intentionally focuses on:

- small groups
- anonymous voting
- simple ranked ballots
- one primary counting method

---

## Voting

### Initial counting support

Only Borda count is implemented in MVP.

Other methods are planned later:

- IRV
- Condorcet
- Schulze
- Ranked Pairs

---

### Initial ballot format

MVP supports only:

- strict full ranking

Not supported yet:

- ranking with ties
- partial ranking
- pairwise ballots

---

## Authentication

MVP does not include:

- accounts
- authentication
- user profiles

Duplicate vote prevention is soft only.

---

## Real-Time Features

MVP does not include:

- live updates
- websockets
- collaborative sessions

Users may need to refresh the page manually.

---

## Mobile Support

Initial version targets:

- desktop browsers
- basic mobile responsiveness

No native mobile app support.

---

## Scalability

MVP is not optimized for:

- large polls
- high traffic
- complex analytics

---

## Security

MVP is intentionally lightweight and does not yet include:

- advanced anti-spam protection
- strong duplicate vote prevention
- private polls
- role management

The public write endpoints (`POST /polls`, `POST /polls/:id/ballots`) remain
unauthenticated, but basic per-client-IP rate limiting is implemented: 5 poll
creations and 300 ballot submissions per 60-minute fixed window. The counters
are process-local and reset on restart, so the first deployment requires
exactly one API replica until #34 adds shared counters. This is a basic abuse
guardrail, not DDoS protection, authentication or strong duplicate-vote
prevention.

---

## Operations

The owner has operated verified release `v0.1.0`; #29 remains Todo pending its
separate post-deployment documentation closure. The repository contains a
complete local Compose stack for PostgreSQL, migrations, the API and the web
application. The single-VPS production contract is specified under #29 in
`docs/acceptance-criteria.md`; `docs/production.md` documents its operator
sequence. Remaining operational limitations are:

- `web` / `api` images and container smoke tests exist, but there is no CD
  pipeline — CI builds and tests, then stops; #29 deploys them
- the #28 manual dump, offsite transfer and clean restore drill succeeded, but
  scheduled independent backups remain backlog #32
- no production monitoring, alerting, or error tracking; tracked as #33
- API handles Docker `SIGTERM`, drains HTTP and closes Prisma (#35); the
  production Compose declares a 30-second stop grace period. Requests exceeding
  that period may be killed by Docker
- results are recalculated on every request, with no caching — deliberate at
  MVP scale, see `docs/09-api-design.md`
