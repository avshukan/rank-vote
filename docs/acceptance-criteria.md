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

## ID-20 Refresh results button

Manual result refresh for the existing results pages until ID-16 ships
real-time updates. Frontend only: no API, shared-package or storage changes.

Refresh and Retry keep the counting method the page shows, selected by ID-8's
`method=BORDA|IRV` query parameter. These method rules hold whether ID-8 ships
before or after ID-20: if ID-20 ships first, there is no `method` yet, and the
IRV rules and checks below apply once ID-8 adds it.

### Scope

- [ ] Add a visible "Refresh results" button on `/poll/:id/results` and
      `/poll/:id/results/options/:optionId` in loaded states, including the
      zero-ballot state
- [ ] Clicking the button re-fetches `GET /polls/:id/results` for that poll and
      the currently selected counting method, and re-renders from the fresh
      response
- [ ] On Borda Results and Details, refresh keeps Borda behavior; an omitted
      `method` may still use the BORDA default
- [ ] On IRV Results and Details, refresh requests
      `GET /polls/:id/results?method=IRV` and never switches the page from IRV
      back to Borda
- [ ] The button keeps each page on its current route (`/results` or
      `/results/options/:optionId`), including its `method` query parameter
- [ ] The button follows the ID-6 mobile contract, whether ID-6 ships before or
      after ID-20: it is at least 24×24 CSS px and adds no horizontal scrolling
      at 320 CSS px
- [ ] API and shared DTO contracts stay unchanged

### States and edge cases

- [ ] `404` remains the shared not-found state with no Retry and no refresh
      button
- [ ] Network/5xx load failures remain retryable through the existing Retry
      button. Retry re-fetches the currently selected method, so a failed IRV
      request retries IRV rather than the default Borda method
- [ ] The existing score-breakdown link and back-link behavior stays unchanged
- [ ] The vote-submitted banner on the results page remains unchanged

### Verification

- [ ] **Web tests (Vitest):** both views re-fetch on "Refresh results" from a
      loaded state; existing not-found and Retry behavior still passes
- [ ] **Web tests (Vitest), IRV:** "Refresh results" on IRV Results and on IRV
      Details requests `method=IRV`, and the selected method remains IRV: the
      URL keeps `method=IRV` and the page still renders the IRV variant. A
      failed IRV load retries with `method=IRV`
- [ ] **API tests:** unchanged (manual refresh reuses the existing
      `GET /polls/:id/results` contract)
- [ ] **Manual:** against `make web` + `make api`, submit a ballot in one tab,
      use "Refresh results" in another tab on both pages, and see updated
      totals without navigation

### Out of Scope (tracked separately)

- Live automatic updates (push/polling/websockets) → ID-16
- Extracting shared load/error/retry/refresh logic between results views → ID-26

### Readiness Decisions

- Accepted by the owner: "Refresh results" appears on both `/poll/:id/results`
  and `/poll/:id/results/options/:optionId`, because both can become stale
- Accepted by the owner: ID-20 is temporary and should be removed by default
  once ID-16 lands, unless ID-16 explicitly keeps it as fallback
- Accepted by the owner: refresh, and the existing Retry, re-fetch the
  currently selected counting method and keep the route's `method` query
  parameter. This is a compatibility update for ID-8's method selection, not a
  new feature
- Implementation choices, settled in the implementation PR and its review:
  button placement, whether refresh is disabled while a request is in
  flight, and how much shared fetch/retry logic is reused without doing ID-26
- Accepted by the owner in the 2026-10-19 backlog sweep: the button follows the
  ID-6 mobile contract, like ID-19's Details view
- No architectural or product questions remain open for ID-20.

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

## #27 Dockerize web and api

Accepted in `docs/06-decisions.md` (Deployment, Containerization) after #17
shipped the PostgreSQL-only Compose stack. This slice packages the applications
and proves that the complete stack can start locally; it does not deploy it.

### Images and workspace build

- [x] `apps/web` and `apps/api` each have their own multi-stage Docker image,
      built from the repository-root context so the workspace lockfile and
      `@rank-vote/shared` are available
- [x] Build and API runtime stages use Node 22 Alpine plus the pnpm version
      pinned in the root `package.json`; dependencies are installed from the
      frozen lockfile
- [x] Maintained, explicit base-image tags are used instead of `latest`: Node 22
      Alpine for build/API stages and nginx Alpine for the web runtime. Selecting
      the exact patch tags is an implementation-time maintenance choice, not a
      new architecture decision
- [x] A root `.dockerignore` excludes host `node_modules`, build output, Git
      metadata, coverage, logs and local `.env` files, so both images build from
      a clean checkout rather than accidentally copying host artifacts or secrets

### Web image

- [x] The build requires `VITE_API_URL` as a Docker build argument and makes it
      available to Vite only while producing the static bundle; a direct image
      build without the argument fails instead of embedding the source fallback
- [x] Compose passes a local-development default of
      `http://localhost:3000/api/v1`; #29 supplies the production value when it
      builds the production web image
- [x] The builder produces the ESM half of `@rank-vote/shared` and
      `apps/web/dist`; the nginx runtime contains only the static output and its
      server configuration, not Node.js, pnpm or workspace source
- [x] nginx listens on container port `80`; `index.html` is the fallback for
      client-side routes such as `/poll/:id` and `/poll/:id/results`
- [x] Vite's content-hashed `/assets/` files receive long-lived immutable cache
      headers; `index.html` and unhashed root assets do not receive immutable
      caching, so a new deployment can be discovered
- [x] nginx does not proxy the API and does not rewrite configuration at runtime;
      the browser calls the absolute API URL embedded at build time

### API image

- [x] The build explicitly generates the Prisma Client, builds the CommonJS half
      of `@rank-vote/shared`, then builds `apps/api`; it does not depend on ignored
      `dist` or generated files already existing on the host
- [x] The runtime starts the compiled Nest application with the production
      command and is reachable on all container interfaces at `PORT` (default
      `3000`)
- [x] The runtime contains the compiled API (including the generated Prisma
      Client), the CommonJS shared-package output and required production
      dependencies
- [x] The same API image also contains the Prisma CLI plus the committed schema,
      config and migration history required for `prisma migrate deploy`; no
      second migration image is introduced
- [x] `DATABASE_URL`, `PORT` and `CORS_ORIGIN` are runtime environment variables;
      no database credentials or environment-specific API settings are baked
      into the image

### Compose and database migrations

- [x] The repository-root Compose file extends, rather than replaces, #17 with
      services named `postgres`, `migrate`, `api` and `web` on the default
      Compose network
- [x] The existing PostgreSQL 17 Alpine image, development/test initialization,
      `pg_isready` healthcheck, `5432:5432` local port and
      `rank_vote_postgres_data` named volume are preserved; routine stack
      teardown does not delete the volume
- [x] The API connects to `postgres:5432` inside the Compose network and receives
      local runtime values for `DATABASE_URL`, `PORT=3000` and
      `CORS_ORIGIN=http://localhost:5173`
- [x] The one-shot `migrate` service reuses the API image, publishes no port,
      waits for healthy PostgreSQL and runs `prisma migrate deploy`; rerunning an
      already-applied migration history succeeds without changing data
- [x] `api` starts only after `migrate` completes successfully, and `web` starts
      only after the API healthcheck passes. The API container itself does not
      run migrations in its entrypoint
- [x] The local stack publishes nginx as `5173:80` and the API as `3000:3000`;
      service-to-service traffic continues to use container ports and service
      names
- [x] `make db-up` still starts only PostgreSQL for the existing host-native
      development flow. Documented `make stack-up` / `make stack-down` targets
      start or stop the complete containerized stack, wait for its health where
      applicable and preserve the database volume

### Operational liveness

- [x] `GET /api/v1/health` returns `200` with exactly `{ "status": "ok" }` and
      has an API e2e contract test
- [x] The endpoint is operational liveness, not a fifth product endpoint: it
      does not query PostgreSQL or any other dependency and does not promise
      readiness
- [x] The route is implemented separately from the scaffold
      `AppController`/`AppService` and needs no shared product DTO, so #30 can
      remove `GET /api/v1` without changing the liveness contract
- [x] The API Compose healthcheck calls `/api/v1/health`; the web healthcheck
      verifies that nginx serves the built application; PostgreSQL keeps its
      existing `pg_isready` check
- [x] No healthcheck calls the scaffold `GET /api/v1` endpoint

### Verification and documentation

- [x] Both images build from a clean checkout, the Compose model validates, and
      an isolated-stack smoke check proves migrations, API liveness, a product
      API request, the web root and a direct nested SPA route
- [x] CI exercises the image builds and container smoke check, while the existing
      API e2e suite may continue to use CI's native PostgreSQL service
- [x] The manual end-to-end check runs create → share → vote → results through
      the containerized web and API services
- [x] Runtime/build configuration and container commands are documented without
      describing the not-yet-performed production deployment as current state

### Out of Scope (tracked separately)

- Rate limiting for public write endpoints → #31
- VPS provisioning, registry/push policy, domain and TLS, production port
  exposure, secret/env handling, production `VITE_API_URL`, release tags and the
  deployment/migration release ritual → #29
- Removing the scaffold `GET /api/v1` endpoint → #30
- Dependency-aware readiness, external uptime monitoring, alerting and error
  tracking → #33
- Manual and automated offsite backups → #28 and #32 respectively

### Readiness Decisions

- `VITE_API_URL` is a required build argument because Vite substitutes it into
  the static bundle. The local Compose default is development-only; #29 chooses
  the production value. Runtime templating and an nginx API proxy are rejected
  for this slice.
- Migrations are a one-shot Compose job that reuses the API image. Ordering is
  `postgres` healthy → `migrate` completed successfully → `api` healthy → `web`.
  This makes a fresh local stack usable without coupling schema changes to every
  API replica's entrypoint.
- `/api/v1/health` is a minimal operational liveness contract only. It is
  separate from the scaffold root, deliberately ignores dependencies and gives
  #33 a stable process-level signal to consume or complement later.
- #27 retains #17's local PostgreSQL contract and adds a complete local
  container stack. #29 owns every production-host and release choice, so #27
  neither deploys nor defines a production release ritual.
- Multi-stage build layout, maintained base-image patch selection, static-asset
  cache headers, container-internal wiring and the exact workspace-pruning
  technique are engineering judgment calls within the contracts above.
- No architectural or product questions remain open for #27.

---

## #31 Rate-limit write endpoints

Implemented by backlog #31. This slice adds basic abuse protection to the two
anonymous write endpoints without changing the product's no-authentication
contract and unblocks the first production deployment (#29).

### Endpoint scope and limits

- [x] `POST /api/v1/polls` allows 5 requests per client IP in a 60-minute
      window
- [x] `POST /api/v1/polls/:id/ballots` allows 300 requests per client IP in a
      separate 60-minute window; one IP's ballot bucket is shared across all
      poll IDs
- [x] The poll-creation and ballot-submission buckets are independent: traffic
      to one does not consume capacity from the other
- [x] The first N requests in a bucket reach the existing endpoint pipeline;
      request N+1 and later requests before expiry receive HTTP `429`
- [x] `GET /api/v1/polls/:id`, `GET /api/v1/polls/:id/results`, the scaffold
      `GET /api/v1`, `GET /api/v1/health` and CORS preflight are not rate-limited

### Window and counting behaviour

- [x] Each bucket uses a fixed 3,600-second window that begins with its first
      request; it is not aligned to wall-clock hour boundaries
- [x] Every attempt that reaches a protected route consumes capacity before
      validation or application logic, so requests that later return `400`,
      `404` or another non-`429` response still count
- [x] A rejected `429` attempt neither consumes additional capacity nor extends
      or restarts the current window
- [x] After expiry, the next request starts a fresh window and is its first
      allowed request

### Client identity and proxy trust

- [x] Buckets are keyed by the client IP exposed by the HTTP framework; no
      cookie, browser-generated identifier, poll ID or global shared bucket is
      used
- [x] Proxy trust is disabled by default, so a direct client cannot choose its
      limiter key by sending `X-Forwarded-For` or another forwarding header
- [x] #31 adds runtime configuration for an exact trusted-proxy hop count while
      keeping the default at zero trusted hops. #29 must make the API reachable
      only through one trusted reverse proxy hop before it enables a hop count
      of one; selecting Caddy or another concrete proxy remains #29's decision

### State and deployment constraint

- [x] Counters live in API-process memory; no PostgreSQL table, Redis service or
      other shared store is added
- [x] A process restart clears all counters. Multiple API processes would have
      independent counters, so #29 must deploy exactly one API replica
- [x] A shared limiter store is required before the API can run more than one
      replica and is tracked separately as #34

### `429` contract and frontend behaviour

- [x] A limited request returns HTTP `429 Too Many Requests` with a mandatory
      `Retry-After` response header containing the integer number of seconds
      until its fixed window expires, rounded up so retrying that many seconds
      later is not early
- [x] The JSON body keeps the Nest error shape: `statusCode` is `429`, while
      `message` and `error` are strings. No shared error DTO is introduced
- [x] `RateLimit-*` and `X-RateLimit-*` response headers are not introduced
- [x] No dedicated rate-limit UI is added: the create and ballot forms surface
      the API message through their existing inline error/retry behaviour and
      keep their existing form-state guarantees

### Automated verification

- [x] Deterministic API tests use controlled time and configurable test-only
      limits rather than sleeping for a production window
- [x] Tests cover requests below each limit, the first rejected request, the
      exact `429` body and `Retry-After`, and a newly allowed request after
      expiry
- [x] Tests prove that invalid attempts count, rejected attempts do not extend
      the window, the two route buckets are independent, and different client
      IPs have independent counters
- [x] Tests prove that protected routes cannot evade the default configuration
      with a client-supplied forwarding header and that configured trusted-proxy
      mode uses the forwarded client IP
- [x] Tests prove representative read and operational endpoints remain usable
      after both write buckets are exhausted

### Documentation

- [x] API runtime configuration and the zero-hop development default are added
      to the environment example and API documentation
- [x] Deployment documentation carries the one-replica/direct-access constraint
      forward to #29
- [x] `docs/08-known-limitations.md` describes rate limiting as implemented, not
      pending, once #31 ships; `docs/backlog.md` moves #31 to `Done`

### Out of Scope (tracked separately)

- Production reverse proxy choice, network exposure and runtime environment
  values → #29
- Shared counters and multiple API replicas → #34
- Rate-limit metrics, alerting and wider production monitoring → #33
- WAF, CAPTCHA, authentication, bot detection and DDoS protection remain
  outside the MVP; they are not prerequisites for #29

### Readiness Decisions

- Anonymous writes are limited by client IP. Forwarding headers are trusted
  only when an exact proxy-hop count is explicitly configured; #29 pairs one
  trusted hop with blocked direct API access.
- Poll creation and ballot submission use independent, first-request-anchored
  fixed windows. The limits are respectively 5 and 300 requests per IP per 60
  minutes. Invalid attempts count; `429` attempts do not extend the window.
- An in-memory limiter and exactly one API replica are sufficient for the first
  deployment. Restarts may clear counters; multi-replica shared state is #34.
- `429` uses the existing Nest error body plus mandatory `Retry-After`; no
  rate-limit metadata headers or shared DTO are added.
- Library choice and guard/middleware structure are implementation judgment
  calls as long as the observable contract and proxy boundary above hold.
- No architectural or product questions remain open for #31.

---

## #35 Graceful API Shutdown

Filed by the readiness work for #29 and implemented in its own prerequisite PR.
This item closes the API lifecycle gap before any production deployment work
begins.

### Runtime lifecycle

- [x] The production Nest application enables shutdown hooks for `SIGTERM`
- [x] On `SIGTERM`, the API stops accepting new connections, lets active HTTP
      requests finish within the configured container grace period, and runs the
      Nest application shutdown lifecycle
- [x] `PrismaService.onModuleDestroy()` runs during that lifecycle and closes
      the PostgreSQL client/pool before the process exits
- [x] A normal Docker stop/redeploy exits within the grace period without Docker
      escalating to `SIGKILL`
- [x] Existing startup, application behaviour and test teardown remain unchanged

### Automated verification

- [x] An automated lifecycle test starts the real Nest HTTP application, keeps
      a request active, sends `SIGTERM`, and proves that the request drains and
      the process exits successfully before a short test timeout
- [x] Automated verification proves that the Prisma destroy hook is invoked by
      signal-driven application shutdown
- [x] Container verification proves a normal `docker stop` does not end through
      `SIGKILL`; the exact test harness and observability mechanism are
      implementation judgment calls

### Out of Scope (tracked separately)

- Production Compose, stop grace period and the actual VPS deployment → #29
- Dependency-aware readiness, monitoring and alerts → #33
- The host-native `pnpm dev` watcher orphan described by #24

### Readiness Decisions

- #35 is a small API lifecycle fix and must merge before implementation of #29
  begins. It is not folded into the production deployment PR.
- Nest owns signal handling and application shutdown; Prisma remains attached to
  that lifecycle through its existing `OnModuleDestroy` implementation.
- The tests must exercise a real process signal and an active request. A unit
  test that only asserts that `enableShutdownHooks()` was called is insufficient.
- No architectural or product questions remain open for #35.

---

## #29 First Production Deploy

This slice creates the first reproducible production release on the owner's
existing DigitalOcean VPS. It uses the images and one-shot migration contract
from #27, the single-replica proxy boundary from #31, and the graceful shutdown
lifecycle from #35. Repository tooling is implemented in the separate production
Compose and `scripts/production/`; see `docs/production.md` for the operator
sequence. The owner deployed release `v0.1.0` on 2026-09-19, and ID-40 recorded
its evidence afterwards under _Completion evidence_ below. A box is checked only
where that evidence supports it; repository-only tests do not complete a
runtime criterion.

### Prerequisites

- [x] #35 is merged before implementation of #29 begins
- [x] Before the implementation PR for #29 merges, the `protect-main` repository
      ruleset requires both CI jobs, `checks` and `containers`; changing the
      GitHub repository setting is an owner action and does not need a backlog
      item
- [x] The target commit is on `main`, both required CI jobs succeeded for that
      exact commit, and the production checkout is clean and detached at its
      full SHA before images are built
- [ ] A read-only VPS preflight through SSH alias `pet-projects-1` verifies that
      `165.22.91.190` is the intended Ubuntu host, records the installed Docker
      Engine / Compose / Caddy versions and available disk and memory, and
      inspects the current Caddy networks, published ports, firewall and IPv4 /
      IPv6 exposure before any production state is changed

### Host layout and stable identity

- [x] Ranking Vote uses the stable checkout `/opt/apps/rank-vote`; release
      directories with one checkout per SHA are not introduced
- [x] Production is defined in a separate repository-owned Compose file and is
      always invoked with the explicit project name `rank-vote-prod`; the local
      `docker-compose.yml` and its development defaults remain local tooling
- [x] The single production entry point is
      `make prod-deploy RELEASE_SHA=<full-sha>` and refuses a short, missing,
      dirty, non-`main`, or failed-CI target; concurrent deploys are serialized
      or rejected
- [x] Caddy remains a separately managed Compose project under
      `/opt/infrastructure/caddy`; Ranking Vote neither recreates nor stops it
- [x] Root-only release manifests under
      `/opt/apps/rank-vote/deploy-state/current.env` and `previous.env` record
      the full commit SHA, application image tags and immutable image IDs,
      release tag when present, production URL and deployment timestamp
- [ ] The manifests are updated atomically only after successful public smoke
      verification; the current and previous application images remain present
      for recovery

### Public URL, reverse proxy and TLS

- [x] The only public application origin is
      `https://rankvote.avshukan.com`
- [ ] Caddy routes the `/api/v1` prefix, including the exact path and all
      descendants, to the production API on container port `3000`; every other
      path goes to the production web container on port `80`
- [ ] The production services have stable, project-unique Caddy upstream names
      (`rank-vote-api:3000` and `rank-vote-web:80`) so another Compose project
      cannot capture a generic `api` or `web` network alias
- [ ] Caddy terminates TLS and retains ownership of automatic certificate
      issuance, renewal and certificate storage; Ranking Vote serves plain HTTP
      only on Docker networks
- [x] DNS resolves the production hostname directly to the VPS. Adding a CDN or
      another public proxy later requires a new proxy-trust decision before it
      is enabled
- [ ] The Caddy configuration is validated before a graceful reload, preserves
      every existing site, and is rolled back to its previous valid config if
      the new route cannot be loaded
- [x] `VITE_API_URL=https://rankvote.avshukan.com/api/v1` is passed explicitly
      while building the production web image and is verified in the served
      bundle; changing it requires a new web image
- [x] The API receives
      `CORS_ORIGIN=https://rankvote.avshukan.com`; no development origin or
      wildcard is accepted in production

### Docker networks and public exposure

- [ ] The web service joins the existing external Docker network `web`, where
      Caddy reaches only its project-unique alias `rank-vote-web`
- [ ] The API does not join `web`; it and Caddy are the only members of the
      stable external network `rank-vote-api-proxy`, where Caddy reaches the
      project-unique alias `rank-vote-api`
- [x] PostgreSQL, migrate and API share a Ranking Vote network with the explicit
      stable name `rank-vote-prod-db` and `internal: true`; PostgreSQL joins no
      Caddy or shared application network
- [ ] PostgreSQL, API and web declare no host `ports`, use no host networking and
      are unreachable through the VPS public or loopback interfaces. Container
      ports `5432`, `3000` and `80` are reachable only by services granted the
      corresponding Docker-network membership
- [ ] VPS firewall and Docker networking expose only the already intended host
      services such as SSH and Caddy's public `80`/`443`; checks cover both IPv4
      and IPv6 and do not assume CORS provides a security boundary
- [x] The production API runs exactly one container and one Node process. Any
      move to multiple API replicas waits for shared limiter state in #34

### Trusted client IP boundary

- [x] The API receives `TRUSTED_PROXY_HOPS=1` only after inspection proves that
      all browser traffic has exactly one hop, Caddy, and no direct API route
      exists
- [ ] Caddy replaces or safely normalizes client-supplied forwarding headers and
      sends the real peer address upstream; a caller cannot select a rate-limit
      identity with a forged `X-Forwarded-For`
- [ ] Post-deploy verification combines network inspection with an external
      request probe to prove that Caddy supplies the real client IP, spoofed
      forwarding values are ignored, and the API cannot be reached around Caddy
- [ ] A rate-limit probe uses controlled invalid requests and restarts the single
      API container afterward to clear its test-only in-memory bucket before the
      user-flow smoke test; it does not exhaust a real user's production bucket

### Production PostgreSQL

- [ ] Production uses PostgreSQL 17 with database `rank_vote_prod` and role
      `rank_vote_app`; that role owns the application database/schema and has
      the DDL/DML rights needed by committed migrations and runtime, but is not
      a superuser and cannot create roles or databases
- [ ] A separate bootstrap/admin credential creates the database and application
      role only during first initialization. It is never passed to API or migrate
      and its handling is documented as part of the initial provisioning ritual
- [x] API and the one-shot migrate service receive the same production
      `DATABASE_URL`, pointing to `rank_vote_app@postgres:5432/rank_vote_prod`
      with `schema=public`; passwords are generated, not repository defaults,
      and are percent-encoded correctly in the URL
- [x] Production does not mount or run the development
      `init-test-database.sql`, does not create `rank_vote_test`, and does not
      use development/test reset or migration commands
- [x] PostgreSQL data is mounted at `/var/lib/postgresql/data` from the external
      Docker volume `rank_vote_prod_postgres_data`. Initial setup creates that
      exact volume explicitly, and every deployment refuses to continue if it
      is absent instead of silently creating an empty replacement
- [ ] Recreating PostgreSQL with that external volume preserves the smoke poll,
      ballot and results; no deploy or rollback command invokes Compose with
      `--volumes` or otherwise deletes the production volume

### Secrets and configuration

- [x] Production configuration lives outside the repository and Docker build
      context at `/etc/rank-vote/prod.env`; `/etc/rank-vote` is `root:root`
      mode `0700` and `prod.env` is `root:root` mode `0600`
- [x] The production Compose invocation explicitly reads that file for
      interpolation and passes each service only the settings it needs; it does
      not load the entire file into every container
- [x] At minimum the file supplies `DATABASE_URL`, `PORT=3000`,
      `CORS_ORIGIN=https://rankvote.avshukan.com` and
      `TRUSTED_PROXY_HOPS=1`, together with the production PostgreSQL bootstrap
      and application secrets required by the chosen initialization mechanism
- [x] Production Compose fails before changing running services when any
      required value is absent or still equals a repository development
      credential/origin; no `${VAR:-development-default}` form is used
- [x] `VITE_API_URL=https://rankvote.avshukan.com/api/v1` is an explicit,
      non-secret build input to the deploy command rather than a runtime setting
- [x] Secrets never enter git, image layers, image metadata, release manifests,
      command-line arguments, CI output or deployment logs

### Build and release identity

- [x] The implementation PR adds the production Compose/config validation,
      deploy and rollback entry points, tests and operator documentation, then
      stops at green CI for owner review without changing VPS state or marking
      #29 Done
- [ ] After the owner merges that PR, production deployment runs from its exact
      CI-green `main` SHA. A small post-deploy documentation PR records the
      deployed release and moves #29 to `Done`; the operational start of #28
      does not wait for that record PR to merge
- [x] Images are built on the VPS, sequentially if host resources require it,
      from the clean checkout at `RELEASE_SHA`; no registry or CD pipeline is
      introduced
- [x] Images are tagged `rank-vote-api:<full-sha>` and
      `rank-vote-web:<full-sha>`. Production Compose references these immutable
      release tags and never `latest` or the local `:local` tags
- [x] The build finishes and both images pass their preflight checks before the
      running web/API containers are stopped; a build failure leaves the current
      release untouched
- [x] The release manifest makes the deployed version answerable from the full
      source SHA plus immutable image IDs, even if rebuilding the same SHA later
      would resolve a changed upstream base image
- [x] #29 adds the first changelog entry. After successful deployment and smoke
      verification, annotated SemVer tag `v0.1.0` is created on the deployed
      commit and pushed; the manifest is amended with that tag without changing
      its recorded SHA/image IDs

### Migrations and deployment ritual

- [ ] First deploy order is: validate host/DNS/config and create the external
      networks/volume → build both images → start and verify PostgreSQL → run the
      one-time database bootstrap → run migrate once → start one API → start web
      → validate/reload Caddy → run internal and public smoke verification
- [ ] Redeploy order is: fetch and validate `RELEASE_SHA` → build/check images →
      stop old web and API while leaving PostgreSQL running → run the one-shot
      migrate service → start and health-check one new API → start web → run
      smoke verification
- [x] The API image entrypoint never runs migrations. The migrate service uses
      the exact API image selected for the release, runs
      `prisma migrate deploy` once and has `restart: "no"`
- [ ] A failed migration stops the release with PostgreSQL left running and the
      application stopped. The deploy command preserves diagnostics and does not
      automatically retry, mark the migration resolved, reset/restore the
      database, or start either application version against uncertain schema
- [x] The public route may briefly return an error while web/API are stopped;
      this bounded downtime is accepted for the MVP and zero-downtime deployment
      is not implied
- [x] Production deploy and rollback commands never stop, recreate or otherwise
      take ownership of the existing Caddy service

### Restart and shutdown lifecycle

- [x] PostgreSQL, API and web use `restart: unless-stopped`; migrate remains a
      completed one-shot service with `restart: "no"` and is not rerun merely
      because Docker or the VPS restarts
- [x] API has an explicit stop grace period long enough for the #35 SIGTERM
      lifecycle to drain active requests and close Prisma before Docker may send
      `SIGKILL`
- [ ] Controlled container stop/recreate checks confirm the long-running
      services recover and the database remains intact. A shared-VPS host reboot
      is not forced solely for #29; restart policies and dependency recovery are
      verified without disrupting unrelated projects, then confirmed at the
      next planned reboot
- [ ] If API starts while PostgreSQL is still unavailable after a Docker restart,
      it is retried or otherwise recovers automatically once PostgreSQL is ready;
      operator intervention is not the normal reboot path

### Post-deploy verification

- [x] Internal health checks pass before public routing is considered ready;
      public `GET https://rankvote.avshukan.com/api/v1/health` returns
      `{ "status": "ok" }`
- [x] The frontend loads over HTTPS with a valid certificate, no mixed content
      or browser console errors, and a direct request to
      `/poll/<known-id>/results` returns the SPA rather than a proxy 404
- [x] Through the public origin, a uniquely named smoke poll is created, loaded,
      ranked with one full ballot and shown with the expected Borda results; its
      ID is recorded for persistence and #28 verification
- [ ] The same poll, ballot and results remain available after controlled API,
      web and PostgreSQL container restart/recreation using the existing volume
- [ ] The client-IP/proxy checks above pass, while direct connections to API
      port `3000` and PostgreSQL port `5432` fail through both the VPS IPv4 and
      IPv6 addresses
- [ ] Existing Caddy-hosted projects still respond after its validated reload;
      deployment logs and `docker compose ps` show no unhealthy or restarting
      Ranking Vote service

### Rollback and failure recovery

- [ ] `make prod-rollback` selects the `previous.env` image IDs/tags, refuses to
      build replacement images, and requires an explicit operator confirmation
      that the previous application is compatible with every applied migration
- [ ] Application rollback repeats the controlled web/API stop and health/smoke
      sequence while leaving PostgreSQL and its volume in place; it never claims
      or attempts an automatic database rollback
- [ ] If the previous version is not schema-compatible, the documented response
      is continued downtime plus a reviewed forward fix or a separately chosen
      restore procedure; the deploy tool does not guess
- [ ] A failed first deployment has no previous application to restore. Caddy's
      prior valid configuration is restored if necessary, PostgreSQL and its
      volume are preserved, and the failure is resolved before publishing a
      release tag

### Handoff to recovery

- [x] After #29 succeeds and `v0.1.0` identifies the verified deployment, the
      immediate next operational step is #28: create an offsite logical
      `pg_dump`, copy it outside both the VPS and DigitalOcean, restore it into a
      clean PostgreSQL instance, and verify the recorded smoke poll through the
      restored application data
- [x] #29 does not claim production recovery is proven until #28 completes; the
      persistent Docker volume is explicitly treated as data storage, not backup

### Completion evidence

ID-40 recorded this evidence on 2026-10-07 from the four sources below. The
record neither accessed nor changed production, and no probe was rerun for it.

#### 1. Repository and GitHub history

- Annotated tag `v0.1.0` ("First verified production release", tagged
  `2026-09-19T10:15:33Z`) points at
  `7021f3137b597119e39ca13e6a86275da58b28e1`, the merge of PR #53. Push CI run
  `35417067634` on that SHA passed `checks` and `containers`.
- Implementation PR #51, merged on 2026-09-16, added the production tooling, its
  tests, the operator runbook and the first changelog entry, and left #29 in
  `Todo`. The implementation environment neither inspected nor changed the VPS
  (`docs/production.md`, recorded implementation-phase checks). PR #52 changed
  the hostname to `rankvote.avshukan.com`. PR #53 states that the first
  deployment attempt failed on Docker 29.7.2, because `docker top` omitted the
  PID column, and fixed that check.
- The backlog sweep in PR #56 moved ID-29 to `Done` on 2026-09-25, before this
  record existed.
- The #28 drill, recorded under _Completion evidence_ of #28, dumped production
  at `2026-09-19T14:01:18Z`, after the tag, and recovered the same smoke poll
  with one ballot scoring `2`/`1`/`0`.
- CI references no repository secret; its only credentials are the test
  database's.

#### 2. Release manifest

On 2026-10-06 the owner read `/opt/apps/rank-vote/deploy-state/current.env`
without changing production. It contains no secret:

```text
API_IMAGE=rank-vote-api:7021f3137b597119e39ca13e6a86275da58b28e1
API_IMAGE_ID=sha256:e87b2b723455653241138cb32c410488dec80e36ed12153634962d9feb8a1e9c
DEPLOYED_AT=2026-09-19T09:21:41Z
PRODUCTION_URL=https://rankvote.avshukan.com
RELEASE_SHA=7021f3137b597119e39ca13e6a86275da58b28e1
RELEASE_TAG=v0.1.0
SMOKE_POLL_ID=4647e500-8940-41a2-9b25-6261d82e9ace
WEB_IMAGE=rank-vote-web:7021f3137b597119e39ca13e6a86275da58b28e1
WEB_IMAGE_ID=sha256:41ca72caf1a2a7fc7ca7a4feee3e750481dbbd0b31fd36afc7a403992cb5d033
```

`deploy-state/previous.env` did not exist, as expected after a first release.

#### 3. Owner observations from the deployment

The owner confirms these from the original deployment:

- At `HOST VERIFIED`: the preflight output was reviewed; the DigitalOcean cloud
  firewall was checked, though no rule listing was preserved; the API was
  reachable only through Caddy; and the other projects on the VPS still worked.
- At `PROXY VERIFIED`: the existing Caddy-hosted sites kept working.
- At `PUBLIC VERIFIED`: the frontend opened in an external browser over valid
  HTTPS, with no mixed-content or noticeable browser-console errors observed;
  the direct results route, the smoke poll and its results were checked; and
  the existing Caddy-hosted sites still worked after these checks.
- The initial host audit recorded Ubuntu 24.04.4 LTS on x86_64 and public IPv4
  `165.22.91.190`, and recorded no public IPv6 address; Docker Engine 29.7.2,
  Docker Compose 5.5.0 and Caddy 2.11.4; 1 vCPU; about 1.92 GiB of RAM with
  about 1.45 GiB available and no swap; and about 47.39 GiB of disk with about
  43.7 GiB available.
- Listeners and firewall from the deployment session: Caddy listened publicly
  on TCP 80/443 and UDP 443, and SSH on TCP 22; the application containers
  exposed only their container ports (API `3000/tcp`, web `80/tcp`, PostgreSQL
  `5432/tcp`); the IPv4 `INPUT` policy was `DROP`; UFW was active, and its IPv6
  rules allowed 22/tcp, 80/tcp, 443/tcp and 443/udp.
- Later production-tool output, around release and tagging, reported about
  40049 MiB of free disk and 1276–1278 MiB of available RAM plus swap. The
  deployment tooling printed `DNS addresses: 165.22.91.190`.
- No planned VPS reboot has happened since the release.

#### 4. Automatic checks of `make prod-deploy` at `7021f31`

Three code paths write `current.env`: `deploy` and `rollback` in
`scripts/production/release.py`, each as its last step, and the `tag` command
in `cli.py`, which only amends an existing manifest. Rollback needs a
`previous.env`, which did not exist, and `deploy` saves any current manifest as
`previous.env` before it stops the application, so this manifest came from the
one successful `deploy` run. That run passed every check before its last step,
using the tooling of `7021f31`: `check_source` requires the checkout to be clean
and detached at exactly `RELEASE_SHA`, and `local_host` requires it to be
`/opt/apps/rank-vote`.

That run held `deployment_lock` and passed `validate_sha`, `read_config` (with
`private_path` and `validate_config`), `check_source` (with `validate_ci`),
`Runner.model` (with `validate_model`) and `preflight` (`local_host`, Docker
versions, disk, memory, DNS, `caddy_container`, `network_boundary`). It took
the typed `HOST VERIFIED` confirmation before `deploy` started any container.
Inside `deploy` it passed `prepare_images` (with `image_identity`),
`verify_image_ids`, one migrate run and `internal_verify`; it then took the
typed `PROXY VERIFIED` confirmation, restarted the API, and passed `smoke` (with
`verify_poll`). After the typed `PUBLIC VERIFIED` confirmation it passed
`verify_poll` and `internal_verify` again. The later `tag` command checked that
`v0.1.0` is an annotated tag on the manifest's SHA before adding it.

A typed confirmation shows only that the operator answered the prompt; the
checks behind it count only where source 3 confirms them. An automatic check is
cited for what its own function verifies, never for an operator's observation
or for configuration that it does not inspect.

#### Checked criteria and their evidence

R is repository or GitHub history, M the manifest, O an owner observation, and
T an automatic check, named by its function in `scripts/production/`.

- **Prerequisites:** exact `main` SHA with both CI jobs — R (CI run), T
  (`check_source`, `validate_ci`); a clean, detached checkout before images are
  built — T (`check_source` runs before `deploy`)
- **Host layout and stable identity:** stable checkout — T (`local_host`,
  `check_source`); separate Compose, always run as `rank-vote-prod` — T
  (`Runner.compose`, `validate_model`); single entry point, with its refusal
  checks and lock — T (`validate_sha`, `check_source`, `deployment_lock`);
  separately managed Caddy, left alone — T (`caddy_container`; `Runner.compose`
  and `validate_model` limit commands to the four Ranking Vote services), O
  (other sites kept working); root-only manifests with every field — M, T
  (`private_path` in `main`, `ReleaseState.write`)
- **Public URL, reverse proxy and TLS:** one public origin — M, O (browser), T
  (`validate_config`, `network_boundary`, `smoke`); DNS directly to the VPS — T
  (`preflight`), O (printed DNS addresses); `VITE_API_URL` passed at build and
  checked in the image and in the served bundle — T (`prepare_images`, `smoke`
  through `validate_web_bundle`); the CORS origin — T (`validate_config`,
  `validate_model`)
- **Docker networks and public exposure:** the internal `rank-vote-prod-db`
  network — T (`validate_model`, `network_boundary`); one API container and one
  Node process — T (`validate_model`, `internal_verify`, `network_boundary`)
- **Trusted client IP boundary:** `TRUSTED_PROXY_HOPS=1` only after the
  inspection — O (API reachable only through Caddy, confirmed at
  `HOST VERIFIED`, which `main` requires before `deploy` starts any container),
  T (`validate_config`, the DNS check in `preflight`)
- **Production PostgreSQL:** the same production `DATABASE_URL` for API and
  migrate, with strong passwords that are not repository defaults — T
  (`validate_config`, `validate_model`); no development SQL, test database or
  reset command — T (`validate_model` allows only the data volume and
  `init-production.sql`, and migrate runs `db:deploy`, which is
  `prisma migrate deploy`); the external volume at the data path, with a refusal
  if it is absent — T (`validate_model`, `network_boundary`); Compose never
  creates an external volume, so the mounted one was created explicitly
- **Secrets and configuration:** root-only `/etc/rank-vote/prod.env` outside the
  repository and build context — T (`read_config`, `private_path`;
  `prepare_images` builds from `git archive`); per-service settings through
  `--env-file` — T (`Runner.compose`, `validate_model`); required keys, checked
  fail-closed before any change — T (`validate_config`, `validate_model`);
  `VITE_API_URL` as a build input — T (`prepare_images`); secrets kept out of
  git, images, manifests, arguments, CI and logs — M (no secret in the
  manifest), T (`prepare_images`, `Runner.compose`, `Runner.run` with `redact`,
  the redacted migration log in `deploy`), R (CI holds no secret)
- **Build and release identity:** the implementation PR stopped at green CI,
  left #29 in `Todo` and did not change the VPS — R (PR #51,
  `docs/production.md`); built on the VPS from the clean SHA, with no registry
  or CD — T (`local_host`, `prepare_images`); full-SHA tags, never `latest` or
  `:local` — M, T (`validate_model`); the build and image checks finish before
  web and API stop — T (`deploy`, `prepare_images`, `verify_image_ids`); version
  identified by SHA plus image IDs — M; the first changelog entry, and the
  annotated tag created after deployment and added to the manifest — R (PR #51
  changelog; tag at `10:15:33Z`, after `DEPLOYED_AT`), M (`RELEASE_TAG`), T
  (`tag` in `main`)
- **Migrations and deployment ritual:** no entrypoint migration, and one migrate
  run with the release's API image and `restart: "no"` — T (`image_identity`,
  `validate_model`, `internal_verify`, `deploy`); bounded downtime — T (`deploy`
  stops web and API before migrating; the downtime is accepted, not measured);
  deploy and rollback leave Caddy alone — T (`Runner.compose`,
  `validate_model`), O (other sites kept working); rollback never ran
- **Restart and shutdown lifecycle:** restart policies and the 30-second API
  stop grace period — T (`validate_model`)
- **Post-deploy verification:** internal health before public use, and public
  health `{ "status": "ok" }` — T (`internal_verify`, `smoke`); HTTPS, no mixed
  content and the direct results route — O (browser), T (`verify_poll` requests
  the route, and `request` keeps TLS verification); the smoke poll — T
  (`smoke`, `verify_poll`), M (`SMOKE_POLL_ID`), O
- **Handoff to recovery:** R (the #28 evidence: its dump recovered the
  manifest's smoke poll, and recovery was claimed only after it)

#### Criteria without recorded runtime evidence

These boxes stay unchecked:

- **Operator checks without a recorded result.** The owner supplied no result
  for these, and ID-40 did not rerun them:
  - Docker networks: unreachability through the VPS public and loopback
    interfaces. `validate_model` and `network_boundary` enforce no host ports
    and no host networking, but no external or loopback probe result is
    recorded
  - Docker networks: firewall exposure on IPv4 and IPv6. The host IPv4 and UFW
    rules are recorded and the cloud firewall was reviewed, but no cloud rule
    listing and no IPv6 route check are recorded
  - Trusted client IP boundary: forwarding-header normalization, which also
    depends on the unrecorded Caddy site; the external proxy probe; and the
    rate-limit probe. `public_verification` restarts the API after the probe,
    but no probe or peer-check result is recorded
  - Production PostgreSQL: data surviving PostgreSQL recreation
  - Restart and shutdown lifecycle: API recovery when PostgreSQL starts later
  - Post-deploy verification: data after controlled recreation, and the
    client-IP and direct-port checks
- **Host reboot.** No planned VPS reboot has happened since the release, so
  recovery of Ranking Vote after a full host reboot is not verified. The
  controlled stop/recreate check in the same criterion is not recorded either
- **Caddy configuration.** `prod-caddy` is separate from `prod-deploy`, and its
  use and output are not recorded. The Ranking Vote side (aliases, network
  membership, no host ports) is enforced; the applied Caddy site is not:
  - Public URL: routing of the exact `/api/v1` path and of every other path.
    `smoke` proved `/api/v1/health`, the poll, ballot and results API, `/`, the
    script assets and `/poll/<id>/results`
  - Public URL: Caddy's upstream names; Docker networks: Caddy reaching web and
    API only through `rank-vote-web` and `rank-vote-api`
  - Public URL: automatic certificate issuance and renewal by Caddy. Valid
    HTTPS was observed
  - Public URL: the validated reload with rollback. The existing sites kept
    working
  - Post-deploy verification: existing Caddy-hosted projects responding after
    the validated reload, with healthy Ranking Vote services. The owner
    confirmed that the existing sites kept working, and `internal_verify` found
    the Ranking Vote services running and healthy before and after public
    verification, but the validated reload itself is not recorded, so the
    combined criterion stays unchecked
- **Partly recorded:**
  - Prerequisites: the read-only preflight. The facts in source 3 are recorded,
    but not the SSH alias used or an initial inspection of Caddy's Docker
    networks
  - Host layout: the manifests' atomic promotion after smoke is enforced by
    `deploy`, but continued presence of the release images is not recorded,
    and no previous release exists
  - Production PostgreSQL: the role and the bootstrap credential. PostgreSQL 17,
    the database, use of the application role and the credential separation
    are enforced by `validate_model` and `validate_config`, and migrate
    succeeded as `rank_vote_app`, but the role's privileges and their creation
    at first initialization were not inspected
  - Migrations: the first-deploy order. `deploy` enforces build, PostgreSQL,
    migrate, API, web and smoke in that order, but provisioning, bootstrap and
    the Caddy step are not recorded, and the first attempt failed (PR #53)
    before the run at `7021f31`
  - Rollback and failure recovery: the failed first deployment. It was fixed
    and succeeded before the tag, and `network_boundary` found the external
    volume mounted in the successful run, but restoring Caddy after the failed
    attempt, if it was needed, is not recorded
- **Not exercised by the first release:** the redeploy order, a failed migration
  and the three rollback criteria. Repository tests cover them; production has
  not run them
- **Met differently than written:** production was deployed from `7021f31`, two
  PRs after the implementation PR's merge `fa3d8e7`: #52 changed the hostname
  and #53 fixed the check that failed the first attempt. ID-29 then moved to `Done` in PR #56,
  before this record (ID-40) existed. #28 did not wait for the record, as
  written

### Out of Scope (tracked separately)

- Graceful API shutdown implementation → prerequisite #35
- Manual offsite backup and restore drill → #28
- Automated offsite backups, retention and restore-test scheduling → #32
- Dependency-aware readiness, external monitoring, alerts and error tracking → #33
- Shared rate-limit state and more than one API replica → #34
- Removal of the scaffold `GET /api/v1` endpoint → #30
- Kubernetes, Redis, a registry/CD pipeline, zero-downtime deployment, WAF,
  enterprise secret management and automated database rollback remain outside
  the MVP and have no backlog item until a concrete need appears

### Readiness Decisions

- The production origin is `https://rankvote.avshukan.com`; Caddy splits the
  `/api/v1` prefix to API and all other paths to web. The Vite API URL is baked
  into the release image, while CORS permits exactly that one origin.
- The existing Caddy remains independently operated. Web shares its external
  `web` network; API uses the Caddy-only `rank-vote-api-proxy`; database traffic
  stays on internal `rank-vote-prod-db`. No application service publishes a host
  port.
- Production lives at `/opt/apps/rank-vote` under Compose project
  `rank-vote-prod`, with PostgreSQL data in the explicitly named external volume
  `rank_vote_prod_postgres_data` and release state in root-only current/previous
  manifests.
- PostgreSQL database `rank_vote_prod` is owned and used by the non-superuser
  `rank_vote_app` for runtime and migrations. A separate bootstrap credential is
  never supplied to the application services.
- Root manages `/etc/rank-vote/prod.env`. Production inputs are explicit and
  fail closed; the web API URL is a required build input.
- A full-SHA checkout is built on the VPS into full-SHA image tags. The deployed
  SHA plus immutable image IDs identifies a release; the first successful
  release becomes annotated tag `v0.1.0` and starts the changelog.
- Repository review precedes production mutation: the implementation PR merges,
  its exact `main` SHA is deployed, and a post-deploy record PR moves #29 to
  `Done`. #28 starts immediately after the verified deployment rather than
  waiting for that record PR.
- Brief downtime is accepted. The old application stops before migration; a
  migration failure leaves it stopped for diagnosis. Application rollback uses
  saved images only when schema compatibility has been established and never
  rolls the database back automatically.
- Long-running containers restart unless explicitly stopped, migrate never
  becomes a daemon, and the first deployment runs exactly one API process.
- #35 and required `containers` status are prerequisites rather than hidden work
  inside #29. Once this documentation lands and those prerequisites are met, no
  architectural or product questions remain open for implementation of #29.

---

## #28 Manual offsite backup

This owner-operated runtime drill proves one complete recovery path for the
first production deployment. The owner completed the production dump, offsite
transfer, isolated restore and application-level recovery check on 2026-09-19.
This documentation PR records that supplied evidence only; it did not access or
mutate production and did not repeat any part of the drill.

The owner-supplied recovery target is release `v0.1.0` at
`7021f3137b597119e39ca13e6a86275da58b28e1`, served from
`https://rankvote.avshukan.com`. Its recorded smoke poll is
`4647e500-8940-41a2-9b25-6261d82e9ace`.

### Source backup

- [x] The operator creates a logical backup of production database
      `rank_vote_prod` with PostgreSQL `pg_dump` in custom format (`-Fc`) while
      the production PostgreSQL service and application remain online
- [x] The dump reads the running database through the PostgreSQL container; it
      does not stop or recreate a production service, copy PostgreSQL data
      files or the Docker volume, or mutate
      `rank_vote_prod_postgres_data`
- [x] The backup filename includes a UTC timestamp and contains no database
      URL, username, password or other production secret
- [x] A SHA-256 checksum is calculated for the completed source artifact before
      transfer, and the dump and checksum file are readable only by the
      operator while staged on the VPS
- [x] The dump command neither prints a production password nor places one in a
      command argument or shell history; repository files, logs and evidence
      contain no production credential

### Offsite transfer and integrity

- [x] The dump and its checksum are copied over an authenticated encrypted
      channel from the DigitalOcean VPS to the owner's local WSL machine; that
      local destination is outside the VPS and outside DigitalOcean
- [x] SHA-256 is recalculated or checked on the local machine, and the local
      digest exactly matches the digest calculated on the VPS before any
      restore is attempted
- [x] A matching checksum is necessary but not sufficient recovery proof: the
      drill continues through restore and application reads
- [x] After the drill, the verified dump and checksum remain retained in an
      owner-only offsite location; cleanup of the disposable restore resources
      must not remove this retained copy

### Isolated restore

- [x] Restore uses a fresh PostgreSQL 17 container, empty database, dedicated
      Docker network and dedicated temporary storage on the local WSL machine
- [x] The restore target does not reuse, reset, mount or connect to the normal
      development database, `rank_vote_test`, any of their existing volumes, or
      production storage
- [x] The local restore uses newly chosen local-only credentials. Production
      database passwords are neither needed nor copied, and `pg_restore` uses
      `--no-owner --no-acl` so the restored objects belong to the chosen local
      restore role instead of requiring production roles or grants
- [x] `pg_restore` reads the custom-format artifact, targets the clean database,
      uses `--exit-on-error`, and exits successfully without ignored restore
      errors

### Recovery proof

- [x] Direct SQL inspection after restore can read the Prisma migration table
      and all four application tables (`Poll`, `PollOption`, `Ballot` and
      `BallotEntry`), including their restored rows and relationships
- [x] A locally built instance of the API from the recorded release SHA starts
      with its `DATABASE_URL` pointing only at the isolated restore database;
      successful process startup alone is not sufficient
- [x] Through that restored API, `GET /api/v1/polls/4647e500-8940-41a2-9b25-6261d82e9ace`
      returns a `Production smoke ...` poll with the three ordered options
      `Alpha`, `Beta` and `Gamma`
- [x] Through that restored API, `GET /api/v1/polls/4647e500-8940-41a2-9b25-6261d82e9ace/results`
      reports method `BORDA`, one ballot, scores `2`, `1`, `0` for those options
      in order, and `Alpha` as the sole winner; this proves the ballot and its
      entries were restored, not only the poll row
- [x] The operator records the UTC backup time, artifact name, matching source
      and local SHA-256, PostgreSQL major version, successful restore and SQL / API
      checks, cleanup result and retained offsite location without recording a
      secret
- [x] After verification, the temporary API and PostgreSQL containers, network,
      restore database and temporary restore volume can be removed without
      touching normal development/test resources or the retained dump
- [x] #28 moves to `Done` only after the owner-operated production dump,
      transfer, restore, recovery proof and evidence record all succeed

### Completion evidence

- At `2026-09-19T14:01:18Z`, PostgreSQL 17 (`postgres:17-alpine`) produced the
  custom-format artifact `rank-vote-20260919T140118Z.dump` through the running
  production PostgreSQL container while production remained online; no service
  or live volume was stopped, recreated, copied or mutated. `umask 077` and
  mode `600` kept the staged dump and checksum owner-only. The command used the
  container's `POSTGRES_PASSWORD` environment variable without printing or
  embedding the production password in the shell command. `pg_restore --list`
  parsed the archive successfully. Its source and local SHA-256 both equal
  `3c69d345cf3eceb4ecad1b6acade8cc01567e59567400c70b9416ecc7352ab99`.
- `pg_restore --no-owner --no-acl --exit-on-error` completed with exit code 0
  against fresh isolated PostgreSQL 17. SQL verification found one Prisma
  migration, one poll, three options, one ballot and three ballot entries.
- The API image built from exact release `v0.1.0` at
  `7021f3137b597119e39ca13e6a86275da58b28e1` was connected only to the restored
  database. Health passed, and smoke poll
  `4647e500-8940-41a2-9b25-6261d82e9ace` returned ordered options
  `Alpha`/`Beta`/`Gamma` plus one `BORDA` ballot scoring `2`/`1`/`0`, with
  `Alpha` as sole winner.
- Disposable API/PostgreSQL containers, network, volume, local credentials,
  release worktree and API image were removed; VPS staging files were removed.
  The checksum was still valid afterward, and the dump plus checksum remain
  offsite on the owner's WSL machine under `~/backups/rank-vote/`. That
  directory was created mode `700`, and both retained files were observed as
  mode `600`. No credential is included in this evidence record.

### Out of Scope (tracked separately)

- Post-deployment runtime record of the first deployment → ID-40
- Backup scheduling, retention automation, independent object-storage
  selection, backup-service encryption policy, monitoring/alerts and periodic
  restore tests → #32

### Readiness Decisions

- The first recovery artifact is a custom-format PostgreSQL logical dump, not a
  copy of the live Docker volume. Creating it is an online, read-only operation
  and does not require production downtime.
- The first offsite destination and restore host are the owner's local WSL
  machine. Exact owner-only paths, temporary container/network names and local
  ports are operator judgment calls and do not change the recovery contract.
- Ownership and ACLs from production are not recreated locally. The isolated
  restore role owns restored objects, while schema and application data remain
  sufficient for the API to operate.
- The known production smoke poll supplies the application-level recovery
  oracle. A successful `pg_restore` or row count by itself cannot complete the
  drill.
- This is a one-time manual procedure. It adds no repository automation or new
  production tooling; #32 owns the durable backup system.
- No architectural or product questions remain open for #28.

---

## #32 Automate offsite backups

Stage 2 of the staged backup plan in `docs/10-storage.md`: a daily logical dump
of production `rank_vote_prod` is stored in Cloudflare R2, outside
DigitalOcean, with Bucket Lock immutability, lifecycle retention, email
alerting and a documented restore path. The repository implementation merges
first; #32 moves to `Done` only after the owner-operated production evidence
below.

### Storage and access

- [ ] Backups are stored in one private R2 bucket dedicated to Ranking Vote
      backups, in the owner's existing Cloudflare account
- [ ] Objects rely on R2's built-in encryption at rest; there is no client-side
      encryption
- [ ] The VPS holds only an `Object Read & Write` token scoped to that bucket;
      no admin-level Cloudflare token is stored on the VPS
- [ ] A Bucket Lock rule retains every object for 30 days: while the lock is
      active, the object cannot be deleted or overwritten with the VPS
      credentials
- [ ] A lifecycle rule deletes objects after 90 days
- [ ] R2 and Healthchecks.io credentials are kept separately from `prod.env`, in
      a root-only location outside git and every build context; `prod.env` and
      its validation are unchanged
- [ ] No credential appears in command arguments, output, logs, the repository
      or evidence

### Backup run

- [ ] `make prod-backup` creates a custom-format `pg_dump -Fc` dump of
      `rank_vote_prod` through `docker exec` in the running production
      `postgres` container while production stays online; it never stops or
      recreates a service and never copies or mutates
      `rank_vote_prod_postgres_data`
- [ ] Before upload the dump is validated as a readable PostgreSQL archive,
      and an integrity checksum is kept with it; a dump that fails validation
      is not uploaded and the run fails
- [ ] The dump is uploaded with `rclone` from a container image pinned by digest;
      nothing else is installed on the host
- [ ] Each run adds new objects and never deletes or overwrites existing ones;
      retention belongs to the lifecycle rule
- [ ] No dump remains on the VPS after a run, successful or not
- [ ] The backup does not depend on GitHub or CI availability
- [ ] A systemd timer on the VPS host runs the backup once a day (RPO 24 hours);
      how the timer is installed and enabled is documented in
      `docs/production.md`

### Failure notification

- [ ] A successful backup shows as healthy in Healthchecks.io
- [ ] A failed backup exits non-zero with a secret-free message and results in
      an email alert to the owner
- [ ] A missed scheduled run also results in an email alert

### Restore

- [ ] `docs/production.md` documents a manual production restore drill: an R2
      backup is downloaded outside DigitalOcean, its integrity checked, restored
      into a fresh isolated PostgreSQL 17, and verified through the recorded
      smoke poll by the API of the deployed release, as in #28
- [ ] The drill runs every six months, at #32 completion, after changes to the
      backup tooling and after a PostgreSQL major-version change
- [ ] `docs/production.md` documents a safe production recovery path from an R2
      backup that is compatible with the existing production constraints: it is
      owner-operated and never automatic, it does not delete, reset or silently
      replace `rank_vote_prod_postgres_data` or existing data, and the
      application keeps using the non-superuser `rank_vote_app` without the
      bootstrap credential. The implementation PR details and reviews the exact
      procedure
- [ ] The target recovery time (RTO) is 24 hours, best effort

### Automated verification

- [ ] Unit tests cover the new behaviour, including credential validation,
      failure paths, no upload after a failed dump or validation, and
      secret-free output
- [ ] `make prod-smoke` automatically checks the restore path locally: a dump of
      its disposable production-model database, taken through the backup code
      path, is restored into a fresh disposable PostgreSQL initialized like
      production and read back through the API using the production
      application role
- [ ] `make verify`, `make prod-check` and `make prod-smoke` pass without R2 or
      Healthchecks.io credentials

### Production evidence

- [ ] At least one timer-initiated run successfully stored a backup in R2
- [ ] The restore drill from R2 succeeded
- [ ] A deliberately induced backup failure, touching neither production data
      nor services, produced an email notification
- [ ] Bucket Lock (30 days) and lifecycle deletion (90 days) are configured and
      checked: an object under an active lock cannot be deleted or overwritten
      with the VPS credentials, and the lifecycle rule is present
- [ ] The owner records UTC times, object names, integrity and restore results
      without any secret; #32 moves to `Done` only after all of the above

### Out of Scope (tracked separately)

- Automated periodic restore of production backups — no backlog item until
  needed
- General production monitoring, uptime and alerting → #33
- PITR/WAL archiving and replication; managed PostgreSQL remains Stage 3
- A second backup provider
- Backups of `prod.env`, `deploy-state` and the Caddy configuration

### Readiness Decisions

- Confirmed by the owner in the #32 design loop: Cloudflare R2 in the existing
  account with one private bucket; R2's built-in encryption only; a
  bucket-scoped `Object Read & Write` token on the VPS and no admin-level token;
  Bucket Lock 30 days; lifecycle deletion after 90 days; a daily backup
  (RPO 24 hours); Healthchecks.io with email; a restore drill every six months
  and on events; RTO 24 hours best effort; `pg_dump -Fc` through
  `docker exec`; upload with `rclone` pinned by digest; a systemd timer on the
  VPS host; a manual production restore drill and a local automated
  restore-path check in `prod-smoke` as part of #32; `Done` only after
  production evidence.
- Implementation choices, settled in the implementation PR and its review:
  - the Healthchecks.io signalling protocol and check timing
  - the format and location of the separate credentials file
  - object naming and whether the checksum is a separate object or metadata
  - behaviour when a run overlaps a deployment and the production lock; it must
    neither alter the deployment nor fail silently
  - the `rclone` configuration
  - the failure-injection mechanism for the production evidence
  - the timer's time of day and missed-run catch-up
  - whether production restore gets its own `make` target
  - the PostgreSQL role used for `pg_dump`
  - installing the systemd units through `prod-deploy` or a separate owner step
  - the exact production recovery sequence, including a new VPS, the fixed
    host IPv4, DNS and Caddy, and the handling of a damaged database
- No architectural or product questions remain open for #32.

---

## ID-6 Mobile responsive layout

Responsive adaptation of the existing UI, so the four main flows — create poll,
share poll, vote (reorder the ranking) and view results — are fully usable on a
phone. Frontend only: no API, shared-package or storage change. This is not a
visual redesign, rebranding or general UX overhaul; product behaviour and the
feature-oriented frontend architecture stay as they are.

### Scope

- [x] Every width from 320 CSS px upward is supported. 320 px is inside the
      contract; narrower widths are not
- [x] Covered pages and states: the create form (2 and 10 options), "Poll
      created" with its share link, the ballot (a few and 10 options), results
      (single winner, tied winners, zero ballots with the share link) and "Poll
      not found". Their short status and error messages follow the same rules
- [x] At 1280 px each page keeps its current desktop structure — the centred
      `max-w-xl` column and the same arrangement

### Layout and long content

- [x] No page needs horizontal scrolling or renders zoomed out
- [x] No text or control is clipped, truncated or pushed off-screen
- [x] Poll titles, option text and winner text wrap inside their column,
      including a single unbroken token (a pasted URL, a long compound word)
- [x] Single-line text fields (question, options, share link) stay inside the
      viewport; longer text scrolls inside the field, and the share URL stays
      copyable with Copy
- [x] The score table stays a table, with no horizontally scrolling container;
      the option column wraps, and position labels (`1-2`) and scores are never
      split across lines

### Touch

- [x] Every interactive control has a bounding box of at least 24×24 CSS px
      (WCAG 2.2 AA). On `main` only `+ Add option` (83×20) falls short
- [x] On touch, a normal swipe over a ballot row — option text included —
      scrolls the page and leaves the ranking unchanged
- [x] On touch, drag & drop starts after a press and hold, then movement; the
      hold opens no text selection or context menu
- [x] The ↑/↓ buttons remain the alternative way to reorder, and a tap on them
      never starts a drag. Mouse and keyboard dragging and the ballot
      instructions stay as they are on `main`

### Verification

Chromium with mobile and touch emulation (DevTools device mode or the DevTools
protocol) is the required path, against `make web` and `make api`. Layout cannot
be observed in jsdom, and `docs/11-testing-strategy.md` keeps browser end-to-end
and visual-regression suites out of the MVP.

- [x] **Data:** the `make seed` polls plus one long-content poll — a title that
      ends in an unbroken URL of 60+ characters, and 10 options including a
      70+ character unbroken URL-like token and a 48-character single word
      (`Donaudampfschifffahrtsgesellschaftskapitänsmütze`), with the two
      longest options tied for first place
- [x] **Measure** at 320 and 375 px on every covered page:
      `document.documentElement.scrollWidth <= W`, the emulated width, and
      every `button`, `a[href]` and `input` at least 24×24. Compare with `W`,
      not `window.innerWidth`: under mobile emulation an overflowing page widens
      the layout viewport (613 px at 320 on `main`), so that check always passes
- [x] **Details view:** the same measurements pass on the score-breakdown
      Details view (`/poll/:id/results/options/:optionId`), which ID-19 added
      and already holds to this contract, so ID-6's layout changes cannot
      regress it unnoticed
- [x] **Gestures** at 320 px on the long-content ballot: a swipe without holding
      scrolls and keeps the ranking; press, hold and move reorders; a tap on
      ↑/↓ moves one place. At 1280 px a mouse drag still reorders
- [x] **Evidence** in the PR description: a short pass/fail summary,
      screenshots at 320 px of the long-content vote and results pages, and
      before/after screenshots at 1280 px of any page whose markup changed
- [x] **Tests:** the existing Vitest suites stay green. The touch activation
      gets a component test if dnd-kit's sensors can be driven in jsdom;
      otherwise the PR says so and the gesture check is the evidence

Recommended, not required for Done: a quick spot check on a real iOS Safari and
Android Chrome phone (swipe over the ballot, press-and-hold drag, ↑/↓), since
Chromium emulation cannot show iOS long-press text selection.

### Documentation

- [x] `docs/08-known-limitations.md` "Mobile Support" states the 320 CSS px
      minimum instead of "basic mobile responsiveness"
- [x] `docs/implementation-plan.md` Phase 3 no longer points at ID-6 as pending

### Out of Scope (tracked separately)

- Widths below 320 CSS px — outside the contract
- Visual redesign → ID-45
- Rebranding, a drag handle or a card layout for results — not planned
- Title and option length limits — not planned; wrapping must not depend on one
- Keyboard/a11y reorder and an accessibility audit, including browser text zoom
  → the Post-MVP list below and `docs/11-testing-strategy.md`
- Installable app / PWA → ID-11
- Browser end-to-end and visual-regression suites — excluded by
  `docs/11-testing-strategy.md`
- Unrelated cleanup elsewhere in `apps/web`

### Baseline on `main`

Measured during readiness at `37e62c5` in headless Chromium with mobile and
touch emulation, the API stubbed with the long-content data above:

- Pass at 320 and 375 px: the create form (with 10 long options too), the share
  link, short ballots and results, zero ballots and "Poll not found"
- Fail: the long-content vote and results pages are 613 px wide at 320 px. The
  headings, the ballot row text (a `flex-1` span that cannot shrink below its
  longest token), the winner badge and the score table's option cell all grow
- Touch: the drag activator is the option text with `touch-action: none`; a
  200 px swipe there did not scroll and moved the option two places up

### Readiness Decisions

- Accepted by the owner: the 320 CSS px boundary and the four-flow scope; a
  24×24 CSS px minimum target; on touch a swipe scrolls and drag starts after a
  press and hold; touch drag stays, no drag handle is added, and ↑/↓ remain the
  alternative. Chromium mobile/touch emulation is the required verification;
  real-device checks are a recommended spot check only.
- Implementation choices, settled in the implementation PR and its review: the
  CSS technique for wrapping and shrinking (for example `overflow-wrap`,
  `min-w-0`, a narrower page gutter); the hold delay, movement tolerance and
  dnd-kit sensor setup; whether `make seed` gains the long-content poll; the
  emulation tooling used to measure.
- Accepted by the owner in the 2026-10-19 backlog sweep: ID-6 also measures the
  Details view, which ID-19 added after these criteria were written.
- No architectural or product questions remain open for ID-6.

---

## ID-19 Explain score calculation

Answers the Results story "see how scores were calculated, so that the result
feels fair" (`docs/02-user-stories.md`), deferred from #5. Each option gets a
Details view that breaks its Borda score down by place. A vertical slice: the
results contract becomes discriminated by `method`, its Borda variant exposes
the per-place counts the API does not return today, and the web adds the view
and its entry point. Borda semantics do not change.

### API and shared contract

- [x] The shared results contract is discriminated by `method`:
      `PollResultsResponseDto` is a union whose only member is
      `BordaResultsResponseDto`, typed `method: CountingMethod.BORDA`. Other
      methods add their own variants in their own items
- [x] Every entry of the Borda variant's `scores` and `winners` carries
      `breakdown` as specified in `docs/09-api-design.md`: `N` rows for places
      `1..N` in ascending order, each `{ place, points, ballots, subtotal }`,
      places with `ballots: 0` included
- [x] The entry type that carries `breakdown` belongs to the Borda variant. No
      method-neutral type carries Borda fields
- [x] `points` is `N − place`, `ballots` counts the ballots that ranked the
      option at that place, `subtotal` is `points × ballots`. The API computes
      all three, so the web holds no Borda formula
- [x] The subtotals add up to `score`, and each option's `ballots` add up to
      `totalBallots`
- [x] Zero ballots: every row has `ballots: 0` and `subtotal: 0`
- [x] On the wire `breakdown` is the only addition: `score`, the order of
      `scores`, `winners`, `totalBallots` and `method` are unchanged for any
      set of valid ballots. Entries for an option outside the poll stay
      ignored, in the breakdown as in the score
- [x] No new endpoint

### Results table entry point

- [x] In the score table, each row's Score value is a link to that option's
      Details view, `/poll/:id/results/options/:optionId`. No separate icon or
      button is added, and the table keeps its three columns
- [x] Each score link's accessible name contains its score and the option text,
      so the links can be told apart outside their table row
- [x] The winner badge, the tie labels and the zero-ballot state are unchanged.
      With no ballots there is no table, so there are no score links

### Details view

- [x] Public like the results page: the URL opens directly, with no vote and no
      prior visit to the results page
- [x] Shows the poll title, the option text, and a link back to
      `/poll/:id/results`
- [x] A breakdown table with the columns Place, Points, Count and Subtotal, one
      row per place from first to last. Place reads as an ordinal (1st, 2nd,
      …). Rows with a count of 0 are shown. The values come from the API
      `breakdown` as they are
- [x] Reached by click, tap or keyboard. Nothing depends on hover

### States and edge cases

- [x] Unknown poll (API `404`): the shared `NotFound` with "Poll not found",
      no Retry, as on the results page
- [x] An `optionId` that is not one of the poll's options: the shared
      `NotFound` with option-specific copy, no Retry
- [x] Network error or 5xx: an error message with Retry
- [x] Zero ballots: "No votes yet" replaces the breakdown table, the same as
      on the results page in #5. The back link stays
- [x] `/poll/:id/results/extra` still renders the generic not-found page (#18)

### Mobile (ID-6 contract)

These rules hold whether ID-6 ships before or after ID-19.

- [x] From 320 CSS px upward the Details view needs no horizontal scrolling
      (`document.documentElement.scrollWidth <= W` at 320 and 375 px). The
      breakdown stays a four-column table with no horizontally scrolling
      container. The poll title and the option text wrap, including a single
      unbroken token
- [x] Every interactive control on the Details view, and every score link in
      the results table, is at least 24×24 CSS px

### Verification

- [x] **Domain** (`borda.spec.ts`): breakdown rows for a multi-ballot fixture.
      Subtotals add up to the score, counts add up to the ballot count. Zero
      ballots give zero rows. Foreign-option entries are ignored
- [x] **API e2e** (`polls.e2e-spec.ts`): the results response carries the
      breakdown in the zero-ballot and multi-ballot cases
- [x] **Web** (Vitest): the score links and their targets, the breakdown rows,
      each state above, and `App` routing for the Details route and the #18
      over-run path
- [x] **End-to-end** (`verify-app`, against `make web` and `make api`): on a
      seeded poll, clicking a score opens that option's breakdown. Its
      subtotals add up to the score in the table, and the back link returns
      to the results
- [x] **Mobile:** Chromium mobile emulation at 320 and 375 px on a 10-option
      poll with ID-6's long-content options. The two Mobile checks pass; the PR
      includes a 320 px screenshot of the Details view

### Documentation

- [x] `docs/09-api-design.md` drops its "not shipped yet" note for
      `breakdown`, and the contract matches the code
- [x] `docs/03-ux-flow.md` Results step mentions the per-option breakdown
- [x] `docs/backlog.md` moves ID-19 to `Done`

### Out of Scope (tracked separately)

- Hover or focus preview of the breakdown → ID-38. The Details view is the
  full path on every device
- Result variants and explanations for IRV (ID-8), Condorcet (ID-9) and later
  methods, and returning or comparing several methods' results for one poll
  (ID-10). The product expects every counting method to explain its result.
  Each method's variant and explanation are designed with that method; ID-19
  adds no requirement to those items
- Privacy suppression — a minimum ballot threshold, hidden breakdowns for
  small polls, privacy warnings or anonymisation rules. Not planned at this
  stage; the aggregate breakdown is shown for any ballot count
- Extracting the shared load/404/retry logic → ID-26
- Manual refresh → ID-20

### Readiness Decisions

- Accepted by the owner: a per-option breakdown by place, with Place, Points,
  Count and Subtotal; the total stays in the results table. The breakdown has
  its own Details view, and the score value in each results row is its only
  entry point. Hover preview is #69. No privacy suppression. Borda only, with
  future methods expected to explain their own results. The Details view
  follows the ID-6 contract from 320 CSS px. The results contract is
  discriminated by `method`, and only its Borda variant is added now, as the
  smallest extension point. Multi-method work stays with ID-8, ID-9 and ID-10.
- Settled during readiness. These follow from the decisions above and are open
  to review in this PR:
  - One Details view per option. The row's score opens that option's
    breakdown, which is what #69 previews.
  - Route `/poll/:id/results/options/:optionId`. It sits under the public
    results URL. The fixed `options` segment keeps `/poll/:id/results/extra`
    on the catch-all, so #18's behaviour and test stand.
  - Contract: a `breakdown` field on the Borda variant's score entry, in the
    existing results response. `winners` keeps the same shape. The Details
    view reads that one response, with no per-option endpoint. Points and
    subtotals come from the API because the shared DTO keeps counting logic in
    the API domain. No base type for future variants is designed now: the
    item that adds the second variant extracts what the two share.
  - Zero ballots and an unknown option follow #5 and #18.
- Implementation choices, settled in the implementation PR and its review:
  component and file names; type names inside the Borda variant, including
  whether `PollScoreDto` is renamed; whether the web narrows on `method`
  explicitly while Borda is the only variant; the ordinal format; copy for
  headings, the back link and the option not-found message; whether the view
  repeats the option's total or adds a one-line caption; how a score link
  reaches 24×24. Copying or sharing the existing load/retry pattern is also
  open; extracting it is ID-26.
- No architectural or product questions remain open for ID-19.

---

## ID-39 Add backlog sweep process

A lightweight, reusable backlog sweep for the continuous-flow process, from
Issue #72. One canonical `backlog-sweep` skill holds the sweep procedure. A
thin, deterministic workflow only requests and tracks sweeps through one
persistent tracker Issue. `docs/backlog.md` gains a `Cancelled` section, so an
item that is no longer wanted keeps its ID and the reason. Repository process
and tooling only: no app, API, shared-package or storage change.

### Sweep request workflow

- [x] One plain GitHub Actions workflow, with no model, is the common entry
      point for every sweep request: `workflow_dispatch` with a required
      free-text `reason`, plus the weekly periodic check below. It has no
      `push`, tag or `issues` trigger
- [x] Its logic lives in a `scripts/` module with `node:test` tests that
      `pnpm test` runs, as with backlog promotion. The workflow YAML only
      invokes it and holds no sweep procedure
- [x] Every run, dispatched or scheduled, is serialized in one concurrency group
      that queues runs instead of cancelling them, so no request is dropped and
      no second tracker is created
- [x] Least privilege as in backlog promotion: `permissions: {}` at the top,
      only the Issue permissions the job needs, actions pinned by SHA, and the
      `reason` input never interpolated into a script
- [x] It is not a required check

### Tracker Issue

- [x] The tracker is the one Issue that carries the reserved `backlog-sweep`
      label. Open means a sweep is requested; closed means none is pending
- [x] The lookup covers open and closed Issues, excludes pull requests and
      follows pagination
- [x] With no tracker, a request creates the label if it is missing, then the
      tracker. Its body holds only the tracker semantics, who closes it, and a
      link to the canonical skill — no sweep procedure
- [x] With more than one tracker, a request changes nothing, and the run fails
      with a message that names every labelled Issue and the recovery: remove
      the label from all but one
- [x] A request reopens a closed tracker and leaves an open one open. Either way
      it adds one comment that records the reason as given, shown as inline
      code because it is untrusted text, and links the run
- [x] A retried request adds no second comment: a reason already recorded since
      the tracker was last opened is not recorded again. A re-run of the same
      workflow run or a repeated release request leaves one comment

### Request triggers

- [x] **Ready pool, at pickup time.** Whoever picks a `Ready` item for work, an
      agent or a person, through `new-slice` or not, counts the `Ready` rows of
      `Todo` without the picked item. When fewer than 2 remain, they request a
      sweep with a reason that names the picked item and the count. The rule
      lives in `AGENTS.md` and `docs/07-process.md`; `new-slice` step 1 points
      to it instead of restating it
- [x] **Release.** The manual release flow in `docs/production.md` requests a
      sweep only after a successful deployment and production verification,
      with a reason that records the release tag and the full deployed SHA. A
      tag push never triggers a sweep
- [x] **Future CD.** `docs/07-process.md` records that a future release workflow
      requests a sweep through the same entry point, and only after a
      successful deployment and verification
- [x] **Periodic, best effort.** A weekly scheduled check requests a sweep when
      the tracker is closed and was last closed at least 30 days ago, with a
      reason that names that date. It adds no comment while the tracker is
      open, and with no tracker it does nothing and says so in the run summary
- [x] The docs state GitHub's limitation: in a public repository, scheduled
      workflows are disabled after 60 days without repository activity and stay
      off until someone re-enables them. No external scheduler is added

### Completing a sweep

- [x] A sweep's result PR links the tracker without a closing keyword. Nothing
      closes the tracker automatically
- [x] The owner closes the tracker once the approved changes have merged, or
      once they accept a no-change sweep, after checking that the latest
      trigger reasons on the tracker were covered

### `backlog-sweep` skill

- [x] `.claude/skills/backlog-sweep/SKILL.md` in the Agent Skills format, with
      the relative symlink `.agents/skills/backlog-sweep`. As with
      `task-readiness`, agents may invoke it on their own
- [x] It starts from the tracker's trigger reasons since it was last opened, and
      reviews every `Todo` item: still needed? Type and Level still correct?
      Dependencies still valid? State still correct? Readiness stale? A
      candidate for replenishing the `Ready` pool?
- [x] It only recommends. It presents each proposed change with a reason and
      waits for the owner's decisions; nothing in `docs/` changes before them,
      and it decides no product or process question
- [x] Only `task-readiness` sets `Ready`. A sweep may name readiness candidates
      and recommend moving a stale item out of `Ready`, but never sets `Ready`
- [x] After the decisions it applies only the approved changes on a `docs/`
      branch, moving a cancelled item to `Cancelled` with its reason. It runs
      `make format-check` and the backlog format tests, opens a PR that lists
      the trigger reasons it covered and links the tracker, and stops at green
      CI
- [x] The procedure lives only in the skill. The workflow, its script and the
      tracker Issue point to it

### `Cancelled` backlog section

- [x] `docs/backlog.md` has `## Cancelled` after `## Done`, preceded by
      `<!-- prettier-ignore -->`, with the same columns, fixed widths and
      right-aligned `ID` as `Done`: `ID | Title | Type | Level | Notes`. Notes
      records the cancellation reason. The table may have no rows
- [x] An item that is no longer wanted moves from `Todo` to the end of
      `Cancelled` by an owner decision and keeps its ID, Title, Type and Level.
      Rows are never deleted, and IDs are never reused
- [x] The `Format` section's width table and rules cover `Cancelled`, and the
      `Workflow` section describes cancellation, sweeps and the tracker
- [x] Issue triage (`.github/workflows/issue-triage.md`, a body-only edit that
      needs no recompile) also reads `Cancelled` and may cite a matching item as
      context. A match never decides the verdict by itself: renewed interest
      remains the owner's call

### Backlog tooling

- [x] The deterministic backlog parser and lint, used by `pnpm test` and by
      backlog promotion, cover `Todo`, `Done` and `Cancelled`: the format
      rules, Legend values, and duplicate IDs within and across all three
- [x] Next-ID allocation counts all three sections, plus the IDs that open pull
      requests add
- [x] Tests cover at least: the highest ID existing only in `Cancelled`;
      duplicate IDs across sections; `Cancelled` formatting (columns, padding,
      overflow, Legend values, `prettier-ignore`); and promotion leaving
      `Cancelled` rows unchanged

### Verification

- [x] Unit tests for the request logic: tracker lookup (open and closed, pull
      requests excluded, more than one page), creation of the label and the
      tracker, the more-than-one failure with no writes, reopen plus comment,
      a comment on an open tracker, a repeated reason recorded once, and the
      periodic check (due, not yet due, tracker open, no tracker)
- [x] The backlog tooling tests above; `make verify` passes
- [x] The workflow cannot run before it is on `main`. The PR says what was
      verified locally and lists the post-merge step
- [x] After merge, the owner runs the workflow once with the reason
      `initial backlog sweep`. It creates the label and the tracker with that
      reason: the end-to-end check, and the first sweep request. Done on
      2026-10-05: workflow run 37362889824 on `baef2fe` created tracker #77

### Documentation

- [x] `docs/backlog.md`: `Workflow`, `Format` and the new `Cancelled` section;
      ID-39 moves to `Done`
- [x] `AGENTS.md`: the pickup-time Ready-pool rule under Process Rules, and the
      new skill under Skills & Workflows
- [x] `docs/07-process.md`: How We Work (the pickup rule, sweeps) and CI/CD (the
      request workflow, its scheduled-run limitation, the future CD entry point)
- [x] `docs/production.md`: the release sweep request in "Tag and immediate
      recovery handoff", after the verified deployment
- [x] `.claude/skills/new-slice/SKILL.md` step 1 points to the pickup rule
- [x] `docs/06-decisions.md`: the "Backlog sweep process" ADR no longer says
      implementation pending
- [x] `docs/12-ai-first.md`: Wave 6 lists the sweep as done

### Out of Scope (tracked separately)

- Implementing CD, including its call to the request entry point. There is no
  backlog item yet; `docs/07-process.md` records that CD does not exist
- Running a sweep automatically. The automation only requests and tracks
  sweeps; a scheduled grooming agent stays a Wave 6 idea in
  `docs/12-ai-first.md`
- An `In progress` state, and exact tracking of concurrent pickups — not planned
- Closing the tracker automatically, and tracking which request a sweep or PR
  covered — not planned; the owner checks the reasons when closing
- An external scheduler for the periodic check — not planned
- Changes to `task-readiness`, which stays a separate stage

### Readiness Decisions

- Accepted by the owner on 2026-10-05, after an independent review of the
  readiness analysis:
  - one canonical skill, and one common `workflow_dispatch` entry point with a
    required reason
  - the Ready-pool rule at pickup time (the picked item excluded, fewer than 2
    left) as a general procedural rule, with no `In progress` state
  - release requests only after a successful deployment and production
    verification, carrying the release identity, and never from a tag push
  - `## Cancelled` shaped exactly like `Done`, with the tooling and tests above;
    triage uses it as context only
  - the reserved `backlog-sweep` label and a persistent tracker with the
    safeguards above, created by the workflow on the first request
  - no closing keyword in the result PR; the owner closes the tracker
  - a weekly, best-effort periodic check measured from the last closing, with no
    reminder on an open tracker
  - the owner-operated `initial backlog sweep` run after merge
  - the title "Add backlog sweep process", and ID-39 stays one item
- Settled during readiness, open to review in this PR:
  - The periodic check needs an existing tracker. Before the first request no
    sweep has completed, so there is nothing to measure from, and creation
    stays with explicit requests such as `initial backlog sweep`.
  - A repeated identical reason counts as the same trigger. Each reason names
    its source (the picked item, the release tag and SHA, the last closing
    date), so the reason text is the stable identifier.
  - Agents may invoke the skill on their own, as with `task-readiness`: it only
    recommends, and a request in plain words should find it.
  - ID-39 moves to `Done` in its implementation PR. The post-merge run is that
    PR's listed post-merge check; if it fails, a `fix/` PR follows.
- Implementation choices, settled in the implementation PR and its review: file
  names; whether the backlog parser moves into a module that both scripts
  share; the wording of the tracker body and comments, and any hidden marker;
  the weekly schedule time; how the last closing is read; the documented
  request command; the label's colour and description.
- No architectural or product questions remain open for ID-39.

---

## ID-40 Record v0.1.0 evidence

The post-deployment record for the first production release, from Issue #78.
The owner deployed and tagged `v0.1.0`, and ID-29 moved to `Done` in the backlog
sweep of PR #56, but the record that #29 promised was never made: the #29
runtime criteria are unchecked, the changelog has no release, and several docs
still describe the deployment as pending. Docs and changelog only: no app, API,
shared-package, storage or production-tooling change, and the implementation
neither accesses nor changes production.

### Facts verified during readiness

Verified from the repository and GitHub; the record may cite them without
owner input:

- Annotated tag `v0.1.0` ("First verified production release", tagged
  `2026-09-19T10:15:33Z`) points at
  `7021f3137b597119e39ca13e6a86275da58b28e1`, the merge of PR #53
- Push CI run `35417067634` on that SHA passed both `checks` and `containers`
- Since the tag, `main` has not changed `apps/`, `packages/`,
  `scripts/production/`, `deploy/` or either Compose file
- PR #53 states that the first deployment attempt failed on Docker 29.7.2,
  before its fix
- The #28 record already holds the owner-supplied smoke poll
  `4647e500-8940-41a2-9b25-6261d82e9ace`: present in production, with one ballot
  scoring `2`/`1`/`0`, by `2026-09-19T14:01:18Z`

### Owner-supplied input

The owner supplies these at the start of implementation. A missing item leaves
the criteria it would support unchecked; it does not stop the work.

- The fields of `deploy-state/current.env` (`RELEASE_SHA`, `API_IMAGE`,
  `WEB_IMAGE`, `API_IMAGE_ID`, `WEB_IMAGE_ID`, `PRODUCTION_URL`, `DEPLOYED_AT`,
  `RELEASE_TAG`, `SMOKE_POLL_ID`; none is a secret), and whether `previous.env`
  exists
- Whether the deployment of `7021f31` passed the `HOST VERIFIED`,
  `PROXY VERIFIED` and `PUBLIC VERIFIED` confirmations with the checks they
  list actually performed, followed by `tag --tag v0.1.0`
- A summary of the read-only host preflight: Ubuntu, Docker Engine, Compose and
  Caddy versions, disk and memory headroom, host and cloud firewall, IPv4/IPv6
  exposure and DNS A/AAAA records
- Results of `probe ports` (IPv4, any IPv6, loopback), `probe proxy` and
  `probe peer-check`
- The external browser, existing Caddy sites and controlled persistence checks
- Whether a planned host reboot has happened since, and whether the services
  recovered from it

### #29 evidence record

- [x] The `## #29 First Production Deploy` section gains a
      `### Completion evidence` block that records `v0.1.0`: tag, full SHA, CI
      run, the manifest fields, deployment time, smoke poll and the supplied
      checks
- [x] A #29 criterion is checked only when the record cites its evidence, of
      one of three kinds: owner-supplied input, repository or GitHub history, or
      a check that `make prod-deploy` at `7021f31` performs automatically before
      it writes `current.env`. The third kind needs the owner-supplied manifest
      for that SHA, and the record names the function in `scripts/production/`
      that performs the check
- [x] Criteria that depend on the operator's own observation (browser, port and
      proxy probes, firewall, IPv6, existing sites, reboot) are checked only from
      the owner's supplied results or explicit confirmation, never from the
      manifest alone
- [x] Criteria still unchecked are named, grouped, in the Completion evidence
      block as having no recorded runtime evidence. Their boxes stay unchecked
      and their wording is unchanged
- [x] The section's opening paragraph no longer says that the deployment is
      pending; it points to the Completion evidence. The criteria wording and the
      Readiness Decisions stay as written
- [x] The record contains no secret: no database URL, password, `prod.env`
      value, private Caddy configuration or unredacted audit output
- [x] ID-29's `Done` row stays unchanged

### Changelog

- [x] `## Unreleased — first production release preparation (#29)` becomes
      `## v0.1.0 — 2026-09-19`, the tag date. The two content bullets stay; the
      "not deployed, no release tag" bullet is replaced by the deployed identity
      (`https://rankvote.avshukan.com`, full SHA) and the #28 recovery drill
- [x] No `Unreleased` section is added, since nothing in the images has changed
      since the tag

### Stale documentation

Each passage stops describing the first deployment, `v0.1.0` or #29 as pending,
`Todo`, not live or awaiting a record PR, and states the completed state:

- [x] `README.md`, Production operations
- [x] `AGENTS.md`: the sentence "Repository preparation alone does not complete
      #29." goes; the owner-operated rule for host-changing `make prod-*`
      commands stays
- [x] `docs/production.md`: the opening paragraph, the end of section 8, and
      "Repository evidence and pending AC" including its heading, which points
      to the #29 Completion evidence
- [x] `docs/05-architecture.md`: "Production is not live yet."
- [x] `docs/06-decisions.md`, "First production release on the shared VPS": its
      Status line and the "remain pending" sentence
- [x] `docs/07-process.md`: the `v0.1.0` paragraph under Release, the #29 clause
      of the "CD does not exist yet" principle, "releases will be tagged
      manually once there is something to release", and the first-deployment
      paragraph after the principles
- [x] `docs/08-known-limitations.md`: the opening of Operations
- [x] `docs/09-api-design.md`, Base URL: "not a statement that the service is
      live yet"
- [x] `docs/10-storage.md`: the sentence on production evidence and closure of
      #29
- [x] `docs/implementation-plan.md`: the Phase 5 status
- [x] `docs/acceptance-criteria.md`, #28 Out of Scope: the post-deployment record
      points to ID-40 instead of #29

### Verification

- [x] Every hit of
      `grep -rnE "#29|ID-29|v0\.1\.0|pending|live yet" --include='*.md' .`
      outside `node_modules` and this section is reviewed in context: none
      describes the first deployment or #29 as still pending. A search for exact
      phrases misses wrapped lines, which is why each hit is read
- [x] Every checked #29 box traces to a fact in the Completion evidence; the PR
      description summarizes which evidence kinds were used
- [x] The Definition of Done gate passes and CI is green
- [x] ID-40 moves to `Done` in its implementation PR

### Out of Scope (tracked separately)

- Production access, redeployment, re-running probes, or reconstructing
  evidence the owner did not supply — excluded by the owner's decision below
- Changes to the release process, the runbook procedure or production tooling —
  not planned
- Recovery after the next planned reboot, if none has happened yet — stays an
  unchecked #29 criterion; production monitoring is ID-33
- A backlog sweep request for `v0.1.0`, which predates the sweep workflow (see
  `docs/production.md`, section 8) — not planned
- Renaming older `#N` backlog references in docs to `ID-N` — not planned

### Readiness Decisions

- Accepted by the owner on 2026-10-06:
  - Record only what is evidenced. Criteria without evidence stay unchecked and
    are named as unrecorded; neither a full per-criterion proof as in #28 nor a
    history-only note
  - Automatic checks of `make prod-deploy` at `7021f31` count as evidence under
    the citation rule above; checks that need the operator's own observation
    need the owner's input
  - `Ready`: the owner supplies the input at the start of implementation, and a
    missing item leaves its criteria unchecked instead of blocking ID-40
- Settled during readiness, open to review in this PR:
  - Issue #78's list of stale passages was not exhaustive. The same pending
    wording in `README.md`, `AGENTS.md`, `docs/05`, `docs/06`, `docs/09`,
    `docs/10` and the #28 Out of Scope line belongs to ID-40
  - The changelog dates `v0.1.0` by its tag, and no `Unreleased` section is
    added while nothing shipped in the images has changed
  - The evidence lives in the #29 section as `Completion evidence`, as the #28
    evidence does; `docs/production.md` points to it
- Implementation choices: the wording of each corrected passage, how the
  unrecorded criteria are grouped, and how much of the CI run the record
  repeats.
- No architectural or product questions remain open for ID-40.

---

## ID-42 Automate tagged releases

The first CD workflow, from Issue #88. A release stays an explicit owner
decision: the `Prepare release` workflow opens a changelog pull request for a
chosen version, the owner reviews and merges it and tags its merge commit, and
the tag starts a release workflow. That workflow validates the exact commit,
waits for one owner approval, deploys the commit unattended through the
existing production tooling, verifies it and requests a backlog sweep. Merging
to `main` never deploys. The implementation PR merges first and changes no
production state. The owner then performs the production setup below, and
ID-42 moves to `Done` in a small record PR once the first release made this way
(the one carrying ID-19) has supplied the production evidence, including the
removal of the VPS GitHub credential that follows that release.

### Facts verified during readiness

- `confirm()` in `scripts/production/cli.py` refuses without a terminal, so
  `make prod-deploy` cannot run unattended. `HOST VERIFIED` is asked before any
  change; `PROXY VERIFIED` and `PUBLIC VERIFIED` are asked inside `deploy()`
  after the new release has started
- The release tooling must run as root: `local_host` requires it,
  `private_path` requires the root-owned `prod.env` and `deploy-state`, the
  checkout is root-owned, `preflight` reads `iptables`, and Docker access is
  root-equivalent
- The VPS talks to GitHub only in `check_source`: `git fetch origin main` over
  HTTPS, and three `gh api` reads (the CI runs for the SHA, their jobs, and the
  rules for `main`). All three endpoints are public and answer without
  authentication; the unauthenticated limit is 60 requests an hour per IP, and
  a deployment makes three
- The production checkout's `origin` is HTTPS. The GitHub CLI on the VPS is
  logged in with a stored OAuth token that has the `repo`, `workflow`, `gist`
  and `read:org` scopes, contrary to the read-only prerequisite in
  `docs/production.md`. With `repo`, that token can push to every repository of
  the owner, create or change Environments, and approve pending deployments as a
  required reviewer. `gh auth logout` only removes it locally; revoking it means
  revoking the GitHub CLI authorization, which signs the CLI out on every device
- SSH listens on port 22 over IPv4 and IPv6, UFW allows 22/tcp from anywhere,
  and no DigitalOcean Cloud Firewall is configured, so GitHub-hosted runners
  reach SSH without a firewall change
- `ReleaseState.prepare()` copies `current.env` to `previous.env` on every
  deploy. After a failed candidate both name the last verified release, which is
  the right rollback target. Deploying the already-current SHA again would lose
  the real previous release; for the manual path that is Issue #92
- `verify_poll` expects exactly one ballot. The `v0.1.0` smoke poll ID is public
  in the #29 evidence, and duplicate-vote protection is client-side only, so
  anyone can add a ballot to that poll
- The repository is public, and so are its Actions logs. For the operator,
  `preflight` prints listening sockets, firewall rules, the containers of every
  project on the host, addresses and resources
- A tag push runs no CI, and `ci.yml` cancels an in-progress `main` push run
  when the next merge arrives. A `main` commit whose push run was cancelled has
  no successful run, so `check_source` refuses it. Push runs exist only for the
  head commit of each push to `main`, so the commits a release can use lie on
  one line of history, ordered by Git ancestry
- `make prod-smoke`, part of the `containers` job on the exact SHA, already
  exercises the reviewed Caddy route, forged forwarding headers, a second peer,
  a full vote, recovery from a database that starts late and data-preserving
  recreation
- The repository has no `production` Environment and no tag ruleset; required
  reviewers are available to this public repository. Events created with
  `GITHUB_TOKEN` start no workflow runs except `workflow_dispatch` and
  `repository_dispatch`, so the release workflow can request the sweep with its
  own token and `actions: write`

### Release preparation

- [x] `.github/workflows/prepare-release.yml` runs only on `workflow_dispatch`
      with one required `version` input. Its logic lives in a `scripts/` module
      with `node:test` tests that `pnpm test` runs; the YAML only invokes it
- [x] `version` must match `^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`. It is
      read from the event payload and never interpolated into a shell command or
      script source
- [x] It refuses and changes nothing when the tag already exists, `CHANGELOG.md`
      on `main` already has a heading for the version, the version is not
      greater than the highest existing `v*` tag, or the release-prep branch or
      a pull request for the version already exists. The report links an
      existing pull request or names the recovery step, so starting the same
      preparation twice never opens a second pull request
- [x] The previous release is the highest existing `v*` tag. Above the top entry
      of `CHANGELOG.md` it adds `## vX.Y.Z — YYYY-MM-DD`, dated with the run's
      UTC date, and a summary drafted from the subjects of the first-parent
      commits in `<previous tag>..main`. The entry records the exact `main`
      commit it was drafted from (`<!-- release-prep base: <sha> -->`, invisible
      when rendered). Nothing else changes, and no `Unreleased` section is
      created; feature pull requests do not edit the changelog
- [x] It opens one ordinary pull request from `chore/release-vX.Y.Z` with that
      one commit. The description asks the owner to review and edit the entry,
      names the prepared `main` commit, says to merge only while `main` is still
      at it, and gives tag commands that refuse to tag a merge commit whose
      parent is not that commit. If opening the pull request fails, it deletes
      the branch it created
- [x] `permissions: {}` at the top, and the job has only `contents: write` and
      `pull-requests: write`; actions are pinned by SHA and checkout does not
      persist credentials. It uses no Environment or secret and never creates a
      tag, dispatches a workflow or touches production
- [x] Runs are serialized in one concurrency group that queues runs instead of
      cancelling them. It is not a required check; CI on its pull requests
      starts once the owner approves the workflow runs, as for backlog promotion

### Release tag contract

- [x] A release tag is an annotated tag matching the version pattern, created by
      the owner on the merge commit of the reviewed release-prep pull request
      for that version, never on a later `main` commit. That pull request merges
      directly onto the `main` commit it was prepared from and changes only
      `CHANGELOG.md`; changes merged after the preparation, before or after its
      merge, need a new preparation before they can be released
- [x] Release tags are immutable: a `v*` tag ruleset blocks updates and
      deletions, and the same tag always identifies the same SHA. A release that
      fails in its code is never retagged; the fix ships as a new commit with a
      new patch release
- [x] A tag push alone never changes production and never requests a sweep

### Validation before approval

- [x] The release workflow runs only on pushes of `v*` tags. Its first job runs
      on a GitHub-hosted runner with `contents: read`, `actions: read` and
      `pull-requests: read`, without an Environment or secret, and checks: the
      version pattern; an annotated tag whose commit is `GITHUB_SHA`; that this
      commit is the merge commit of the merged `chore/release-vX.Y.Z` pull
      request into `main` and is reachable from `origin/main`; that the latest
      `ci.yml` `push` run on `main` for that exact SHA concluded `success`, with
      `checks` and `containers` successful on that SHA (the rules of
      `validate_ci`); that the version is the highest `v*` tag; that the top
      release heading of `CHANGELOG.md` at that commit is the tag, with a valid
      date and a non-empty entry; and that this entry records exactly one
      prepared `main` commit, which is the merge commit's first parent, with
      only `CHANGELOG.md` changed between the two
- [x] Stale preparation: when another pull request merged after Prepare release
      ran and the release-prep pull request then merged on top of it, the merge
      commit's first parent is not the recorded commit, so validation fails
      before approval and the recovery is to run Prepare release again. A
      regression test reproduces that race, and the check uses only the tagged
      commit's tree and Git history, not the pull request description or other
      mutable state
- [x] The CI proof is that existing push run: the workflow neither reruns CI nor
      relies on the current state of `main`. A commit whose push run failed, or
      was cancelled by a later merge, is refused; the documented recovery is to
      re-run that CI run or to prepare the release again
- [x] If validation fails, no approval is requested and nothing else runs.
      Before approval no job holds the SSH key or any production secret,
      connects to the VPS, runs a VPS command or requests a sweep

### Owner approval

- [x] Only the deploy job references the `production` Environment, so every run
      attempt needs exactly one approval before production changes. The owner is
      the required reviewer; Prevent self-review is off, because the owner both
      tags and approves; administrator bypass is off; and only `v*` tags may
      deploy to it
- [x] A rejected run, or one not approved within GitHub's 30-day limit, changes
      nothing, and a re-run needs a new approval

### VPS access

- [x] The runner connects with a dedicated SSH key whose private part exists
      only as a `production` Environment secret, against a pinned VPS host key.
      An unknown or changed host key fails the job before any remote command
- [x] On the VPS the key is installed for `root` with `restrict` and a forced
      command, so it gives no shell, terminal or forwarding and can only run the
      wrapper. Root is what the release tooling requires; the key grants nothing
      beyond the wrapper
- [x] The wrapper is root-owned, writable only by root and outside the checkout.
      It accepts exactly a release tag and a full SHA matching strict patterns
      and refuses anything else. It never changes the checkout while another
      production operation holds the deployment lock. Before it runs any
      repository code it fetches `main` and the tag over HTTPS and verifies that
      the tag is annotated and points to the SHA, that the SHA is an ancestor of
      `origin/main` and that the checkout is clean; only then does it detach the
      checkout at the SHA and start the unattended release. A stolen key can
      therefore release only an owner-created tag on a reviewed `main` commit
      that passes every check below
- [x] The release on the VPS does not depend on the SSH session: a runner
      disconnect or a cancelled workflow run does not interrupt it
- [x] The Actions log receives only a curated, secret-free status: no host audit
      (listening sockets, firewall rules, other projects' containers, addresses,
      resources) and no raw command output. Full diagnostics stay in root-only
      `deploy-state`
- [x] No production application or database secret is stored in GitHub, and
      the release path needs no GitHub credential on the VPS. `check_source`
      reads the same three public API endpoints over HTTPS, with standard TLS
      verification and without authentication, and fails closed on any error,
      unexpected status, rate limit or malformed response; the wrapper fetches
      with no credential helper. `gh` is no longer a production prerequisite
- [x] Final state for ID-42: the VPS holds no GitHub credential. The first
      tagged release ran while the old GitHub CLI login was still on the VPS;
      the owner removed that local login immediately after the release. Global
      revocation of the GitHub CLI OAuth authorization is intentionally deferred
      to ID-44 and does not block ID-42; every later tagged release runs with no
      GitHub credential on the VPS

### Unattended deployment

- [x] One new non-interactive action of the production CLI reuses `local_host`,
      `read_config`, `check_source`, `Runner.model`, `preflight` and
      `release.deploy`; there is no second deployment implementation. It reads
      no input and asks none of `HOST VERIFIED`, `PROXY VERIFIED` or
      `PUBLIC VERIFIED`
- [x] `make prod-deploy`, `make prod-rollback` and the `tag` command keep their
      confirmations and, apart from the shared `check_source` change, their
      behaviour. They remain the path for the first deployment; host, firewall,
      Caddy, proxy-trust and other infrastructure changes; and break-glass
      recovery, each with the operator checks of `docs/production.md`
- [x] It refuses when no verified `current.env` exists; a first deployment stays
      manual
- [x] Ordering: C and T are the `RELEASE_SHA` and `RELEASE_TAG` of
      `current.env`, X is the tagged commit and V its version. X must be an
      ancestor of `origin/main` or equal to it, and may be behind its tip
- [x] X = C with V = T is the already-current release below. X = C with any
      other T, including none, is refused: one SHA never gets a second release
      tag
- [x] When X ≠ C, C must be an ancestor of X, or the release is refused; this
      refuses a downgrade (X an ancestor of C) and divergent history. When T is
      set, V must also be greater than T. Going back to an earlier release stays
      `make prod-rollback` with its `COMPATIBLE` confirmation
- [x] Already current: the same tag and SHA as `current.env` deploys nothing. It
      builds, stops, prepares, migrates and writes nothing, and `current.env`
      and `previous.env` stay byte-identical. The run reports the release as
      already current and continues to the sweep, so a re-run after a later step
      failed never redeploys
- [x] A retry of the same tag and SHA after a failed attempt reuses the images
      built for that SHA and writes `previous.env` only from the last verified
      `current.env`

### Verified release

- [x] Before any change the release passes the host, config, exact-SHA CI and
      ruleset, Compose model and `preflight` checks (versions, disk, memory, DNS,
      the Caddy container and the network boundary), the deployment lock and the
      ordering rules above
- [x] The deployment keeps the existing sequence: images built and checked
      before downtime, `previous.env` prepared, web and API stopped, PostgreSQL
      left running, one migration, API then web started healthy, and
      `internal_verify`
- [x] Public verification goes through the production origin with standard TLS
      verification: `smoke` (health, the SPA, the production API URL in the
      bundle, poll creation, a full ballot, the 2/1/0 Borda result and the
      direct results route), then a read of the previous release's
      `SMOKE_POLL_ID`, which must still return its title, options and at least
      one ballot. Its exact ballot count is not checked, because that poll ID is
      public. `internal_verify` then runs again
- [x] The release is verified exactly when `current.env` is promoted, in one
      atomic write that already contains `RELEASE_TAG`; no later step attaches
      the tag
- [x] An ordinary release does not run the first-deployment operator checks:
      firewall, cloud-firewall and IPv6 review, the proxy and second-peer
      probes, external port probes, the other Caddy sites, the browser check,
      the recreation and recovery drill, or a reboot. Without a probe there is
      no API restart before the smoke

### Failure and rerun

- [x] Each failure leaves the stated state, and the run summary names the next
      step:
      validation failure, rejection or approval timeout: nothing changed;
      SSH or host-key failure, or a refusal on the VPS before any change:
      nothing changed;
      build or image-check failure: the running release untouched;
      migration failure: web and API stopped, PostgreSQL running and the
      redacted log in `deploy-state`, with no retry, resolve or reset;
      health or public verification failure: `current.env` still names the last
      verified release;
      runner disconnect or cancelled run: the VPS run finishes under its lock,
      and a re-run reports it as already current, is refused while the lock is
      held, or retries the same tag and SHA
- [x] Nothing is rolled back automatically, neither the database nor the
      application. Recovery is owner-operated: `make prod-rollback` with its
      `COMPATIBLE` confirmation, or a forward fix released as a new patch tag
- [x] A re-run never moves a tag and never redeploys a release that
      `current.env` already records

### Backlog sweep

- [x] Only after the deploy job succeeds, the already-current case included, a
      separate job without an Environment and with `actions: write` dispatches
      `backlog-sweep.yml` on `main` with the reason
      `release vX.Y.Z at <full-sha>`. There is no other sweep mechanism
- [x] A failed sweep request leaves the release verified and fails only that
      job. Re-running the failed jobs repeats only the request, without approval
      or deployment, and the existing request script records a repeated reason
      once

### Concurrency

- [x] The deploy job runs in the concurrency group `production-release` with
      `cancel-in-progress: false` and `queue: max`: no release run cancels
      another, each waits for its own approval, and the deployment lock on the
      VPS remains the final guard. An older tag approved after a newer one is
      refused by the ordering rules

### Owner production setup

After the implementation PR merges, the owner:

- [x] creates the `production` Environment with the settings above and stores
      the deploy key and the pinned host key in it
- [x] installs the wrapper and the restricted `authorized_keys` entry on the VPS
- [x] adds the `v*` tag ruleset that blocks updates and deletions
- [x] immediately after the first successful tagged release, removes the
      GitHub CLI credential from the VPS (the CLI login and any `gh` credential
      helper). The first tagged release may run before this step; no later one
      does. Global revocation of the GitHub CLI OAuth authorization is separate
      security cleanup tracked by ID-44

### Tests

Repository and CI:

- [x] Python unit tests with a fake runner cover the unattended action: no input
      is read; every ordering refusal; a tag that does not point to the SHA; the
      already-current case, which leaves both manifests untouched; promotion
      with the tag; failures that leave `current.env` unchanged; curated output
      without host audit; and the unauthenticated `check_source` reads,
      including their fail-closed errors
- [x] The wrapper's input validation is tested
- [x] `node:test` covers `Prepare release` (version validation, every refusal, a
      second start, the changelog entry, its summary and its recorded base) and
      the validation before approval (tag, release-prep merge commit and its
      base, CI result, changelog)
- [x] `make verify` passes locally, run by the owner: its API e2e step resets
      the local test database, which Prisma refuses to let an agent do without
      the owner's consent. The owner ran it on
      `b06a9d31e48389cc4a8d9b721ec2b81d11adedf0`: every step passed, the API e2e
      tests included (4 suites, 35 tests)
- [x] CI is green on the implementation PR

Local and isolated:

- [x] `make prod-check` and `make prod-smoke` pass, and `prod-smoke` also runs
      the automated public verification (`smoke` plus the previous-poll check)
      against its own local stack

Production evidence, required before `Done`:

- [x] The first release made this way, the one carrying ID-19, is prepared by
      `Prepare release`, tagged by the owner on the release-prep merge commit,
      validated, approved once, and deployed and verified without operator input.
      The record states whether the old GitHub CLI credential was still on the
      VPS during that release, as the transition allows
- [x] The record PR names the workflow runs, the tag, the full SHA, the approval
      record and first observable post-approval job time, `current.env` with its
      `RELEASE_TAG`, `previous.env` as the `v0.1.0` manifest, the new and the
      previous smoke poll, and the sweep request on the tracker
- [x] The owner confirms that the deploy key cannot open a shell or run another
      command, and that the Environment settings and the tag ruleset are in place
- [x] After the first release, the owner's checks on the VPS show no GitHub
      credential: `gh auth status` reports no login, root's Git configuration
      has no `gh` credential helper, and `GH_TOKEN` and `GITHUB_TOKEN` are unset.
      Global GitHub CLI OAuth revocation is deferred to ID-44; it is not needed by
      the release path and does not block ID-42

### Completion evidence

- Prepare release run
  [38458789158](https://github.com/avshukan/rank-vote/actions/runs/38458789158)
  opened PR #97 from
  `ababaf0f00523216553abd0a8183ce7b9ba11964`. The owner reviewed and merged
  that PR at `2026-10-13T20:11:32Z`; its merge commit is
  `115d868ada72dce918af3b0d5319fc90949a88c5`. The exact-SHA `main` CI run
  [38460855615](https://github.com/avshukan/rank-vote/actions/runs/38460855615)
  passed before release.
- The owner created annotated tag `v0.2.0` at `2026-10-13T20:18:47Z`; it
  points to that exact merge commit. Release run
  [38461825840](https://github.com/avshukan/rank-vote/actions/runs/38461825840)
  validated the tag and commit, then completed `validate`, `deploy` and
  `sweep` successfully. GitHub's approvals API records exactly one approval
  by `avshukan` for Environment `production`; that API does not expose an
  approval timestamp, so the first observable post-approval time in the record
  is the deploy job starting at `2026-10-13T20:21:53Z`.
- The unattended VPS run reported the release verified at
  `2026-10-13T20:24:28Z`: `current.env` records
  `RELEASE_TAG=v0.2.0`,
  `RELEASE_SHA=115d868ada72dce918af3b0d5319fc90949a88c5` and smoke poll
  `f9ccde31-2964-4bf0-8882-d24eb8e79a48`. `previous.env` preserves the
  previously verified `v0.1.0` manifest at
  `7021f3137b597119e39ca13e6a86275da58b28e1`, deployed at
  `2026-09-19T09:21:41Z`, with smoke poll
  `4647e500-8940-41a2-9b25-6261d82e9ace`.
- The release's sweep job dispatched `backlog-sweep.yml`; run
  [38462577562](https://github.com/avshukan/rank-vote/actions/runs/38462577562)
  recorded `release v0.2.0 at 115d868ada72dce918af3b0d5319fc90949a88c5`
  on tracker #77.
- Owner setup was in place for the release: Environment `production` requires
  reviewer `avshukan`, allows self-review, disallows administrator bypass and
  limits deployment to `v*`; the active `protect-release-tags` ruleset
  matches `refs/tags/v*`, blocks update/deletion/non-fast-forward operations
  and has no bypass actor. The VPS wrapper is `root:root` mode `0755`; the
  SSH key is installed with `restrict` and forced command
  `/usr/local/sbin/rank-vote-release`. Direct shell and `id` probes were
  refused with exit 64.
- The old GitHub CLI login was still present during the first tagged release,
  as the transition allowed. The owner then removed it from the VPS with
  `gh auth logout`; the follow-up checks showed no GitHub login, no `gh`
  credential helper and unset `GH_TOKEN` / `GITHUB_TOKEN`. On
  2026-10-15 the owner explicitly moved global GitHub CLI OAuth revocation out
  of ID-42 because it would sign development machines out too; ID-44 tracks that
  cleanup.

### Documentation

- [x] `docs/production.md`: the tagged release, the owner production setup,
      recovery from each failure, the manual path as fallback, and prerequisites
      without `gh`
- [x] `docs/07-process.md`: CI/CD and Release Flow describe the release workflow
- [x] `docs/06-decisions.md`: the "Tag-triggered releases" ADR no longer says
      implementation pending
- [x] `AGENTS.md` (production tooling) and `README.md` name the release workflow
- [x] ID-42 moves to `Done` in the record PR

### Out of Scope (tracked separately)

- Automated offsite backups → ID-32; production monitoring and alerts → ID-33;
  shared rate-limit state and more API replicas → ID-34
- A manual `prod-deploy` of the current SHA overwriting `previous.env` → ID-43
- Global revocation of the legacy GitHub CLI OAuth authorization → ID-44
- Cancelling intermediate `main` push runs in `ci.yml` — not planned; ID-42
  documents the refusal and its recovery, and work follows if it proves
  inconvenient
- Zero-downtime and multi-replica deployment, an image registry, managed
  PostgreSQL, automatic database or application rollback, a GitHub Release
  page, Caddy changes or first provisioning through the workflow, and unrelated
  VPS hardening — not planned

### Readiness Decisions

- The accepted direction of Issue #88: `main` stays production-ready and a
  merge never deploys; a SemVer tag is the release intent and starts the
  workflow on one exact commit; exactly one owner approval precedes any
  production change, and deployment and verification after it are automated as
  far as safely possible, reusing the existing production tooling; a tag push
  alone is not a verified release and never requests a sweep; the sweep request
  goes through `backlog-sweep.yml` with the release tag and full SHA, only after
  a successful deployment and verification; the changelog is ready before the
  tag; ID-19 is the first change released this way
- Accepted by the owner on 2026-10-09:
  - a GitHub-hosted runner over SSH with a dedicated key, restricted on the VPS
    by a forced command to a stable root-owned wrapper outside the checkout,
    with a pinned host key; production secrets stay on the VPS
  - for an ordinary release, verified means deterministic automated checks. The
    Environment approval is the single human action; the operator checks stay
    with host, firewall, Caddy, proxy-trust and infrastructure changes and
    break-glass recovery
  - immutable release tags; a retry only with the same tag on the same SHA, and
    a code fix as a new patch release
  - a `Prepare release` workflow that opens an ordinary pull request with the
    changelog entry and a summary of the merged changes; no `Unreleased`
    section; feature pull requests do not edit the changelog; the version is
    chosen when preparing the release
  - the tag goes on the merge commit of the reviewed release-prep pull request,
    never on a later commit
  - no GitHub credential on the VPS: `check_source` reads public endpoints
    without authentication, and the VPS-local GitHub CLI login is removed during
    the production setup after the implementation no longer needs it. Global
    OAuth revocation is tracked separately by ID-44 (scope changed on
    2026-10-15, below)
  - the production setup above, including the `v*` tag ruleset
  - ID-43 tracks the manual-path `previous.env` defect; `ci.yml` keeps cancelling
    intermediate `main` push runs for now
- Changed by the owner on 2026-10-12, in the review of the implementation PR
  (#94):
  - a preparation is bound to the exact `main` commit it drafted from: the
    entry records it, the release-prep pull request must merge directly onto
    it, and anything merged in between needs Prepare release again. A release
    still deploys exactly the tagged commit
  - credential timing: the first tagged release may run while the old GitHub
    CLI credential is still on the VPS; the owner removes the VPS-local login
    immediately afterwards, and every later release runs without a GitHub
    credential on the VPS. Global OAuth revocation was still part of ID-42 at
    this point and was split out on 2026-10-15
  - local `make verify` is run by the owner; CI being green is separate evidence
- Changed by the owner on 2026-10-15, after the first release:
  - ID-42 requires the production VPS itself to hold no GitHub credential. That
    state is proven by the post-release checks above
  - revoking the global GitHub CLI OAuth authorization is useful security
    cleanup but would also sign the owner's development environments out. It is
    therefore deferred to ID-44 and no longer blocks ID-42 completion
- Settled during readiness, open to review in this PR:
  - the SSH principal is `root`, because the release tooling requires root; a
    separate account with one sudo rule would let the key do nothing less
  - the Actions log gets only a curated status, because the repository is public
  - the previous smoke poll is checked for readability, not for its exact
    ballot count
  - the tag is already in the manifest when it is promoted
  - release runs queue and never cancel one another
  - the release-prep summary starts from commit subjects
  - no GitHub Release page, which no repository contract requires
  - ID-42 moves to `Done` in a record PR after the first release, as #29 did
- Implementation choices, settled in the implementation PR and its review: file
  names; how the wrapper detaches the release from the SSH session and how the
  run learns its result; how the wrapper and the CLI share the deployment lock;
  the curated output format; whether the pinned host key is a secret or a
  variable; the release-prep pull request's description; and whether the
  release workflow waits for the dispatched sweep run
- No architectural or product questions remain open for ID-42.

---

## ID-8 Add IRV counting

Add Instant-runoff voting (IRV) as a second counting method, while keeping
Borda behavior intact. This item extends the existing results contract and
results UI to support selecting one method at a time. Method comparison remains
separate work in ID-10.

### API and shared contract

- [ ] `GET /polls/:id/results` accepts optional query parameter
      `method=BORDA|IRV`
- [ ] If `method` is omitted, the API returns Borda (`method: "BORDA"`)
- [ ] If `method` is present but unsupported, the API returns `400 Bad Request`
- [ ] `404 Not Found` for unknown poll remains unchanged for any method
- [ ] `PollResultsResponseDto` is a discriminated union with two variants:
      Borda (`method: "BORDA"`) and IRV (`method: "IRV"`)
- [ ] Borda variant stays behavior-compatible with ID-4 and ID-19
- [ ] IRV variant includes:
      `{ pollId, title, method: "IRV", winners, rounds, standings, totalBallots }`
- [ ] `standings` includes `{ optionId, text, placeFrom, placeTo }` for every
      poll option in non-zero-ballot results
- [ ] `standings` is sorted by `placeFrom` ascending; options that share a
      place range are ordered by `option.order` ascending, so the web renders
      the final ranked option list in response order without deriving it
      client-side
- [ ] `winners` matches exactly the standing group whose `placeFrom` is `1`
- [ ] Every IRV `rounds[]` entry includes:
      `{ round, tallies, eliminatedOptionIds }` and optional `tieBreak`
- [ ] Every IRV `tallies[]` entry includes `{ optionId, text, votes }`
- [ ] IRV `tieBreak` uses the rank-profile contract:
      `{ rule: "RANK_PROFILE", tiedOptionIds, comparisons, allActiveCandidatesStillTied }`
- [ ] In IRV `tieBreak`, `tiedOptionIds` is the original lowest first-choice
      tie-set for that round; each `comparisons[]` entry contains counts for the
      current tie-set before narrowing, and later entries contain only
      candidates that survived the previous comparison
- [ ] `comparisons[]` starts at rank 2. Rank 1 counts are the round's
      first-choice `tallies` and are not repeated in `comparisons[]`
- [ ] No new endpoint is added; ID-8 extends only
      `GET /polls/:id/results`
- [ ] `Poll.countingMethods` is not persisted or updated in ID-8; Prisma schema,
      poll create/get contracts and storage remain unchanged

### IRV full-ranking algorithm and tie-break behavior

- [ ] IRV builds a complete ranking bottom-up by repeated elimination
- [ ] A first-choice majority does **not** terminate counting; rounds continue
      until all places are assigned
- [ ] Each round uses only active candidates: eliminated candidates are removed
      from every ballot and ranks are compressed before counting
- [ ] For each round, find the candidate(s) with the minimum first-choice count
- [ ] If several are tied for the minimum, compare only that tie-set by
      second-place counts and keep only candidates with the minimum count
- [ ] If one candidate remains in the tie-set, eliminate that candidate
- [ ] If several remain, continue narrowing with third-place counts, then later
      ranks, each time comparing only tie-set survivors
- [ ] If candidates remain tied after every available rank and they are a subset
      of active candidates, eliminate all of them simultaneously
- [ ] If candidates remain tied after every available rank and they are all
      active candidates, none is eliminated; they share all remaining top places
      and are all winners
- [ ] Each eliminated group fills the lowest still-unassigned places; if `k`
      candidates are eliminated together, they share that `k`-place range
- [ ] `rounds` contains only rounds in which either an elimination decision is
      made or a terminal full tie among all remaining active candidates is
      recorded
- [ ] When the last elimination leaves exactly one candidate active, that
      candidate receives place 1 and becomes the sole winner directly from the
      resulting standings; no synthetic final round containing only that
      candidate is added to `rounds`
- [ ] Zero ballots is a separate case: the IRV response has `winners: []`,
      `rounds: []`, `standings: []` and `totalBallots: 0`; no places are
      assigned before at least one ballot exists

### Results page scope (no ID-10 absorption)

- [ ] `/poll/:id/results` exposes a minimal method selector for `BORDA` and
      `IRV`, showing one method at a time
- [ ] Method selection is reflected in the query parameter sent to
      `GET /polls/:id/results`; omitted method keeps BORDA default behavior
- [ ] Borda keeps the existing score table and score-breakdown flow from ID-19
- [ ] IRV shows a round-based explanation and standings from the API response
- [ ] Extend `/poll/:id/results/options/:optionId` for IRV: when `method=IRV`,
      navigation between Results and Details preserves `method=IRV`
- [ ] IRV Details explains the selected option's final place using that option's
      round/elimination/tie-break history
- [ ] If ID-20 ships before ID-8, ID-8 extends ID-20's method rules to IRV:
      Refresh and Retry on IRV Results and Details request `method=IRV`, and
      ID-8 adds ID-20's IRV web tests
- [ ] No side-by-side method comparison, no “different winner” surface and no
      multi-method analytics (these remain ID-10)

### Mobile (ID-6 contract)

These rules hold whether ID-6 ships before or after ID-8.

- [ ] From 320 CSS px upward, the results page with its method selector, for
      both methods, and the IRV Details view need no horizontal scrolling
      (`document.documentElement.scrollWidth <= W` at 320 and 375 px). The poll
      title and option text wrap, in the rounds and standings too, including a
      single unbroken token
- [ ] Every interactive control ID-8 adds — the method selector and the links
      between IRV Results and IRV Details — is at least 24×24 CSS px

### Required automated domain fixtures (must be tests)

- [ ] **Fixture 1 — rank-profile narrowing, full standings** is a required domain
      test.

```text
Ballots (10 total):
ACDB
ACDB
ADCB
ADCB
BACD
BADC
CADB
CBAD
DBCA
DBCA
```

```text
Round 1:
first: A=4 B=2 C=2 D=2
rank 2 for B/C/D: B=3 C=2 D=2
rank 3 for C/D: C=5 D=4
```

```text
Eliminate D -> place 4.
After compression, round 2: A=4 B=4 C=2.
Eliminate C -> place 3.
After C elimination, one ballot transfers to A and one to B.
Round 3: A=5 B=5.
A/B remain identical through the full profile.
```

```text
Expected:
A = places 1-2
B = places 1-2
C = place 3
D = place 4
winners = [A, B]
```

- [ ] **Fixture 2 — complete symmetric tie from the start** is a required domain
      test.

```text
ABC
BCA
CAB
```

```text
Profiles:
A=[1,1,1]
B=[1,1,1]
C=[1,1,1]
```

```text
Expected:
A = places 1-3
B = places 1-3
C = places 1-3
winners = [A, B, C]
```

- [ ] **Fixture 3 — zero first-choice candidate and rank compression** is a
      required domain test.

```text
CABD
DBAC
CBDA
BDCA
CDAB
```

```text
Round 1:
A=0 B=1 C=3 D=1
```

```text
Eliminate A -> place 4.
Compressed ballots:
CBD
DBC
CBD
BDC
CDB
```

```text
Round 2:
B=1 C=3 D=1
rank 2 for B/D: B=3 D=2
Eliminate D -> place 3.
```

```text
Round 3:
B=2 C=3
Eliminate B -> place 2; C remains -> place 1.
```

```text
Expected standings:
C=1
B=2
D=3
A=4
winners=[C]
```

- [ ] **Fixture 4 — unresolved tie among a subset** is a required domain test.

```text
ABCD
ACBD
DBCA
DCBA
BADC
CADB
```

```text
Round 1 first choices:
A=2 B=1 C=1 D=2
```

```text
B/C profiles:
B=[1,2,2,1]
C=[1,2,2,1]
```

```text
Tie-set at minimum first-choice count is B/C.
rank 2 for B/C: B=2 C=2
rank 3 for B/C: B=2 C=2
rank 4 for B/C: B=1 C=1
B/C remain indistinguishable through all ranks and are only a subset of active
candidates, so eliminate B and C simultaneously.
Round 2 (A vs D): A=4 D=2.
Eliminate D -> place 2; A remains -> place 1.
Expected final standings:
A=1
D=2
B=3-4
C=3-4
winners=[A]
```

- [ ] **Fixture 5 — three candidates eliminated simultaneously** is a required
      domain test.

```text
ABCDE
ABCDE
ACDBE
ACDBE
ADBCE
ADBCE
EBCDA
ECDBA
EDBCA
```

```text
Round 1:
A=6 E=3 B=0 C=0 D=0
```

```text
Profiles:
B=[0,3,3,3,0]
C=[0,3,3,3,0]
D=[0,3,3,3,0]
```

```text
Tie-set at minimum first-choice count is B/C/D.
rank 2 for B/C/D: B=3 C=3 D=3
rank 3 for B/C/D: B=3 C=3 D=3
rank 4 for B/C/D: B=3 C=3 D=3
rank 5 for B/C/D: B=0 C=0 D=0
B/C/D are indistinguishable but are only a subset of active candidates, so
eliminate all three simultaneously. They share places 3-5.
Remaining A/E: A=6 E=3.
Eliminate E -> place 2; A remains -> place 1.
```

```text
Expected:
A=1
E=2
B=3-5
C=3-5
D=3-5
winners=[A]
```

- [ ] **Fixture 6 — early absolute majority does not stop ranking** is a required
      domain test and regression.

```text
ABCD
ACDB
ADBC
ABDC
BCDA
CDBA
DCBA
```

```text
Round 1:
A=4 B=1 C=1 D=1
```

```text
A already has 4/7 first choices, but counting MUST continue because complete
standings are required.
rank 2 for B/C/D: B=2 C=3 D=2
B and D share the minimum rank-2 count (2), so C (rank-2 count 3) is narrowed
out; survivors: B/D.
rank 3 for B/D: B=3 D=3
rank 4 for B/D: B=1 D=1
B/D remain indistinguishable through all ranks and are only a subset of active
candidates, so eliminate B and D simultaneously.
```

```text
Expected:
A=1
C=2
B=3-4
D=3-4
winners=[A]
```

- [ ] **Fixture 7 — two-candidate complete tie** is a required domain test.

```text
AB
BA
```

```text
Expected:
A=1-2
B=1-2
winners=[A,B]
```

- [ ] **Fixture 8 — zero ballots** is a required domain test.

```text
Expected:
winners=[]
rounds=[]
standings=[]
totalBallots=0
```

### General domain-test invariants (required)

- [ ] For non-zero ballots, every poll option appears exactly once in
      `standings`
- [ ] For non-zero ballots, final place ranges cover the complete `1..N`
      ranking without gaps
- [ ] Candidates eliminated in one group receive the same place range
- [ ] `standings` is sorted by `placeFrom` ascending, then by `option.order`
      ascending
- [ ] `winners` exactly match the standing group whose `placeFrom` is `1`
- [ ] Every `rounds[]` entry either eliminates at least one candidate or
      records a terminal full tie among all active candidates; no round holds
      a single active candidate
- [ ] `rounds` and `standings` agree about elimination order
- [ ] Rank-profile comparison never includes a candidate removed from the
      current tie-set
- [ ] Eliminated candidates never participate in later rounds

### Verification

- [ ] **Domain tests (`irv.spec.ts`):** implement all 8 fixtures above as
      executable tests, plus the required invariants
- [ ] **API e2e (`polls.e2e-spec.ts`):** omitted `method` returns Borda variant
- [ ] **API e2e (`polls.e2e-spec.ts`):** `method=IRV` returns IRV variant with
      `rounds` and `standings`
- [ ] **API e2e (`polls.e2e-spec.ts`):** unsupported `method` returns `400`
- [ ] **Shared/web tests (Vitest):** method selector wiring, one-method-at-a-time
      rendering, method-preserving Results/Details navigation and
      method-specific behavior (Borda vs IRV)
- [ ] **Manual:** with `make web` + `make api`, switch methods on the results
      page, open Details from IRV and return back while preserving `method=IRV`,
      and verify Borda breakdown flow remains intact
- [ ] **Mobile:** Chromium mobile emulation at 320 and 375 px on a 10-option
      poll with ID-6's long-content options and enough ballots for several IRV
      rounds. The two Mobile checks pass; the PR includes 320 px screenshots of
      IRV Results and IRV Details

### Out of Scope (tracked separately)

- Condorcet method implementation and explanation → ID-9
- Side-by-side or “different winner” method comparison → ID-10
- Persisted per-poll counting-method configuration (`Poll.countingMethods`)
- Non-strict ballots (ties/partial/pairwise) → ID-14/ID-15 and future pairwise
  work

### Readiness Decisions

- Accepted by the owner: results-method selection is query-param based
  (`method=BORDA|IRV`), omitted method defaults to BORDA, unsupported methods
  return `400`, and the UI provides a minimal BORDA/IRV selector without doing
  ID-10
- Accepted by the owner: IRV builds complete standings by elimination rounds,
  does not stop on first-choice majority, and uses rank-profile tie-break as
  specified above
- Accepted by the owner: `rounds` records only elimination decisions and a
  terminal full tie, with no synthetic round for the sole remaining candidate;
  `standings` is sorted by `placeFrom`, then `option.order`; zero ballots
  assign no places (`winners`, `rounds` and `standings` are empty,
  `totalBallots: 0`)
- Accepted by the owner: the 8 fixtures above are mandatory domain tests for
  implementation
- Accepted by the owner: IRV Details extends
  `/poll/:id/results/options/:optionId` and preserves `method=IRV` when
  navigating between Results and Details
- Accepted by the owner: ID-8 does not persist or update `Poll.countingMethods`
- Accepted by the owner in the 2026-10-19 backlog sweep: the method selector and
  the IRV views follow the ID-6 mobile contract, like ID-19's Details view. How
  rounds and standings fit a narrow screen is an implementation choice, settled
  in the implementation PR and its review
- No architectural or product questions remain open for ID-8.

---

## ID-41 Fix backlog lint fixture

Test-only: `scripts/backlog-promotion.test.mjs` stops depending on particular
rows of the live `docs/backlog.md`. For any `docs/backlog.md` that passes the
live format test, the rest of the suite passes, so moving, cancelling or
rewording backlog rows never requires a test change. The backlog lint, backlog
promotion, the workflows and the backlog `Format` stay unchanged.

### Scope

- [ ] A fixed fixture backlog in the `docs/backlog.md` format (Legend, `Todo`,
      `Done` and `Cancelled` tables) is added, and a test asserts that
      `lintBacklog` reports no problems for it
- [ ] The lint test that injects a duplicate ID, an unknown Type, an
      overflowing Notes cell and misaligned cells builds its input from the
      fixture
- [ ] The promotion refusal for a backlog that already breaks its format
      builds that backlog from the fixture, and still asserts the
      `Todo line N: ID X is already used` reason, the recovery step and that
      nothing is written
- [ ] The duplicate-IDs-across-sections test and the append-to-`Todo` test use
      the fixture instead of the first or last live `Todo` row
- [ ] No test locates a row of the live `docs/backlog.md` by a literal ID or
      literal cell text
- [ ] `docs/backlog.md follows its fixed-width Format rules` and the
      triage-prompt width check still read the live file
- [ ] Everything the suite covers today stays covered, including the backlog
      tooling tests required by ID-39

### Verification

- [ ] **Manual, recorded in the PR:** on scratch copies of the repository,
      `node --test scripts/backlog-promotion.test.mjs` passes after each of
      these valid edits to `docs/backlog.md`, which fail it on `main` today
      (see Baseline): (1) `Todo` rows 8, 9, 13, 14 and 20 moved to `Done` and
      rows 11 and 12 to `Cancelled`, every remaining Notes cell rewritten,
      some States changed and the `Todo` order reversed; (2) only the Notes of
      ID-8 reworded; (3) every `Todo` row moved to `Done`, leaving `Todo` empty
- [ ] A broken `docs/backlog.md`, for example a misaligned row, still fails
      `docs/backlog.md follows its fixed-width Format rules`
- [ ] `make verify` passes

### Baseline on `main`

Verified during readiness at `c216504`, where all 42 tests pass, on scratch
copies of the repository:

- The lint test finds rows 6, 8, 9, 14 and 20 by ID and edits them by cell
  text: the Notes of ID-8 and the Type of ID-20 and ID-9. The format-refusal
  case replaces `| 6   |` with `| 14  |`
- Moving ID-6 or ID-14 to `Done` fails both tests; moving ID-8 or ID-20 fails
  the lint test with a `TypeError`; rewording only the Notes of ID-8 fails it
  with an assertion error
- Edit (1) above fails only these two tests. With an empty `Todo`, the
  duplicate-IDs-across-sections test (`todo.rows[0]`) and the append-to-`Todo`
  test fail as well
- `scripts/backlog-sweep.test.mjs` does not read the backlog. The release tests
  had the same coupling to `CHANGELOG.md`; since #96 they read
  `scripts/fixtures/release-changelog.v0.1.0.md`
- Rechecked at `6372beb` in the 2026-10-21 backlog sweep: #117 moved ID-6 to
  `Done` and repointed both tests from row 6 to row 13. The lint test copies
  row 14 over row 13, the format-refusal case replaces `| 13  |` with
  `| 14  |`, and edit (1) above still fails only these two tests

### Readiness Decisions

- Approach: a fixed fixture backlog instead of the live file, as the backlog
  row and #87 describe; #96 set the same pattern for the release tests
- Accepted by the owner: the full scope. Every test that needs particular rows
  uses the fixture, so the suite passes for any valid backlog, an empty `Todo`
  included. This goes beyond the two tests #87 names
- Accepted by the owner: ID-41 keeps its `Todo` position. If ID-6, ID-20 or
  ID-8 moves to `Done` before ID-41 lands, that pull request repoints the
  pinned rows, as #86 did for ID-19
- Implementation choices, settled in the implementation PR and its review: the
  fixture's location and form (a file under `scripts/fixtures/`, as in #96, or
  inline in the test), its rows (clearly synthetic titles; the live column
  widths and Legend values), and whether assertions match the exact problem
  list
- Documentation: none affected. The backlog `Format` section still names
  `scripts/backlog-promotion.test.mjs` as the check of the live backlog
- No architectural or product questions remain open for ID-41.

---

## ID-30 Drop the scaffold endpoint

API cleanup: remove the Nest scaffold `GET /api/v1`, which answers
`Hello World!`. The exact `/api/v1` path stays part of the API's namespace, so
Caddy is unchanged, and with no root endpoint it answers like any unknown API
path: with the standard NestJS `404` error. Liveness, the product endpoints and
the shared package stay unchanged.

### Scope

- [ ] `AppController`, `AppService` and their unit test
      `app.controller.spec.ts` are deleted, and nothing replaces them
- [ ] `AppModule` registers no root controller or provider and keeps the
      `OnModuleDestroy` HTTP drain from ID-35 unchanged
- [ ] `GET /api/v1` and `GET /api/v1/` return `404` with the standard error
      shape (`statusCode: 404`, `error: "Not Found"`), like any unknown path
      under the prefix
- [ ] `GET /api/v1/health`, the four product endpoints, `packages/shared` and
      the web client are unchanged
- [ ] `deploy/Caddyfile.rank-vote` is unchanged: Caddy still routes the exact
      `/api/v1` path and all descendants to the API, as ID-29 requires. No
      owner-operated production step is added; the change reaches production
      with the next ordinary release
- [ ] `probe.smoke()` in `scripts/production/probe.py` gets no assertion about
      `GET /api/v1`. `make prod-rollback` runs it from the current tooling
      against the previous release's images, so a rollback to a release that
      still serves the scaffold, such as `v0.2.0`, still verifies
- [ ] `docs/09-api-design.md` and `apps/api/README.md` no longer describe the
      scaffold. The API design states that the `/api/v1` prefix has no root
      endpoint and that the path returns the standard `404`

### Verification

- [ ] **API e2e:** `test/app.e2e-spec.ts` replaces the test that keeps the
      scaffold with one asserting the standard `404` from `GET /api/v1`; the
      liveness test stays
- [ ] **API e2e:** `test/app.e2e-spec.ts` also asserts the standard NestJS
      `404` from `GET /api/v1/`, the prefix with a trailing slash
- [ ] **API e2e:** in `test/rate-limit.e2e-spec.ts`, the check of routes that
      are not rate-limited expects `404` from `GET /api/v1` once the write
      buckets are exhausted, instead of the scaffold's `200`; a `429` fails it
- [ ] **Production smoke:** the exact-prefix check in
      `scripts/production/container_smoke.py` expects the API's JSON `404`
      instead of `200`. It still fails when Caddy sends the exact path to web,
      whose SPA fallback answers `200` with `index.html`
- [ ] `make verify`, `make prod-check` and `make prod-smoke` pass, as required
      for a production tooling change; CI `checks` and `containers` are green
- [ ] **Manual:** against `make api`, `GET /api/v1` returns `404` with the JSON
      error, `GET /api/v1/health` returns `{"status":"ok"}`, and creating a
      poll, submitting a ballot and reading its results still work

### Baseline on `main`

Verified during readiness at `db86f5a`:

- `AppController` and `AppService` answer `GET /api/v1` with `Hello World!`.
  `app.controller.spec.ts` and `test/app.e2e-spec.ts` cover it, and
  `test/rate-limit.e2e-spec.ts` expects its `200` among the routes that are not
  rate-limited
- `scripts/production/container_smoke.py` requires `200` from the exact
  `/api/v1` path through Caddy ("Exact API prefix not routed")
- Nothing else calls the root. Both Compose API healthchecks and
  `test/shutdown.e2e-spec.ts` use `/api/v1/health`; `make container-smoke`,
  `make seed`, the web client and `probe.smoke()` call only `/health` and
  `/polls` paths
- With the installed NestJS 11.1.22, an application with the `api/v1` global
  prefix and no root controller answers `GET /api/v1` and `GET /api/v1/` with
  `404`, `application/json` and
  `{"message":"Cannot GET /api/v1","error":"Not Found","statusCode":404}`,
  checked in a throwaway process

### Out of Scope (tracked separately)

- An OpenAPI specification of the API → ID-22
- A deliberate root response at `/api/v1` stays out of ID-30 as the option not
  chosen (see Readiness Decisions) and has no backlog item

### Readiness Decisions

- Accepted by the owner: the exact `/api/v1` path keeps reaching the API and,
  with no root endpoint, answers with the standard `404`, like any unknown API
  path. Caddy keeps routing by prefix, independent of the API's routes, and
  every path under the prefix gets the API's JSON errors
- Not chosen: narrowing the Caddy route to `/api/v1/*`, which would send the
  exact path to the SPA (`200` with HTML), make `/api/v1` and `/api/v1/` behave
  differently and need an owner-operated edit of the live Caddyfile; and a
  deliberate root response, a new public contract with no consumer
- Implementation choices, settled in the implementation PR and its review: how
  the tests assert the `404` (status alone or the error body), test names, and
  the wording of the API design and README updates
- Documentation: the Done-item criteria of ID-27, ID-29 and ID-31 that mention
  the scaffold stay unchanged as historical records. Feature pull requests do
  not edit `CHANGELOG.md`; Prepare release drafts it (`docs/07-process.md`)
- No architectural or product questions remain open for ID-30.

---

## ID-43 Guard prod-deploy same SHA

Production tooling fix from Issue #92. A manual `make prod-deploy` of the SHA
that `current.env` already records redeploys that release without losing the
rollback target: `previous.env` keeps naming the release before it, and
`current.env` keeps its release tag. Deploys of any other SHA, the
tag-triggered release (ID-42), `make prod-rollback` and the `tag` command stay
unchanged. The change reaches the VPS with the next ordinary release.

### Scope

- [ ] When `RELEASE_SHA` equals the `RELEASE_SHA` of `current.env`,
      `make prod-deploy` redeploys that release through the existing
      `release.deploy` sequence and its confirmations: images checked (reused
      when they exist), web and API stopped, one migration, API then web
      started, internal and public verification, promotion
- [ ] Such a redeploy never writes `previous.env`: it stays byte-identical, or
      absent if there was none, whether the redeploy succeeds or fails
- [ ] A successful redeploy promotes the release with the `RELEASE_TAG` that
      `current.env` held, an empty one included, and with the new
      `DEPLOYED_AT`, `SMOKE_POLL_ID` and image identity of this run, as any
      verified deployment records them
- [ ] A failed redeploy leaves `current.env` byte-identical. As after any failed
      deployment, the release it names may now be stopped or running
      unverified (`docs/production.md`, section 4)
- [ ] Before `HOST VERIFIED` is asked, and before anything is stopped, built or
      written, `make prod-deploy` prints a notice that the release is already
      current, with its tag when it has one, and that `previous.env` stays the
      rollback target, naming its tag and SHA, or that no previous release
      exists
- [ ] A deploy of any other SHA behaves as today: `previous.env` receives the
      verified `current.env` before downtime, and the candidate is promoted
      with an empty `RELEASE_TAG` for the `tag` command to fill
- [ ] The tag-triggered `release` action, `make prod-rollback` and the `tag`
      command are unchanged; the `release` action still deploys nothing for
      the same tag and SHA (ID-42)
- [ ] `docs/production.md` describes the redeploy of the current SHA where
      section 4 lists the deployment steps and where section 7 explains
      `previous.env` and the rollback target

### Verification

Python unit tests in `scripts/production/test_production.py`, which `pnpm test`
runs, with the existing fakes:

- [ ] With `current.env` at a tagged SHA X and `previous.env` at P, a
      successful redeploy of X keeps `previous.env` byte-identical, promotes X
      with its tag and the new smoke poll in the usual stage order, and
      `rollback_target()` still returns P
- [ ] With no `previous.env`, a redeploy of X creates none
- [ ] A redeploy that fails at the build, migration or public-verification
      stage leaves both manifests byte-identical
- [ ] The notice is printed before `HOST VERIFIED` is asked, and names the tag
      and the rollback target, or says that no previous release exists
- [ ] The existing tests of a deploy of a new SHA, the manifest transitions and
      the tag-triggered release pass unchanged

Other checks:

- [ ] **Manual, recorded in the PR:** the reproduction from the Baseline, run on
      `main` and on the branch, shows `previous.env` overwritten and
      `RELEASE_TAG` emptied on `main`, and both preserved on the branch
- [ ] `make verify`, `make prod-check` and `make prod-smoke` pass, as required
      for a production tooling change; CI `checks` and `containers` are green

### Baseline on `main`

Verified during readiness at `40d28db`:

- `ReleaseState.prepare()` in `scripts/production/core.py` copies `current.env`
  to `previous.env` unconditionally, and `release.deploy` calls it after the
  images pass, before web and API stop. The manual `deploy` action passes no
  release tag, so `release.deploy` promotes the candidate with an empty
  `RELEASE_TAG`
- Reproduced with the real `release.deploy`, the fakes of `SequenceTests` and a
  temporary state directory holding `current.env` at a `v0.2.0` SHA and
  `previous.env` at a `v0.1.0` SHA: a deploy of the current SHA leaves
  `previous.env` with the `v0.2.0` manifest, `current.env` with an empty
  `RELEASE_TAG`, and `rollback_target()` pointing at the running release. A
  following `make prod-rollback` would restore the release that is already
  running, and a re-run of the `v0.2.0` release would be refused
  (`already current as an untagged release`) until the `tag` command restores
  the tag
- `check_source` deploys only the checked-out commit (`HEAD` must equal
  `RELEASE_SHA`), and the release wrapper leaves the production checkout
  detached at the released SHA. A manual `make prod-deploy` on the VPS that
  does not switch the checkout first is therefore a deploy of the current SHA
- The tag-triggered path is unaffected: `release_plan` returns `current` for the
  same tag and SHA, and `run_release` returns before `preflight` and
  `release.deploy`
- The "Tag-triggered releases" ADR in `docs/06-decisions.md` keeps
  `make prod-deploy` for the first deployment, host, firewall, Caddy,
  proxy-trust and infrastructure changes and break-glass recovery. Without a
  new commit, such a run can only use the current SHA
- `make prod-smoke` drives Compose directly and uses neither `ReleaseState`
  nor `release.deploy`, so the manifests are covered by the Python unit tests,
  as for ID-42
- ID-43 changes tooling, not production state. The ID-42 evidence records
  `current.env` at `v0.2.0` and `previous.env` at `v0.1.0`; if a manual deploy
  of the current SHA has run on the VPS since, `previous.env` already names
  `v0.2.0` until the next tagged release replaces it

### Out of Scope (tracked separately)

- A manual deploy of any other SHA, an older one included, keeps the behaviour
  that ID-42 preserved for the manual commands (ID-42, Unattended deployment);
  no change is planned

### Readiness Decisions

- Accepted by the owner on 2026-10-22: a manual `make prod-deploy` of the SHA
  that `current.env` records stays allowed. It redeploys that release without
  writing `previous.env`, keeps the `RELEASE_TAG` of `current.env`, and prints
  a notice before `HOST VERIFIED`. The manual path stays usable for what the
  ADR assigns to it, which without a new commit can only run on the current SHA
- Not chosen: the same redeploy behind an extra typed `REDEPLOY <sha>`
  confirmation, which would also stop an accidental redeploy (a short web and
  API restart with no loss of state) at the cost of one more prompt on a rarely
  used path; and refusing the deploy, which would leave no tool to recreate the
  running release and would need a new `main` commit before a host or firewall
  change could be re-checked
- Settled during readiness, open to review in this PR:
  - no production run is part of ID-43. As AGENTS.md requires for production
    tooling changes, the unit tests, `make prod-check` and `make prod-smoke`
    verify it, and ID-43 moves to `Done` in its implementation PR
  - the backlog Notes state the chosen behaviour instead of "Refuse or warn"
- Implementation choices, settled in the implementation PR and its review:
  where the same-SHA rule lives (`ReleaseState.prepare`, `release.deploy` or
  the CLI) and how the tag is carried over; the notice's wording; test names
  and structure; the wording of the `docs/production.md` updates
- Documentation: `docs/production.md` in the implementation PR. No ADR change:
  the "Tag-triggered releases" ADR already assigns these uses to the manual
  path. Feature pull requests do not edit `CHANGELOG.md`; Prepare release
  drafts it (`docs/07-process.md`)
- No architectural or product questions remain open for ID-43.

---

## ID-11 Add PWA support

Make the web app installable, on a phone's home screen or as a desktop app,
with a web app manifest, icons and page metadata, and no service worker. The
installed app opens the create page in its own window and, like the website,
needs the network. An interim name and icon replace the Vite scaffold's tab
title and favicon until ID-45 settles the branding, and a few links replace the
browser navigation that the app window lacks. No API, shared-package, storage,
Caddy or release-tooling change; it reaches production with the next ordinary
release.

### Scope

- [ ] `index.html` links a web app manifest: `name` and `short_name` are
      `Ranking Vote`, `start_url` and `scope` are `/`, `display` is
      `standalone`, the icons include 192×192 and 512×512 px PNGs, and
      `prefer_related_applications` is absent. This meets Chrome's
      installability criteria (see the Baseline)
- [ ] The icon is a new, simple interim icon, not the Vite logo. It also
      replaces the Vite favicon, and `index.html` links it as an
      `apple-touch-icon` for iOS, so the tab, the install dialog and the home
      screen show the same icon
- [ ] The tab title is `Ranking Vote` instead of `web`
- [ ] No service worker is registered and nothing is cached for offline use.
      Without network the installed app behaves like a browser tab: the
      browser's offline page, or the existing error and Retry states once a
      page has loaded

### Navigation in the app window

The window of an installed app has no address bar, Back or Reload; Android
keeps its system Back. These links keep the main flows reachable there:

- [ ] "Poll created" links to the new poll's vote page (`/poll/:id`) beside
      the share link
- [ ] The vote page and the results page link to `/` to create a new poll, in
      their loaded states, the zero-ballot results included
- [ ] Unchanged: Details links back to its results page, "Poll not found" links
      to `/`, and the share link with Copy, the vote-submitted banner and the
      redirect of an already-voted poll to its results stay as they are
- [ ] The new links follow the ID-6 contract: from 320 CSS px no page needs
      horizontal scrolling and each link is at least 24×24 CSS px; at 1280 px
      every page keeps its current structure

### Packaging and production

- [ ] The web image serves the manifest and its icons as files. Hashed
      `/assets/` stay immutable; the manifest and other unhashed files are not
      cached immutably, like `favicon.svg` today
- [ ] Caddy, both Compose files and the release tooling are unchanged. The root
      still serves `<div id="root"></div>` and its `/assets/` scripts, so the
      web healthcheck and `probe.smoke()` keep passing
- [ ] `probe.smoke()` gets no manifest or icon check: `make prod-rollback` runs
      it from the current tooling against the previous release's images, so a
      rollback to a release without a manifest, such as `v0.2.0`, still
      verifies

### Verification

- [ ] **Web tests (Vitest):** the manifest has the members above, every icon
      it lists exists as a PNG of its declared size, and `index.html` links the
      manifest and the `apple-touch-icon` and has the title `Ranking Vote`
- [ ] **Web tests (Vitest):** "Poll created" links to `/poll/:id`, and the
      loaded vote and results pages, with ballots and without, link to `/`
- [ ] **Container smoke:** `make container-smoke` follows the manifest link in
      the served `index.html` and requires `200` with JSON that names
      `Ranking Vote`, `200` with `Content-Type: image/png` for each icon it
      lists, and no immutable caching of the manifest. A missing manifest or
      icon, which nginx answers with `index.html`, fails it
- [ ] **Installability (Chromium, DevTools protocol):** in a non-incognito
      profile, `Page.getInstallabilityErrors` returns no errors at `/` of the
      production build (`make web` or `make stack-up`), and
      `Page.getAppManifest` reports no manifest errors. The same check on a
      build of `main` before the change returns `no-manifest`, which shows it
      can fail
- [ ] **Manual (`verify-app`):** against `make web` and `make api`, create a
      poll, open it from "Poll created", vote, and go from the results to `/`;
      the tab shows `Ranking Vote` and the new icon. With mobile emulation at
      320 CSS px, measured as in ID-6, the changed pages need no horizontal
      scrolling and the new links are at least 24×24
- [ ] **Evidence** in the PR description: the installability results, the icon
      at its sizes for the owner's approval, and screenshots of "Poll
      created", the vote page and the results page at 320 and 1280 px
- [ ] `make verify` and `make container-smoke` pass; CI `checks` and
      `containers` are green

Recommended, not required for Done: after the next release, a spot check on a
real Android phone with Chrome (install; the name and icon; the app opens `/`
in its own window; create, open, vote, results and a new poll) and on an iPhone
(Safari: Share → Add to Home Screen; the same loop). Installation needs HTTPS,
so a LAN preview over `http` cannot show it.

### Documentation

- [ ] `docs/06-decisions.md`, Mobile Strategy: the web app is installable
      without a service worker (ID-11), and why
- [ ] `docs/05-architecture.md` no longer lists PWA under Future Extensions
- [ ] `docs/08-known-limitations.md`, Mobile Support: installable, with no
      offline mode; on iOS the installed app keeps its storage apart from
      Safari's, so `voted_poll_ids` is not shared and one person can vote once
      in each
- [ ] `docs/03-ux-flow.md` shows the new links: open the created poll, and
      create a new poll from the vote and results pages
- [ ] `docs/11-testing-strategy.md`, Containerization: the smoke check covers
      the manifest and icons
- [ ] `apps/web/README.md` mentions the manifest and icons

### Out of Scope (tracked separately)

- Offline mode, a service worker, push notifications, background sync and
  other PWA capabilities such as a share target or app shortcuts — not
  planned; a future need starts as a new Issue
- An in-app install button or install instructions — not planned; browsers'
  own install UI only
- The final name, logo, favicon and colours → ID-45, which may replace the
  interim ones
- Refreshing results without the browser's Reload → ID-20
- A native mobile app — deferred by `docs/06-decisions.md` (Mobile Strategy)
- Duplicate-vote protection shared by Safari and the installed app on iOS: the
  platform keeps their storage apart, and server-side protection is on the
  Post-MVP list below
- Unrelated cleanup elsewhere in `apps/web`, such as the unused scaffold files

### Baseline on `main`

Verified during readiness at `1a4e44a`:

- `apps/web` has no manifest, service worker or PNG icon. `index.html` sets the
  tab title `web` and links the Vite logo as `favicon.svg`; `public/icons.svg`
  is unused
- "Poll created" shows only the share link. The vote and results pages link
  nowhere outside their poll, Details links back to its results, and only
  "Poll not found" links to `/`
- nginx caches `/assets/` immutably and answers every other path with
  `no-cache` and the SPA fallback, so a missing root file returns `200` with
  `index.html`. The upstream nginx `mime.types` has no `.webmanifest` entry, so
  a manifest goes out as `application/octet-stream`. `make container-smoke`
  checks the root, a nested route, the cache policy and `favicon.svg`;
  `probe.smoke()` checks the root HTML, its `/assets/` scripts and the baked
  API URL
- `make prod-rollback` verifies a rollback with `probe.smoke()` from the
  current tooling against the previous release's images
- Production is served over HTTPS at `https://rankvote.avshukan.com`, with the
  API on the same origin under `/api/v1`. Installation needs HTTPS or
  `localhost`
- Chromium 149, `Page.getInstallabilityErrors` in a non-incognito profile: a
  production build of `main` returns `no-manifest`. The same build with a
  manifest (`name`, `start_url`, `scope`, `display: standalone`, 192 and 512 px
  PNG icons) served as `application/octet-stream`, and no service worker,
  returns no errors. A pass-through service worker changes nothing
- Chrome's [installability criteria](https://web.dev/articles/install-criteria):
  HTTPS; a manifest with `name` or `short_name`, 192 and 512 px icons,
  `start_url`, a `display` of `fullscreen`, `standalone`, `minimal-ui` or
  `window-controls-overlay`, and no `prefer_related_applications`; no service
  worker. Installing from the browser menu has needed no fetch handler since
  Chrome 108 on Android and 112 on desktop
- iOS 26 opens every site added to the Home Screen as a web app by default. An
  iOS home-screen web app keeps its storage apart from Safari's
  ([WebKit bug 181849](https://bugs.webkit.org/show_bug.cgi?id=181849))

### Readiness Decisions

- Accepted by the owner on 2026-10-22:
  - installation only: a manifest, icons and page metadata, with no service
    worker. Offline mode, push, background sync and other PWA capabilities are
    not planned
  - the interim name `Ranking Vote` and a new simple icon, which also replace
    the tab title `web` and the Vite favicon. The owner approves the icon in
    the implementation PR's review; ID-45 may replace both
  - `display: standalone`, with links from "Poll created" to the poll and from
    the vote and results pages to `/`, under the ID-6 contract
  - browsers' own install UI only
  - required verification: Vitest, `make container-smoke`, the Chromium
    installability check and the manual `verify-app` flow. A real-device check
    after a release is recommended, not required for Done
- Not chosen:
  - a service worker for an offline app shell: the main flows need the network
    anyway, users would see a release only after the worker updates, and a
    rollback to an image without the worker would leave it serving the cached
    newer app, because nginx answers its update check with `index.html`
  - offline data or a ballot queue, which would be a `Design` question: result
    freshness, rate limits and duplicate votes
  - waiting for ID-45's branding, which would block ID-11 behind ID-45's spike
  - `standalone` without the links, which leaves dead ends, and `minimal-ui`,
    which Safari does not support
  - an in-app install button, which only Chromium could show
- Settled during readiness, open to review in this PR:
  - the separate iOS storage stays within the soft duplicate-vote protection
    accepted in `docs/06-decisions.md`; it is documented, not solved
  - `probe.smoke()` gets no manifest check, so rollbacks keep verifying
- Implementation choices, settled in the implementation PR and its review: a
  static manifest with no new dependency, its file name and further members;
  how the icon is drawn and rasterised, and further icons such as a maskable
  one; the colours, taken from the current UI; whether nginx maps
  `.webmanifest` to `application/manifest+json`; the links' wording and
  placement; how the smoke script reads the manifest; test names and
  structure; the documentation wording
- Documentation: as listed above. Feature pull requests do not edit
  `CHANGELOG.md`; Prepare release drafts it (`docs/07-process.md`)
- No architectural or product questions remain open for ID-11.

---

## ID-24 `pnpm dev` orphans the API

Developer tooling fix. Stopping the API's watch-mode dev server must not leave
`node dist/main` running on the API port. Readiness corrected the trigger: a
Ctrl+C in a terminal stops everything, and the app is left behind when the stop
signal reaches only the top process, as `kill <pid>` or a tool that signals a
single process does. The fix upgrades `@nestjs/cli` within major 11 to the
upstream release that forwards the signal to the app, guarded by a regression
test. The API's code is unchanged; the same CLI also runs `nest build` for the
API image, so the container checks apply.

### Scope

- [ ] `@nestjs/cli` in `apps/api` is upgraded within major 11 to a release
      whose `nest start` forwards `SIGINT` and `SIGTERM` to the app and exits
      after it: 11.0.22 or later, the latest 11.x when implemented (11.0.24 at
      readiness). The specifier's floor excludes 11.0.21 and older
- [ ] `SIGINT` or `SIGTERM` sent only to the top process of `make api`
      (`pnpm --filter @rank-vote/api dev`) or of root `pnpm dev` stops
      `node dist/main` within seconds; no process of the API's tree keeps
      running, and the API port is free
- [ ] Ctrl+C in a terminal still stops `make api` and root `pnpm dev`
      completely
- [ ] `apps/api/src` is unchanged. A forwarded `SIGTERM` now reaches the app,
      which shuts down as ID-35 specifies

### Verification

- [ ] **Automated (`node:test`, run by `pnpm test`):** a test under `scripts/`
      starts `pnpm --filter @rank-vote/api dev` on a free port with a dummy
      `DATABASE_URL`, waits until the port accepts connections, sends `SIGTERM`
      to the top process only, and requires the app process to exit and the
      port to be free within a deadline. A second case does the same with
      `SIGINT`. The test stops its whole process tree even when an assertion
      fails
- [ ] **The test catches the defect:** run before the upgrade, with 11.0.21, it
      fails on the surviving app; the output is recorded in the PR
- [ ] **Manual, recorded in the PR:** in a terminal, Ctrl+C stops `make api`
      and root `pnpm dev` completely, and `kill -TERM` of root `pnpm dev`'s top
      process leaves no `node dist/main`:
      `lsof -nP -iTCP:3000 -sTCP:LISTEN` prints nothing
- [ ] `make verify` passes; CI `checks` and `containers` are green

### Documentation

- [ ] `docs/11-testing-strategy.md`, Repository Tooling: the dev-server stop
      test, and that it guards an upstream fix that was reverted once before

### Out of Scope (tracked separately)

- A sibling killed by a signal under root `pnpm dev` (`kill -9`, the OOM
  killer): pnpm exits at once without stopping its other children, so no
  signal reaches the CLI. `make down` (README, Stopping and Restarting) frees
  the ports; no change is planned
- A stop signal that lands during a watch-mode restart: in the 11.0.24 code the
  restart path can start a new app after the signal. Derived from the code, not
  reproduced; `make down` recovers; no change is planned

### Baseline on `main`

Verified during readiness at `bb2b436`, on macOS with Node 22.22.2, pnpm 11.11.0
and `@nestjs/cli` 11.0.21 — the pnpm and CLI versions of 2026-08-20, when ID-24
was filed:

- `make api` runs `pnpm --filter @rank-vote/api dev`, which is
  `nest start --watch`; root `pnpm dev` runs every package's `dev` in parallel.
  pnpm starts the CLI without a shell in between, the CLI starts
  `node --enable-source-maps dist/main`, and all of them share the job's
  process group
- Reproduced under a pseudo-terminal whose session leader outlives the job, as
  an interactive shell does:
  - Ctrl+C sends `SIGINT` to the whole foreground group and stops `make api`
    and root `pnpm dev` completely. The original note, "Ctrl+C leaves
    `node dist/main` on 3000", did not reproduce
  - `SIGINT` or `SIGTERM` to the top process only — root `pnpm dev`, the pnpm
    of `make api`, or a bare `nest start --watch` — leaves `node dist/main`
    reparented to PID 1 and listening on port 3000. The report that filed
    ID-24 describes the next run failing with `EADDRINUSE`
  - the cause: the 11.0.21 CLI kills the app only from `process.on('exit')`,
    which Node skips when an unhandled signal ends the process, and pnpm
    passes a signal on to its direct children only
  - under root `pnpm dev`, `kill -9` of vite makes pnpm exit at once and leaves
    the CLI, the shared package's `tsc --watch` and `node dist/main` running. A
    plain `kill` of vite (exit 143) makes pnpm stop every child, as README and
    `verify-app` describe
  - Claude Code's `TaskStop` on a background
    `pnpm --filter @rank-vote/api dev` stops the whole process group and
    leaves nothing behind
  - `make down` stops only the listeners: the pnpm and the CLI of a live
    `make api` keep running
- A pseudo-terminal harness in which pnpm itself leads the session hides the
  orphan: its exit sends `SIGHUP` to the whole foreground group. A process
  spawned with `detached: true` has no controlling terminal, so a `node:test`
  harness is not affected
- Upstream, nestjs/nest-cli#3422 (merged 2026-05-01, released in 11.0.22) makes
  `nest start` forward `SIGINT` and `SIGTERM` to the app and exit after it. An
  earlier version of the fix (nestjs/nest-cli#3313, nestjs/nest-cli#3338) was
  reverted in 11.0.20 and 11.0.21. Between 11.0.21 and 11.0.24 the CLI's direct
  dependencies change only `@angular-devkit/*` 19.2.24 → 19.2.27 and `webpack`
  5.106.0 → 5.106.2
- A spike outside the repository ran the 11.0.24 CLI against `apps/api`. An
  external `nest` binary hands off to the project's own
  `node_modules/@nestjs/cli`, so the spike disabled that hand-off. `SIGTERM` or
  `SIGINT` to the top process, bare and under
  `pnpm --filter @rank-vote/api exec`, and Ctrl+C left nothing running and
  freed port 3000
- The API starts and listens with PostgreSQL stopped, so a test needs only a
  dummy `DATABASE_URL`

### Readiness Decisions

- Accepted by the owner on 2026-10-23:
  - ID-24 fixes the app left behind when the stop signal reaches only the top
    process of `make api` or root `pnpm dev`. The two cases under Out of Scope
    are excluded, with `make down` as their recovery and no follow-up Issue
  - the fix is the `@nestjs/cli` upgrade within major 11, guarded by the
    automated test in `pnpm test`, which adds an estimated 15 seconds to CI
    `checks`
- Not chosen:
  - a repository supervisor for root `pnpm dev` that stops every child when
    one dies: more code for a rare case
  - a repository wrapper around `nest start --watch` that stops the whole
    process group: independent of upstream and covering the restart case too,
    but code to maintain where an upstream fix exists
  - cancelling ID-24: Ctrl+C and `TaskStop` already stop cleanly and
    `make down` exists, but a surviving app keeps serving old code on port
    3000
  - `@nestjs/cli` 12, a major upgrade that ID-24 does not need
- Settled during readiness, open to review in this PR:
  - the backlog Notes state the verified trigger; Title and Level stay
  - the automated test covers the API's `dev` script, which root `pnpm dev`
    runs too. Root `pnpm dev` itself and Ctrl+C are manual checks, because root
    `pnpm dev` also starts the web dev server on port 5173
  - no README change: `make down` stays the documented recovery, and its
    wording still holds for the excluded cases
- Implementation choices, settled in the implementation PR and its review: the
  test's file name; how it finds the app process, for example by the PID in
  Nest's `[Nest] <pid>` log prefix; its deadlines; whether its build output is
  kept apart from `apps/api/dist`; the exact 11.x release and how the floor is
  written; the documentation wording
- Documentation: as listed above. No ADR: a patch-level upgrade of a
  development tool records no decision. Feature pull requests do not edit
  `CHANGELOG.md`; Prepare release drafts it (`docs/07-process.md`)
- No architectural or product questions remain open for ID-24.

---

## ID-46 Explain voting methods

Users do not know what Borda count, IRV and Condorcet mean (Issue #107). The
web app gets a help section at `/faq`: a table of contents and one short
article per counting method, including the methods the app does not offer yet.
The results, vote and create pages link to it. ID-19's breakdown explains one
option's Borda score; these articles explain the methods themselves. Web only:
no API, shared-package, storage, nginx or Caddy change.

### Routes and table of contents

- [ ] `/faq` is the table of contents. `/faq/` opens the same page
- [ ] Articles have flat addresses under the same root: `/faq/borda`,
      `/faq/irv` and `/faq/condorcet`. Later help articles join `/faq/<slug>`
      the same way; ID-46 adds only these three
- [ ] The table of contents groups the three articles under a "Voting methods"
      heading, each with its title, a one-line summary and a link to the
      article. It also links to `/` to create a poll
- [ ] Adding an article is one new entry in the list the table of contents and
      the routes are built from
- [ ] Public like the rest of the app: every address opens directly, with no
      poll, vote or prior page
- [ ] `/faq/<unknown>` shows the shared `NotFound` with article-specific copy,
      no Retry. `/faq/borda/extra` still reaches the generic not-found page
      (#18)

### Articles

- [ ] Each article shows its title, the explanation, a link to the English
      Wikipedia article ([Borda count](https://en.wikipedia.org/wiki/Borda_count),
      [Instant-runoff voting](https://en.wikipedia.org/wiki/Instant-runoff_voting),
      [Condorcet method](https://en.wikipedia.org/wiki/Condorcet_method)) that
      opens in a new tab, and a link to `/faq`
- [ ] Opened from a poll's results page, an article also links back to that
      results URL, query included. Opened directly, it links to `/faq`, from
      where `/` is one step away. No article is a dead end in an installed app
      window (ID-11)
- [ ] Copy is in English, like the rest of the UI
- [ ] Each article aims to fit one 375×667 CSS px screen, from its title to the
      Wikipedia link. A short example with ballots is included only if it fits.
      This is a target judged in review, not a failing check
- [ ] **Borda** matches the shipped rules (#4, `docs/glossary.md`): with `N`
      options, place `r` on a ballot is worth `N − r` points; points add up
      over all ballots; the highest total wins, and equal totals give several
      winners. It mentions that a score on the results page opens its
      breakdown (ID-19)
- [ ] **IRV** matches ID-8's accepted rules: each round eliminates the option
      with the fewest first choices, and its ballots move to their next choice;
      counting continues until every option has a place, so a majority does not
      stop it and does not change the winner; in a tie for fewest, the tied
      option with the fewest second places goes, then third places are
      compared, and so on; options still tied leave together, and if all
      remaining options stay tied they share the top place. It says that this
      differs from the Wikipedia article in counting to a full ranking and in
      its tie rules
- [ ] **Condorcet** explains the principle only: every pair of options is
      compared by how many voters rank one above the other; an option that
      beats every other option is the Condorcet winner; with some ballots no
      option does, for example when A beats B, B beats C and C beats A. It does
      not say how the app will choose a winner then; that is decided in ID-9

### Methods not available yet

- [ ] A method the app does not count yet carries a "Not available yet" label
      in the table of contents and on its article. At ID-46 these are IRV and
      Condorcet, unless ID-8 has shipped
- [ ] The label is derived, not hard-coded per article: the web maps each
      `method` of `PollResultsResponseDto` to its article, and an article with
      no results variant mapped to it carries the label. The map is typed over
      every variant of the union, so a new results variant without an article
      fails `pnpm typecheck`, and mapping it removes the label
- [ ] If ID-8 ships before ID-46, the IRV article has no label and IRV results
      link to `/faq/irv`. ID-8's criteria are unchanged either way

### Entry points

- [ ] **Results:** in their loaded states, the zero-ballot one included, the
      results page names the counting method of the response and links to its
      article. Today that is Borda count and `/faq/borda`. The winner badge,
      the score table and its breakdown links are unchanged
- [ ] **Vote:** the vote page links to the article of the default results
      method, Borda count (`/faq/borda`), beside the ranking instructions and
      outside the sortable list. Following the link does not discard a ranking
      in progress
- [ ] **Create:** the create page links to `/faq`
- [ ] The Details view (ID-19) and the not-found pages are unchanged
- [ ] The new links and pages follow the ID-6 contract: from 320 CSS px no page
      needs horizontal scrolling (`document.documentElement.scrollWidth <= W`
      at 320 and 375 px), article text wraps, and each link is at least 24×24
      CSS px. Touch drag on the vote page still starts after a press and hold

### Verification

- [ ] **Web tests (Vitest):** `App` routing for `/faq`, `/faq/`, each article,
      an unknown slug and `/faq/borda/extra`; the table of contents lists the
      three articles, and the label is on exactly the articles no results
      variant maps to, the same set on each article page. The expectation
      follows the variants that exist, not a fixed list: IRV and Condorcet
      while Borda is the only one, Condorcet alone once ID-8 has shipped. Each
      article has its Wikipedia link and its links back; the results page
      links to the article of its `method`, with ballots and without; the vote
      and create pages link as above; following the vote page's link keeps the
      ranking
- [ ] **Manual (`verify-app`):** against `make web` and `make api`: from the
      create page open `/faq` and an article; vote on a seeded poll and open
      the vote page's link without losing the ranking; on the results open the
      Borda article and return to the same results
- [ ] **Mobile:** Chromium mobile emulation at 320 and 375 px. The ID-6 checks
      pass on `/faq`, each article and the changed pages
- [ ] **Evidence** in the PR description: a 375×667 screenshot of each article
      and a 320 px screenshot of `/faq`
- [ ] `make verify` passes; CI `checks` is green

### Documentation

- [ ] `docs/03-ux-flow.md`: the FAQ links from the create, vote and results
      pages, and the help section at `/faq`
- [ ] `apps/web/README.md`: the FAQ routes and feature folder
- [ ] `docs/backlog.md` moves ID-46 to `Done`

### Out of Scope (tracked separately)

- Completing the Condorcet article with ID-9's rule for ballots without a
  Condorcet winner, and linking Condorcet results to it → ID-9. Its label goes
  with the mapping above
- Comparing methods or advice on which one to pick → ID-10
- Articles for Schulze, Ranked Pairs or the future ballot formats (ID-14,
  ID-15) — written with those items, if they are planned
- Other help articles, such as anonymity or changing a vote — each starts as a
  new Issue
- A page shell, global navigation or FAQ search, and the visual design → ID-45
- Translations — not planned; the UI is English only

### Baseline on `main`

Verified during readiness at `04fcb68`:

- The UI never names the counting method. The results page shows the winner,
  the score table, score links to the Details view and the ballot count; the
  vote page has one line of ranking instructions; nothing links to an
  explanation
- Routes: `/`, `/poll/:id`, `/poll/:id/results`,
  `/poll/:id/results/options/:optionId` and the `*` catch-all. There is no page
  shell, header or footer
- `PollResultsResponseDto` is discriminated by `method` and has only the Borda
  variant. `CountingMethod` already lists `IRV`, `CONDORCET`, `SCHULZE` and
  `RANKED_PAIRS`, so the enum alone cannot tell which methods are counted
- nginx answers every path outside `/assets/` with the SPA fallback, so `/faq`
  routes need no server change
- ID-8 (`Ready`) counts IRV to a full ranking with rank-profile tie-breaks,
  unlike the stop-at-majority IRV of the Wikipedia article. ID-9 (`—`) has not
  decided what happens without a Condorcet winner
- The ballot form keeps its ranking in component state only, so leaving the
  vote page in the same tab discards a ranking in progress
- ID-11 (`Ready`) adds links to `/` on the vote and results pages; both items'
  links coexist there

### Readiness Decisions

- Accepted by the owner on 2026-10-23:
  - help articles live under one `/faq` root, with the table of contents at
    `/faq`, so later help articles can join it
  - flat article addresses `/faq/borda`, `/faq/irv` and `/faq/condorcet`
  - entry points: the results page links to the article of its method, the
    vote page to a method article, the create page to `/faq`
  - methods not available yet carry a "Not available yet" label; the Condorcet
    article explains the principle only, and ID-9 completes it
  - ID-8's criteria stay unchanged
  - a separate readiness pull request before implementation
- Not chosen:
  - one `/faq` page with a section per method: a long page on a phone, and
    anchors need scroll handling in a single-page app
  - a hint on the results page only: too short for the explanations, and no
    place for methods not available yet
  - nested addresses such as `/faq/methods/borda`: a subsection pays off only
    with its own page, and a later move is a client-side redirect away
  - no label on methods not available yet, which would send users looking for
    them in the app
  - a rule in ID-8's criteria for the IRV link and label
  - readiness and implementation in one pull request
- Settled during readiness, open to review in this PR:
  - the label and the results link come from one map typed over the results
    union, so a new variant cannot ship without its article and drops its
    label by mapping it. This closes the IRV gap without changing ID-8
  - a ballot is not tied to a method, so the vote page links to the default
    results method's article, Borda count
  - the vote page's link must not discard a ranking in progress
  - English copy and English Wikipedia articles; the IRV article states how it
    differs from Wikipedia's
  - one 375×667 screen per article is a target, not a hard limit
- Implementation choices, settled in the implementation PR and its review:
  component, file and folder names; how articles are stored and rendered; the
  copy, summaries and link wording; where the links sit on each page; how an
  article knows the results URL it was opened from; how the vote page's link
  keeps the ranking, for example by opening in a new tab; test names and
  structure; the documentation wording
- Documentation: as listed above. No ADR: static help pages in the existing
  router record no decision. Feature pull requests do not edit `CHANGELOG.md`;
  Prepare release drafts it (`docs/07-process.md`)
- No architectural or product questions remain open for ID-46.

---

## ID-25 Unify eslint and TS majors

Developer tooling refactor. Every workspace package — root, `apps/api`,
`apps/web` and `packages/shared` — lints with ESLint 10 and compiles with
TypeScript 6.0, and every dev tool that two or more packages declare takes its
version from one pnpm catalog that a test guards. Application code and compiled
output stay unchanged. The same compiler builds `packages/shared` and the API
inside the images, so the container checks apply. The decision is recorded in
`docs/06-decisions.md`, Toolchain Versions.

### Scope

- [ ] Root, `apps/api`, `apps/web` and `packages/shared` declare `eslint` and
      `@eslint/js` at major 10 and `typescript` at 6.0. `typescript-eslint`
      stays at major 8, whose releases support `typescript` below 6.1
- [ ] The lockfile resolves one version each of `eslint`, `@eslint/js`,
      `typescript` and `typescript-eslint` for all four packages, with one peer
      variant of `typescript-eslint`. A `typescript` 5.9 may remain only as a
      dependency of `@nestjs/cli` 11 itself, which compiles with the project's
      `typescript`
- [ ] `pnpm-workspace.yaml` has a default `catalog` holding the dev tools that
      two or more packages declare: `@eslint/js`, `eslint`, `typescript`,
      `typescript-eslint`, `prettier`, `@types/node`, `globals` and `vitest`.
      Every package declares them as `catalog:`, and a tool that one package
      uses keeps a plain specifier. `prettier`, `@types/node`, `globals` and
      `vitest` keep their current major. pnpm keeps its default catalog mode
- [ ] A `node:test` under `scripts/`, run by `pnpm test`, fails when the
      manifest of any workspace package, including one added later, declares a
      cataloged tool with a specifier other than `catalog:`. The failure names
      the package, the tool and the specifier
- [ ] TypeScript 6.0's deprecations and changed defaults are resolved in the
      `tsconfig` files, without `ignoreDeprecations`. The readiness probe needed
      four changes; see Baseline
- [ ] `apps/api` takes TypeScript 6.0's default `strict`; its explicit
      `noImplicitAny: false` and `strictBindCallApply: false` stay
- [ ] Unused lint packages are removed: root `@typescript-eslint/parser` and
      `@typescript-eslint/eslint-plugin`, which `typescript-eslint` provides,
      and `@eslint/eslintrc` in `apps/api`, which no config imports
- [ ] No lint rule is turned off, and no `eslint-disable`, `@ts-ignore` or
      `@ts-expect-error` is added to pass the checks. Source under `apps/*/src`
      and `packages/shared/src` is unchanged
- [ ] `apps/api/dist` and `packages/shared/dist`, built before and after, hold
      identical JavaScript

### Verification

- [ ] **Automated (`node:test`, run by `pnpm test`):** the catalog test checks
      the live manifests, and a case shows that a cataloged tool written with a
      plain specifier fails it
- [ ] **Manual, recorded in the PR:** `eslint --version` and `tsc --version`
      print the same ESLint 10 and TypeScript 6.0 releases in all four
      packages; `apps/api/dist` and `packages/shared/dist` (CommonJS and ESM)
      built on `main` and on the branch differ in no JavaScript file, comparing
      without source maps, declaration maps and build info;
      `pnpm --filter @rank-vote/shared add -D eslint@9` makes `pnpm test` fail
      on the catalog test; a plain `pnpm install` leaves `pnpm-lock.yaml`
      unchanged; `make api` compiles with no errors and the API answers, and
      root `pnpm dev` serves the web app
- [ ] `make verify` passes; CI `checks` and `containers` are green

### Documentation

- [ ] `docs/06-decisions.md`, Toolchain Versions: the status drops
      "implementation pending"
- [ ] `docs/05-architecture.md`, Monorepo: shared dev-tool versions live in the
      catalog in `pnpm-workspace.yaml`, guarded by the catalog test
- [ ] `docs/11-testing-strategy.md`, Repository Tooling: the catalog test

### Out of Scope (tracked separately)

- TypeScript 7, which `typescript-eslint`, `ts-jest` and `@nestjs/cli` cannot
  run yet — Issue #128
- NestJS 12 and `@nestjs/cli` 12, which need TypeScript 6 — Issue #129
- The API's `test:debug` script, which cannot start Jest on `main`, and the
  `ts-node` and `tsconfig-paths` that only it uses — Issue #130. ID-25 leaves
  them unchanged
- Dependencies outside the catalog keep their versions; `@nestjs/cli` moves
  within major 11 under ID-24

### Baseline on `main`

Verified during readiness at `ca04714`, on macOS with Node 22.22.2 and pnpm
11.11.0:

- `apps/web` resolves ESLint 10.4.0, `@eslint/js` 10.0.1 and TypeScript 6.0.3;
  root, `apps/api` and `packages/shared` resolve ESLint and `@eslint/js` 9.39.4
  and TypeScript 5.9.3. `typescript-eslint` 8.59.4 resolves in two peer
  variants. The split dates from the Phase 0 scaffold of 2026-05-22
- ESLint 9 reached end of life on 2026-08-06 (eslint.org/version-support), and
  npm marks 9.39.4 deprecated
- ID-25 was filed on 2026-08-20 for a local install that churned the lockfile.
  That no longer reproduces: a plain `pnpm install` on a fresh copy of `main`
  leaves `pnpm-lock.yaml` unchanged. CI installs with `--frozen-lockfile`
- `prettier` (3.8.3), `@types/node` (24.12.4), `globals` (17.6.0) and `vitest`
  (4.1.10) already resolve to one version wherever they are declared
- TypeScript 7.0.2 has been the npm `latest` since 2026-07-08. The newest
  `typescript-eslint`, 8.72.0, supports `typescript` below 6.1 and the newest
  `ts-jest`, 29.4.15, below 7. The TypeScript 7 package's main entry no longer
  exports the compiler API that `@nestjs/cli` calls
- `@nestjs/cli` 11 loads `typescript` from the project directory first, so
  `nest build` and `nest start` use the API's own TypeScript. The CLI's own
  `typescript` 5.9.3 serves its webpack type-checker, which the API does not
  use, and its schematics
- A probe on a copy of `main` outside the repository moved root, `apps/api` and
  `packages/shared` to ESLint 10.4.0, `@eslint/js` 10.0.1 and TypeScript 6.0.3:
  - the install raised no peer warnings and left one `eslint` and one
    `typescript-eslint` variant
  - `pnpm lint` reported nothing across 38 files in `apps/api` and 8 in
    `packages/shared`
  - TypeScript 6.0 needed four configuration changes and no source change. In
    `apps/api/tsconfig.json`: remove `baseUrl`, which is deprecated (TS5101)
    and which no import relies on; add `types: ["node", "jest"]`, because 6.0
    no longer loads every `@types` package; set `rootDir: "./"`, without which
    ts-jest fails every file with TS5011. In `packages/shared/tsconfig.json`:
    add `types: ["node"]` for `src/dist-exports.test.ts`
  - TypeScript 6.0 turns `strict` on by default, and `apps/api` passes it
    unchanged
  - typecheck, build and the unit tests passed: 49 in `apps/api`, 6 in
    `packages/shared`, 61 in `apps/web`. The four e2e suites, 35 tests,
    compiled through ts-jest but did not run, because the e2e runner resets the
    test database
  - `apps/api/dist` and `packages/shared/dist` held the same JavaScript as the
    TypeScript 5.9.3 build
  - `nest start --watch` with `@nestjs/cli` 11.0.21 compiled with no errors and
    served `GET /api/v1`
  - a catalog of the four lint packages passed `pnpm install`, a frozen
    reinstall and the images' filtered `--frozen-lockfile` install. In pnpm's
    default catalog mode, `pnpm add -D eslint` wrote `catalog:`, while
    `pnpm add -D eslint@9` and a hand-written `"eslint": "^9.0.0"` were
    accepted with warnings only. `catalogMode: strict` refused `eslint@9` but
    moved every newly added dependency into the catalog; `prefer` moved them
    too and accepted `eslint@9`
- ESLint 10 needs Node `^20.19.0 || ^22.13.0 || >=24`. CI takes the latest 22.x
  from `.nvmrc`, both images pin `node:22.23.2`, and `apps/web` already needs it
- ID-24 (`Ready`) also edits `apps/api/package.json` and the lockfile. The two
  items are independent; the one that lands second regenerates the lockfile

### Readiness Decisions

- Accepted by the owner on 2026-10-23:
  - every workspace package moves to ESLint 10 and TypeScript 6.0
  - every dev tool that two or more packages declare comes from one pnpm
    catalog: the eight listed under Scope
  - the catalog test guards it, with pnpm's default catalog mode
  - follow-up Issues #128 (TypeScript 7), #129 (NestJS 12) and #130
    (`test:debug`)
- Not chosen:
  - ESLint 10 alone, with TypeScript left split
  - cancelling ID-25: the lockfile churn is gone, but root, `apps/api` and
    `packages/shared` would stay on an end-of-life ESLint
  - moving `apps/web` back to ESLint 9 and TypeScript 5.9
  - aligning the specifiers by hand, or cataloging only the four lint packages
  - `catalogMode: strict`, first chosen and then dropped once the probe showed
    that it moves every newly added dependency into the catalog; moving every
    dependency into the catalog to suit it
  - TypeScript 7, which the toolchain cannot run (#128)
- Settled during readiness, open to review in this PR:
  - `apps/api` takes TypeScript 6.0's default `strict`
  - the three unused lint packages are removed
  - a `typescript` 5.9 under `@nestjs/cli` 11 stays; only `@nestjs/cli` 12
    drops it (#129)
  - the backlog Notes state the outcome; Title, Type and Level stay
- Implementation choices, settled in the implementation PR and its review: the
  exact 10.x and 6.0.x releases and the catalog ranges; the catalog test's file
  name, how it finds the workspace packages and reads `pnpm-workspace.yaml`,
  and its wording; where the `types` lists live; the documentation wording
- Documentation: as listed above, with the ADR added in this PR as
  "implementation pending". No `AGENTS.md` change: `catalog:` in each manifest
  points to the catalog, and the test names a violation. Feature pull requests
  do not edit `CHANGELOG.md`; Prepare release drafts it (`docs/07-process.md`)
- No architectural or product questions remain open for ID-25.

---

## ID-44 Revoke legacy GH CLI OAuth

Security cleanup from Issue #98. The goal is to invalidate the GitHub CLI token
that was exposed on the production VPS and that ID-42 removed locally without
invalidating. The owner decided on 2026-10-24 that only that one credential may
be affected; signing other environments out is not wanted. Whether that is
achievable turns on a fact only the owner can establish — whether the token's
value still exists anywhere — so the scope below branches, and what remains
undecided is named under _Open owner decision_. The owner performs every
action; an agent performs none. Repository-side this is documentation and a
record only: no app, API, shared-package, storage or production-tooling change,
and nothing reads or changes production.

### Step 1, owner-operated: is the token value available?

- [ ] The owner establishes whether the value of the VPS GitHub CLI token still
      exists in a place they control — a VPS backup or snapshot, the removed
      `~/.config/gh/hosts.yml`, or a password manager entry. The value is never
      written to the repository, to this file or to a pull request

### Step 2A, value available: revoke that credential alone

The agreed path, because it meets the owner's constraint exactly.

- [ ] The owner submits the value to the credential revocation API,
      `POST /credentials/revoke`, in a single unauthenticated request; an
      authenticated request is refused with `403`
- [ ] The GitHub CLI authorization itself stays in place. No environment is
      signed out, no re-login happens, and `COPILOT_GITHUB_TOKEN` is untouched,
      so the pre-check and replacement agreed for the account-wide path do not
      apply here
- [ ] Production is untouched: the VPS holds no GitHub credential (ID-42) and
      the release path reads public endpoints unauthenticated, so neither a
      tagged release nor any `make prod-*` command is affected

Evidence, required before `Done`. The first two are owner-supplied; an agent can
observe neither, and a criterion is checked only when the record cites it:

- [ ] The API's `202` response
- [ ] The account's security log entry for the revoked credential, with its
      timestamp
- [ ] `docs/production.md` section 9, step 7 no longer describes the global
      revocation as pending work and states that the exposed credential was
      revoked on its own; the "Tag-triggered releases" ADR keeps its historical
      record of the 2026-10-15 split
- [ ] The Definition of Done gate for a documentation-only change passes and CI
      is green on the record pull request

No repository check is needed on this path: no token the tooling uses changes.

### Step 2B, value gone

Out of scope until the owner decides; see _Open owner decision_. Nothing here
prescribes a path, and no criteria for one are written.

### Open owner decision

- If the value cannot be recovered, the only remaining lever is revoking the
  account-wide GitHub CLI authorization, which signs every environment out —
  the outcome the owner excluded on 2026-10-24. The choice is then between
  accepting that disruption at a moment of the owner's choosing and accepting
  the residual risk of a live token carrying `repo` and `workflow`. Readiness
  cannot settle this, which is why ID-44 is `Design` rather than `Ready`;
  rerun readiness once it is decided
- The criteria the owner approved on 2026-10-24 for the account-wide path — a
  re-login with gh's default scopes, the `COPILOT_GITHUB_TOKEN` check with
  replacement if needed, and the four evidence items — stay agreed for that
  path and are kept in _Readiness Decisions_ below. They are not restated as
  criteria, because that path is not the chosen one

### Baseline on `main`

Verified during readiness at `74fad19`:

- `gh auth logout --help` (gh 2.45.0) states that the authentication
  configuration is removed only locally and that the command does not
  invalidate authentication tokens. The VPS login that ID-42 removed with
  `gh auth logout` therefore still has a valid token, with the `repo` and
  `workflow` scopes that the "Tag-triggered releases" ADR describes as enough
  to push to every repository of the owner and to approve a pending production
  deployment
- Revoking only that token is mechanically possible but needs its value. Since
  2026-03-26 the credential revocation API (`POST /credentials/revoke`) accepts
  OAuth app access tokens (`gho_`), takes credential values in the body, must
  be called unauthenticated, and logs the revocation in the owner's security
  log. ID-42 removed the VPS login with `gh auth logout`, which deletes the
  local store, and its evidence records no token value, as it should not. The
  Authorized OAuth Apps page itself offers one revocation per app, with no
  per-device option
- `gh auth login` requests `repo`, `read:org` and `gist`; gh 2.45.0 calls these
  "the minimum set of scopes", which "cannot be removed". `workflow` is not part
  of it, and gh asks for it only to write workflow files, pointing at
  `gh auth refresh -s workflow`. Creating a workflow dispatch needs `repo`, not
  `workflow`, and the `workflow` scope grants "the ability to add and update
  GitHub Actions workflow files"
- This development environment is signed in as `avshukan` with a `gho_` token
  carrying `gist`, `read:org`, `repo` and `workflow`, stored in
  `~/.config/gh/hosts.yml`. Its `workflow` scope is above gh's minimum and was
  added by an explicit refresh; nothing in the repository's `gh` tooling needs
  it. `gh aw compile` changes `.lock.yml` workflow files, but pushing them here
  goes over SSH, which uses no token
- Repository tooling that needs `gh`: `make prune-merged`, the sweep dispatch in
  `scripts/backlog-sweep.mjs` and `AGENTS.md`, `gh issue list` in the
  `backlog-sweep` skill, `gh pr checks` in `.claude/settings.json`,
  `gh pr view` in the release instructions of `scripts/release.mjs`, and
  `gh aw compile` with `gh extension install` in `AGENTS.md`
- Git itself is unaffected in this environment: `origin` is an SSH remote, and
  the `gh auth git-credential` helper in the user's Git configuration applies
  to HTTPS remotes only
- The repository secret is `COPILOT_GITHUB_TOKEN`; Environment `production`
  holds `PRODUCTION_SSH_KEY`, an SSH key the revocation does not affect.
  Workflows otherwise use the Actions-provided `GITHUB_TOKEN`
- gh-aw v0.89.21, the version in the lock file header, requires
  `COPILOT_GITHUB_TOKEN` to be a fine-grained personal access token that can
  authenticate Copilot CLI, with `Copilot Requests` set to `Read` and the user
  account as resource owner, and states that the token must be a PAT rather
  than an OAuth user token. A fine-grained token is prefixed `github_pat_`, so
  a secret that meets the requirement cannot be a GitHub CLI token and the
  revocation cannot invalidate it
- In run `39941227375` the `Validate COPILOT_GITHUB_TOKEN secret` step passes
  and Copilot CLI then answers `429 Too Many Requests` on each of four
  attempts, which is a post-authentication response. The secret therefore
  authenticates. That run fails on the owner's exhausted Copilot request
  allowance, not on anything this item changes
- Nothing blocks the item: ID-42 is `Done`, and its Out of Scope, the
  "Tag-triggered releases" ADR and `docs/production.md` section 9 all name
  ID-44 as the deferred global revocation

### Out of Scope (tracked separately)

- Reviewing the account's other authorized OAuth apps, personal access tokens
  and SSH keys — not planned here; a separate Issue through triage if wanted
- Replacing the GitHub CLI OAuth login with a fine-grained personal access
  token — not chosen below; it would change how `gh` is used in every
  repository of the owner, so it needs its own item if wanted
- Removing the VPS-local credential and proving that the VPS holds no GitHub
  credential → ID-42, already `Done` and recorded

### Readiness Decisions

- Accepted by the owner on 2026-10-24, after the independent review of the
  readiness pull request: only the credential exposed on the VPS may be
  affected. Other environments are not to be signed out, so the narrow
  revocation of Step 2A is the chosen path wherever it is possible, and the
  account-wide revocation is no longer the default route
- Accepted by the owner on 2026-10-24, before that review, and still the agreed
  shape of the account-wide path if it is ever chosen:
  - after the revocation the development environments are re-authorized with
    `gh auth login` and the GitHub CLI default scopes. Those are `repo`,
    `read:org` and `gist`, which gh calls the minimum set and refuses to
    narrow; `repo` is what the tooling needs, `workflow` is neither granted by
    default nor required by it
  - replacing `COPILOT_GITHUB_TOKEN` is in scope if it holds a GitHub CLI OAuth
    token, so the revocation cannot silently break issue triage
  - wider credential hygiene for the account stays out of scope, as an Issue
    through triage if wanted
  - this readiness pull request records the criteria; the owner then revokes,
    and a second documentation-only pull request records the evidence and moves
    ID-44 to `Done`, as ID-29 and ID-40 were recorded
  - all four items of the evidence set recorded in this pull request's history,
    the security log entry included
- Corrected by the independent review of 2026-10-24, with the facts recorded in
  _Baseline on `main`_:
  - the earlier criterion requiring the `workflow` scope was wrong twice:
    `gh auth login` does not grant it, and a workflow dispatch needs `repo`.
    No scope is added to satisfy a criterion
  - a `gho_` prefix marks an OAuth app token of any app, so the earlier
    prefix-based check of `COPILOT_GITHUB_TOKEN` was not sound. gh-aw's
    documented requirement, plus the observed post-authentication `429`,
    settles that the secret is not a GitHub CLI token
  - the earlier claim that a single token cannot be revoked was wrong. The
    credential revocation API accepts `gho_` values; what is missing is the
    value, not a mechanism. This is what made Step 2A possible
- Not chosen: a fine-grained personal access token in `GH_TOKEN` in place of the
  OAuth login (Out of Scope above), and a re-login with narrowed scopes
- Settled during readiness, open to review in this PR:
  - the backlog Notes name the owner-operated shape instead of repeating
    "security cleanup"
  - the level stays `Medium`. The still-valid token makes `High` arguable, but a
    level change belongs to a backlog sweep, not to readiness
  - the sweep dispatch is not exercised as a repository check
  - the item is `Design`, not `Ready`: Step 2A is fully settled, but whether it
    applies depends on Step 1, and Step 2B has no agreed path
- Documentation: none in this pull request. The record pull request updates
  `docs/production.md` section 9, step 7, which currently describes the
  revocation as pending, and leaves the ADR's dated record of the 2026-10-15
  split as history. Feature pull requests do not edit `CHANGELOG.md`; Prepare
  release drafts it (`docs/07-process.md`)
- Open: the question under _Open owner decision_. No other architectural or
  product question remains open for ID-44.

---

## Not specified yet

Open backlog items with no criteria in this file. Listed so the gap is visible;
run `task-readiness` when one is picked up.

- **#33 Add production monitoring** — `Design`: dependency-aware readiness,
  external uptime checks with email alerts, and VPS disk and memory alerts.
  Which service checks production is open; see
  `docs/backlog/33-add-production-monitoring.md`. Error tracking is Issue #121;
  #27 supplies only process-level liveness.
- **#34 Share rate-limit state** — replace #31's per-process counters before the
  API runs more than one replica.
- Everything else at `Medium`/`Low` priority — criteria are written when the
  item is picked up, not in advance.

---

## Post-MVP (documented, not required now)

- Keyboard/a11y reorder for ballot
- Results caching
- Real-time result updates
- Percentage column in score table
- Server-side duplicate vote protection
