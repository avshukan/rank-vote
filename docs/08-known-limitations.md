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

The public write endpoints (`POST /polls`, `POST /polls/:id/ballots`) are
unauthenticated and unthrottled. Basic rate limiting is required before the
first public deployment and is tracked as backlog #31.

---

## Operations

Nothing is deployed yet, and the repository contains no deployment
infrastructure:

- no container images, no `docker-compose`, no CD pipeline — CI builds and
  tests, and stops there (backlog #27, #29)
- storage is still SQLite; PostgreSQL is accepted but not migrated
  (backlog #17)
- no backups yet: the first manual offsite backup and restore drill is #28,
  followed by automated offsite backups in #32
- no production monitoring, alerting, or error tracking; tracked as #33
- results are recalculated on every request, with no caching — deliberate at
  MVP scale, see `docs/09-api-design.md`
