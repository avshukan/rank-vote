# Acceptance Criteria

Agreed scope per `docs/backlog.md` item, settled **before** the code is written
(`docs/07-process.md`, step 2). One section per item, added when the item is
picked up; a checked box means the shipped behaviour matches. Items with no
section here are listed under [Not specified yet](#not-specified-yet).

## #3 Submit Ballot

### API

- [x] `POST /polls/:id/ballots` accepts `{ entries: [{optionId, rank}] }`
- [x] `entries` is required; array length must equal number of poll options (N) — otherwise `400`
- [x] Each `optionId` must belong to the target poll — otherwise `400`
- [x] Duplicate `optionId` values → `400`
- [x] `rank` values must be unique consecutive integers 1..N — otherwise `400`
- [x] Non-existent poll → `404`
- [x] Response `201` contains `{ id, pollId, createdAt }`

### Frontend UX

- [x] Drag & drop interface for ranking all options
- [x] Reorder buttons (↑/↓) for touch devices
- [x] After successful submit (`201`): add poll ID to `localStorage` key `voted_poll_ids`, redirect to results page, show toast "Vote submitted"
- [x] On network error / 5xx: show inline error message, show retry button, do NOT clear form state
- [x] If poll ID already in `localStorage` key `voted_poll_ids`: redirect to results page, skip voting form entirely
      — guarded in `VotePage` before the poll is fetched; this also completes backlog item #7

### Edge Cases

- [x] Empty `entries` array → `400`
- [x] `entries: null` or missing → `400`
- [x] `optionId` that is a valid UUID but doesn't belong to this poll → `400`
- [x] `rank: 0`, negative rank, or rank > N → `400`
- [x] Concurrent duplicate submissions (race condition): accepted (no server-side dedup in MVP)

---

## #4 Calculate Borda Result

### API

- [x] `GET /polls/:id/results` returns `{ pollId, title, method: "BORDA", winners, scores, totalBallots }`
- [x] Borda formula: option at rank `r` out of N options gets `N − r` points
- [x] `winners` and `scores` entries share one shape: `{ optionId, text, score }`
- [x] `scores` always contains ALL poll options, even when 0 ballots
- [x] `scores` sorted by `score` DESC, then by `option.order` ASC
- [x] `winners` — array of all options with the maximum score (0+ elements; empty when `totalBallots: 0`)
- [x] On tie: all tied leaders included in `winners`
- [x] 0 ballots: `winners: []`, all options in `scores` with `score: 0`, `totalBallots: 0`
- [x] Non-existent poll → `404`
- [x] Results calculated on the fly (no cache)

### Edge Cases

- [x] Single ballot → correct scores
- [x] All options tied (e.g., single ballot of N options with equal distribution across multiple ballots) → all in `winners`
- [x] Large number of ballots — no timeout: one query loads the poll's ballots and
      the tally runs in memory; no load test was run, and caching stays post-MVP
- [x] Entries pointing at an option outside the poll are ignored by the count
      (the ballot validator already rejects them on submit)

---

## #18 Not-Found Page

Frontend only — no API or shared-package change.

### Frontend UX

- [x] `NotFound` (`src/shared/ui/`) renders a headline, a one-line description
      and a "Create a poll" link back to `/`
- [x] Default copy is about the route: "Page not found" / "This link does not
      lead anywhere."
- [x] Callers override `title`/`description` when a specific entity is missing
- [x] `NotFoundPage` (`src/pages/`) wraps `NotFound` in the page `<main>`;
      `NotFound` itself contributes no landmark, so flows that already own a
      `<main>` can render it inline without nesting landmarks
- [x] `*` catch-all route in `App.tsx` renders `NotFoundPage`
- [x] Vote flow reuse: `getPoll` answering `404` renders `NotFound` with
      "Poll not found" instead of the generic load error
- [x] A `404` shows **no** Retry button — it is final; non-404 load failures
      keep the retry affordance from #3

### Edge Cases

- [x] Unknown top-level path (`/no-such-place`) → not-found page
- [x] Path that over-runs a real route (`/poll/:id/results/extra`) → not-found page
- [x] Poll URL with a well-formed but unknown id → "Poll not found" via the API `404`
- [x] Server error (5xx) loading a poll → still the retryable error, not the 404 page

---

## #5 Show Results

### Frontend UX

- [x] Page `/poll/:id/results` is publicly accessible (no vote required to view)
- [x] Displays: poll title, winner badge, score table (position / option text / score), total ballots count
- [x] Single winner: show highlighted winner badge
- [x] Multiple winners (tie): show all with "Tied winners" label
- [x] Tied options share a position range and the next position skips past it:
      two options tied at the top are both `1-2`, the option after them is `3`.
      The rule applies to **every** group of equal scores, not only the winners:
      scores `5, 4, 4, 2` render as positions `1`, `2-3`, `2-3`, `4`
- [x] 0 ballots (`totalBallots: 0`): show message "No votes yet" + "Share link" button
      that copies the **vote** URL `/poll/:id` — a browser that already voted is
      redirected from there to these results, so one link serves both cases
- [x] The zero-ballot state **replaces** the winner badge and the score table;
      the poll title and the total ballots count still render. `scores` does
      arrive filled with every option at `score: 0`, but a table of nothing but
      zeroes is an empty state pretending to be data — the options themselves
      are one click away behind the share link
- [x] Results URL is shareable — anyone can open it directly
- [x] The "Vote submitted" banner (`location.state.justVoted`, set by the ballot
      form in #3) still renders on the finished page

### Edge Cases

- [x] Poll exists but 0 ballots → "No votes yet" UI (no crash)
- [x] Poll does not exist → the shared `NotFound` from #18, rendered inline with
      the "Poll not found" copy the vote flow already uses
- [x] Network error loading results → show error message with retry

### Out of Scope (tracked separately)

- Explaining how the points produced the ranking → backlog #19
- Manual "Refresh results" button → backlog #20
- Full mobile layout → backlog #6; this task ships basic Tailwind responsiveness only

---

## #17 Migrate to PostgreSQL

Accepted in `docs/06-decisions.md` (Storage, Database Hosting); requirements in
`docs/10-storage.md`. Shipped before #27. The readiness decisions below record
the local provisioning and e2e isolation contract implemented by this slice.

### Database

- [x] `datasource db` in `apps/api/prisma/schema.prisma` uses provider
      `postgresql`
- [x] The Prisma 7 driver adapter in
      `src/infrastructure/prisma/prisma.service.ts` is swapped from
      `@prisma/adapter-better-sqlite3` to the PostgreSQL adapter, and the
      SQLite adapter dependency is dropped
- [x] The migration history is regenerated for PostgreSQL — there is no
      production data, so the SQLite `init` migration is replaced, not migrated
- [x] Models are otherwise unchanged: `Poll`, `PollOption`, `Ballot`,
      `BallotEntry` keep their fields, relations and UUID ids as documented in
      `docs/10-storage.md`
- [x] `prisma migrate deploy` against an empty database reproduces that schema

### Local development

- [x] A repository-root `docker-compose.yml` contains a PostgreSQL service only;
      container images and services for `web` and `api` are not introduced
- [x] `make db-up` starts that local PostgreSQL, after which `make api` /
      `pnpm dev` can reach it and `make db-migrate` works against it
- [x] The local PostgreSQL provisions separate development and fixed
      `rank_vote_test` databases; #27 later extends the Compose stack with
      `web` and `api`
- [x] `apps/api/.env.example` carries a PostgreSQL `DATABASE_URL`, and
      `make setup` still yields a working `.env`

### Tests and CI

- [x] Every e2e run receives an explicit test-only `DATABASE_URL` that points at
      the dedicated `rank_vote_test` database; it must not fall back to or reset
      the development database
- [x] Before Jest starts the e2e suite, `prisma db push --force-reset` recreates
      the schema in `rank_vote_test`, so consecutive runs are isolated
- [x] Unit tests stay database-free (Prisma is mocked)
- [x] CI supplies a PostgreSQL instance so `pnpm test` is green on a clean
      runner; CI may use its native service mechanism rather than Compose, and
      `make verify` mirrors the same test contract locally

### Behaviour unchanged

- [x] All four documented product endpoints keep the contract in
      `docs/09-api-design.md`, including the `400`/`404` cases
- [x] `scores` keeps its order (score DESC, then `option.order` ASC) and ties
      still produce multiple `winners` (#4)

### Documentation

- [x] `docs/10-storage.md`: the "Current SQLite backup and migration" section
      is replaced by its PostgreSQL equivalent
- [x] `docs/05-architecture.md` no longer names SQLite as the current
      implementation; `README.md`, `AGENTS.md`, `docs/08-known-limitations.md`
      and the `new-slice` skill no longer describe SQLite or the absence of all
      Compose infrastructure as the current state
- [x] `docs/11-testing-strategy.md` and `docs/implementation-plan.md` describe
      the implemented PostgreSQL workflow rather than the pending target
- [x] `docs/backlog.md`: #17 moves to `## Done`

### Out of Scope (tracked separately)

- Container images for `web`/`api` and the application compose stack → #27
- First production deployment → #29
- Manual offsite backup and restore drill after deployment → #28
- Automated offsite backups → #32

### Readiness Decisions

- #17 owns the first Compose file, but only for the local PostgreSQL service.
  The standard repository entry point is `make db-up`. #27 later adds the
  application images and the `web` / `api` services to the Compose stack.
- CI must supply PostgreSQL but is not required to run this local-development
  Compose file; a native CI service is acceptable.
- The e2e suite uses the fixed `rank_vote_test` database. Its process must be
  given an explicit test-only `DATABASE_URL` and must run
  `prisma db push --force-reset` before Jest. The development database is never
  a reset target.
- No architectural or product questions remain open for #17.

---

## Not specified yet

Open backlog items with no criteria in this file. Listed so the gap is visible;
run `task-readiness` when one is picked up.

- **#27 Dockerize web and api** — the decision in `docs/06-decisions.md` fixes
  the shape (one image per app, `docker-compose`), but base images, the nginx
  configuration, build-time `VITE_API_URL` injection and health checks are all
  unsettled.
- **#31 Rate-limit write endpoints** — basic protection for the two public
  unauthenticated POST endpoints must be decided before the first public deploy.
- **#29 First production deploy** — needs a host, a domain, TLS termination,
  secret handling and a release ritual; it needs #27 and #31.
- **#28 Manual offsite backup** — after #29, create a logical dump, copy it to
  the owner's local machine outside DigitalOcean, restore it into clean
  PostgreSQL and verify the application can use the restored database.
- **#32 Automate offsite backups** — after #28 proves recovery, choose the
  independent object-storage provider, schedule, retention, encryption,
  monitoring and restore-test cadence.
- **#33 Add production monitoring** — health, alerting and error tracking are
  intentionally tracked separately from the first deployment.
- Everything else at `Medium`/`Low` priority — criteria are written when the
  item is picked up, not in advance.

---

## Post-MVP (documented, not required now)

- Keyboard/a11y reorder for ballot
- Results caching
- Real-time result updates
- Percentage column in score table
- Server-side duplicate vote protection
