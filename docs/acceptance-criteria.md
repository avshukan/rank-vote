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
Compose and `scripts/production/`; see `docs/production.md` for evidence and the
operator sequence. Actual VPS/public deployment remains pending after review
and merge. Repository-only tests do not complete the runtime criteria below.

### Prerequisites

- [x] #35 is merged before implementation of #29 begins
- [x] Before the implementation PR for #29 merges, the `protect-main` repository
      ruleset requires both CI jobs, `checks` and `containers`; changing the
      GitHub repository setting is an owner action and does not need a backlog
      item
- [ ] The target commit is on `main`, both required CI jobs succeeded for that
      exact commit, and the production checkout is clean and detached at its
      full SHA before images are built
- [ ] A read-only VPS preflight through SSH alias `pet-projects-1` verifies that
      `165.22.91.190` is the intended Ubuntu host, records the installed Docker
      Engine / Compose / Caddy versions and available disk and memory, and
      inspects the current Caddy networks, published ports, firewall and IPv4 /
      IPv6 exposure before any production state is changed

### Host layout and stable identity

- [ ] Ranking Vote uses the stable checkout `/opt/apps/rank-vote`; release
      directories with one checkout per SHA are not introduced
- [ ] Production is defined in a separate repository-owned Compose file and is
      always invoked with the explicit project name `rank-vote-prod`; the local
      `docker-compose.yml` and its development defaults remain local tooling
- [ ] The single production entry point is
      `make prod-deploy RELEASE_SHA=<full-sha>` and refuses a short, missing,
      dirty, non-`main`, or failed-CI target; concurrent deploys are serialized
      or rejected
- [ ] Caddy remains a separately managed Compose project under
      `/opt/infrastructure/caddy`; Ranking Vote neither recreates nor stops it
- [ ] Root-only release manifests under
      `/opt/apps/rank-vote/deploy-state/current.env` and `previous.env` record
      the full commit SHA, application image tags and immutable image IDs,
      release tag when present, production URL and deployment timestamp
- [ ] The manifests are updated atomically only after successful public smoke
      verification; the current and previous application images remain present
      for recovery

### Public URL, reverse proxy and TLS

- [ ] The only public application origin is
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
- [ ] DNS resolves the production hostname directly to the VPS. Adding a CDN or
      another public proxy later requires a new proxy-trust decision before it
      is enabled
- [ ] The Caddy configuration is validated before a graceful reload, preserves
      every existing site, and is rolled back to its previous valid config if
      the new route cannot be loaded
- [ ] `VITE_API_URL=https://rankvote.avshukan.com/api/v1` is passed explicitly
      while building the production web image and is verified in the served
      bundle; changing it requires a new web image
- [ ] The API receives
      `CORS_ORIGIN=https://rankvote.avshukan.com`; no development origin or
      wildcard is accepted in production

### Docker networks and public exposure

- [ ] The web service joins the existing external Docker network `web`, where
      Caddy reaches only its project-unique alias `rank-vote-web`
- [ ] The API does not join `web`; it and Caddy are the only members of the
      stable external network `rank-vote-api-proxy`, where Caddy reaches the
      project-unique alias `rank-vote-api`
- [ ] PostgreSQL, migrate and API share a Ranking Vote network with the explicit
      stable name `rank-vote-prod-db` and `internal: true`; PostgreSQL joins no
      Caddy or shared application network
- [ ] PostgreSQL, API and web declare no host `ports`, use no host networking and
      are unreachable through the VPS public or loopback interfaces. Container
      ports `5432`, `3000` and `80` are reachable only by services granted the
      corresponding Docker-network membership
- [ ] VPS firewall and Docker networking expose only the already intended host
      services such as SSH and Caddy's public `80`/`443`; checks cover both IPv4
      and IPv6 and do not assume CORS provides a security boundary
- [ ] The production API runs exactly one container and one Node process. Any
      move to multiple API replicas waits for shared limiter state in #34

### Trusted client IP boundary

- [ ] The API receives `TRUSTED_PROXY_HOPS=1` only after inspection proves that
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
- [ ] API and the one-shot migrate service receive the same production
      `DATABASE_URL`, pointing to `rank_vote_app@postgres:5432/rank_vote_prod`
      with `schema=public`; passwords are generated, not repository defaults,
      and are percent-encoded correctly in the URL
- [ ] Production does not mount or run the development
      `init-test-database.sql`, does not create `rank_vote_test`, and does not
      use development/test reset or migration commands
- [ ] PostgreSQL data is mounted at `/var/lib/postgresql/data` from the external
      Docker volume `rank_vote_prod_postgres_data`. Initial setup creates that
      exact volume explicitly, and every deployment refuses to continue if it
      is absent instead of silently creating an empty replacement
- [ ] Recreating PostgreSQL with that external volume preserves the smoke poll,
      ballot and results; no deploy or rollback command invokes Compose with
      `--volumes` or otherwise deletes the production volume

### Secrets and configuration

- [ ] Production configuration lives outside the repository and Docker build
      context at `/etc/rank-vote/prod.env`; `/etc/rank-vote` is `root:root`
      mode `0700` and `prod.env` is `root:root` mode `0600`
- [ ] The production Compose invocation explicitly reads that file for
      interpolation and passes each service only the settings it needs; it does
      not load the entire file into every container
- [ ] At minimum the file supplies `DATABASE_URL`, `PORT=3000`,
      `CORS_ORIGIN=https://rankvote.avshukan.com` and
      `TRUSTED_PROXY_HOPS=1`, together with the production PostgreSQL bootstrap
      and application secrets required by the chosen initialization mechanism
- [ ] Production Compose fails before changing running services when any
      required value is absent or still equals a repository development
      credential/origin; no `${VAR:-development-default}` form is used
- [ ] `VITE_API_URL=https://rankvote.avshukan.com/api/v1` is an explicit,
      non-secret build input to the deploy command rather than a runtime setting
- [ ] Secrets never enter git, image layers, image metadata, release manifests,
      command-line arguments, CI output or deployment logs

### Build and release identity

- [ ] The implementation PR adds the production Compose/config validation,
      deploy and rollback entry points, tests and operator documentation, then
      stops at green CI for owner review without changing VPS state or marking
      #29 Done
- [ ] After the owner merges that PR, production deployment runs from its exact
      CI-green `main` SHA. A small post-deploy documentation PR records the
      deployed release and moves #29 to `Done`; the operational start of #28
      does not wait for that record PR to merge
- [ ] Images are built on the VPS, sequentially if host resources require it,
      from the clean checkout at `RELEASE_SHA`; no registry or CD pipeline is
      introduced
- [ ] Images are tagged `rank-vote-api:<full-sha>` and
      `rank-vote-web:<full-sha>`. Production Compose references these immutable
      release tags and never `latest` or the local `:local` tags
- [ ] The build finishes and both images pass their preflight checks before the
      running web/API containers are stopped; a build failure leaves the current
      release untouched
- [ ] The release manifest makes the deployed version answerable from the full
      source SHA plus immutable image IDs, even if rebuilding the same SHA later
      would resolve a changed upstream base image
- [ ] #29 adds the first changelog entry. After successful deployment and smoke
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
- [ ] The API image entrypoint never runs migrations. The migrate service uses
      the exact API image selected for the release, runs
      `prisma migrate deploy` once and has `restart: "no"`
- [ ] A failed migration stops the release with PostgreSQL left running and the
      application stopped. The deploy command preserves diagnostics and does not
      automatically retry, mark the migration resolved, reset/restore the
      database, or start either application version against uncertain schema
- [ ] The public route may briefly return an error while web/API are stopped;
      this bounded downtime is accepted for the MVP and zero-downtime deployment
      is not implied
- [ ] Production deploy and rollback commands never stop, recreate or otherwise
      take ownership of the existing Caddy service

### Restart and shutdown lifecycle

- [ ] PostgreSQL, API and web use `restart: unless-stopped`; migrate remains a
      completed one-shot service with `restart: "no"` and is not rerun merely
      because Docker or the VPS restarts
- [ ] API has an explicit stop grace period long enough for the #35 SIGTERM
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

- [ ] Internal health checks pass before public routing is considered ready;
      public `GET https://rankvote.avshukan.com/api/v1/health` returns
      `{ "status": "ok" }`
- [ ] The frontend loads over HTTPS with a valid certificate, no mixed content
      or browser console errors, and a direct request to
      `/poll/<known-id>/results` returns the SPA rather than a proxy 404
- [ ] Through the public origin, a uniquely named smoke poll is created, loaded,
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

- [ ] After #29 succeeds and `v0.1.0` identifies the verified deployment, the
      immediate next operational step is #28: create an offsite logical
      `pg_dump`, copy it outside both the VPS and DigitalOcean, restore it into a
      clean PostgreSQL instance, and verify the recorded smoke poll through the
      restored application data
- [ ] #29 does not claim production recovery is proven until #28 completes; the
      persistent Docker volume is explicitly treated as data storage, not backup

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

- Post-deployment runtime record and closure of the first deployment → #29
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

- [ ] Every width from 320 CSS px upward is supported. 320 px is inside the
      contract; narrower widths are not
- [ ] Covered pages and states: the create form (2 and 10 options), "Poll
      created" with its share link, the ballot (a few and 10 options), results
      (single winner, tied winners, zero ballots with the share link) and "Poll
      not found". Their short status and error messages follow the same rules
- [ ] At 1280 px each page keeps its current desktop structure — the centred
      `max-w-xl` column and the same arrangement

### Layout and long content

- [ ] No page needs horizontal scrolling or renders zoomed out
- [ ] No text or control is clipped, truncated or pushed off-screen
- [ ] Poll titles, option text and winner text wrap inside their column,
      including a single unbroken token (a pasted URL, a long compound word)
- [ ] Single-line text fields (question, options, share link) stay inside the
      viewport; longer text scrolls inside the field, and the share URL stays
      copyable with Copy
- [ ] The score table stays a table, with no horizontally scrolling container;
      the option column wraps, and position labels (`1-2`) and scores are never
      split across lines

### Touch

- [ ] Every interactive control has a bounding box of at least 24×24 CSS px
      (WCAG 2.2 AA). On `main` only `+ Add option` (83×20) falls short
- [ ] On touch, a normal swipe over a ballot row — option text included —
      scrolls the page and leaves the ranking unchanged
- [ ] On touch, drag & drop starts after a press and hold, then movement; the
      hold opens no text selection or context menu
- [ ] The ↑/↓ buttons remain the alternative way to reorder, and a tap on them
      never starts a drag. Mouse and keyboard dragging and the ballot
      instructions stay as they are on `main`

### Verification

Chromium with mobile and touch emulation (DevTools device mode or the DevTools
protocol) is the required path, against `make web` and `make api`. Layout cannot
be observed in jsdom, and `docs/11-testing-strategy.md` keeps browser end-to-end
and visual-regression suites out of the MVP.

- [ ] **Data:** the `make seed` polls plus one long-content poll — a title that
      ends in an unbroken URL of 60+ characters, and 10 options including a
      70+ character unbroken URL-like token and a 48-character single word
      (`Donaudampfschifffahrtsgesellschaftskapitänsmütze`), with the two
      longest options tied for first place
- [ ] **Measure** at 320 and 375 px on every covered page:
      `document.documentElement.scrollWidth <= W`, the emulated width, and
      every `button`, `a[href]` and `input` at least 24×24. Compare with `W`,
      not `window.innerWidth`: under mobile emulation an overflowing page widens
      the layout viewport (613 px at 320 on `main`), so that check always passes
- [ ] **Gestures** at 320 px on the long-content ballot: a swipe without holding
      scrolls and keeps the ranking; press, hold and move reorders; a tap on
      ↑/↓ moves one place. At 1280 px a mouse drag still reorders
- [ ] **Evidence** in the PR description: a short pass/fail summary,
      screenshots at 320 px of the long-content vote and results pages, and
      before/after screenshots at 1280 px of any page whose markup changed
- [ ] **Tests:** the existing Vitest suites stay green. The touch activation
      gets a component test if dnd-kit's sensors can be driven in jsdom;
      otherwise the PR says so and the gesture check is the evidence

Recommended, not required for Done: a quick spot check on a real iOS Safari and
Android Chrome phone (swipe over the ballot, press-and-hold drag, ↑/↓), since
Chromium emulation cannot show iOS long-press text selection.

### Documentation

- [ ] `docs/08-known-limitations.md` "Mobile Support" states the 320 CSS px
      minimum instead of "basic mobile responsiveness"
- [ ] `docs/implementation-plan.md` Phase 3 no longer points at ID-6 as pending

### Out of Scope (tracked separately)

- Widths below 320 CSS px — outside the contract
- Visual redesign, rebranding, a drag handle or a card layout for results — not
  planned
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

- [ ] The shared results contract is discriminated by `method`:
      `PollResultsResponseDto` is a union whose only member is
      `BordaResultsResponseDto`, typed `method: CountingMethod.BORDA`. Other
      methods add their own variants in their own items
- [ ] Every entry of the Borda variant's `scores` and `winners` carries
      `breakdown` as specified in `docs/09-api-design.md`: `N` rows for places
      `1..N` in ascending order, each `{ place, points, ballots, subtotal }`,
      places with `ballots: 0` included
- [ ] The entry type that carries `breakdown` belongs to the Borda variant. No
      method-neutral type carries Borda fields
- [ ] `points` is `N − place`, `ballots` counts the ballots that ranked the
      option at that place, `subtotal` is `points × ballots`. The API computes
      all three, so the web holds no Borda formula
- [ ] The subtotals add up to `score`, and each option's `ballots` add up to
      `totalBallots`
- [ ] Zero ballots: every row has `ballots: 0` and `subtotal: 0`
- [ ] On the wire `breakdown` is the only addition: `score`, the order of
      `scores`, `winners`, `totalBallots` and `method` are unchanged for any
      set of valid ballots. Entries for an option outside the poll stay
      ignored, in the breakdown as in the score
- [ ] No new endpoint

### Results table entry point

- [ ] In the score table, each row's Score value is a link to that option's
      Details view, `/poll/:id/results/options/:optionId`. No separate icon or
      button is added, and the table keeps its three columns
- [ ] Each score link's accessible name contains its score and the option text,
      so the links can be told apart outside their table row
- [ ] The winner badge, the tie labels and the zero-ballot state are unchanged.
      With no ballots there is no table, so there are no score links

### Details view

- [ ] Public like the results page: the URL opens directly, with no vote and no
      prior visit to the results page
- [ ] Shows the poll title, the option text, and a link back to
      `/poll/:id/results`
- [ ] A breakdown table with the columns Place, Points, Count and Subtotal, one
      row per place from first to last. Place reads as an ordinal (1st, 2nd,
      …). Rows with a count of 0 are shown. The values come from the API
      `breakdown` as they are
- [ ] Reached by click, tap or keyboard. Nothing depends on hover

### States and edge cases

- [ ] Unknown poll (API `404`): the shared `NotFound` with "Poll not found",
      no Retry, as on the results page
- [ ] An `optionId` that is not one of the poll's options: the shared
      `NotFound` with option-specific copy, no Retry
- [ ] Network error or 5xx: an error message with Retry
- [ ] Zero ballots: "No votes yet" replaces the breakdown table, the same as
      on the results page in #5. The back link stays
- [ ] `/poll/:id/results/extra` still renders the generic not-found page (#18)

### Mobile (ID-6 contract)

These rules hold whether ID-6 ships before or after ID-19.

- [ ] From 320 CSS px upward the Details view needs no horizontal scrolling
      (`document.documentElement.scrollWidth <= W` at 320 and 375 px). The
      breakdown stays a four-column table with no horizontally scrolling
      container. The poll title and the option text wrap, including a single
      unbroken token
- [ ] Every interactive control on the Details view, and every score link in
      the results table, is at least 24×24 CSS px

### Verification

- [ ] **Domain** (`borda.spec.ts`): breakdown rows for a multi-ballot fixture.
      Subtotals add up to the score, counts add up to the ballot count. Zero
      ballots give zero rows. Foreign-option entries are ignored
- [ ] **API e2e** (`polls.e2e-spec.ts`): the results response carries the
      breakdown in the zero-ballot and multi-ballot cases
- [ ] **Web** (Vitest): the score links and their targets, the breakdown rows,
      each state above, and `App` routing for the Details route and the #18
      over-run path
- [ ] **End-to-end** (`verify-app`, against `make web` and `make api`): on a
      seeded poll, clicking a score opens that option's breakdown. Its
      subtotals add up to the score in the table, and the back link returns
      to the results
- [ ] **Mobile:** Chromium mobile emulation at 320 and 375 px on a 10-option
      poll with ID-6's long-content options. The two Mobile checks pass; the PR
      includes a 320 px screenshot of the Details view

### Documentation

- [ ] `docs/09-api-design.md` drops its "not shipped yet" note for
      `breakdown`, and the contract matches the code
- [ ] `docs/03-ux-flow.md` Results step mentions the per-option breakdown
- [ ] `docs/backlog.md` moves ID-19 to `Done`

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
      the tracker is closed and was last closed at least 60 days ago, with a
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

- [ ] The `## #29 First Production Deploy` section gains a
      `### Completion evidence` block that records `v0.1.0`: tag, full SHA, CI
      run, the manifest fields, deployment time, smoke poll and the supplied
      checks
- [ ] A #29 criterion is checked only when the record cites its evidence, of
      one of three kinds: owner-supplied input, repository or GitHub history, or
      a check that `make prod-deploy` at `7021f31` performs automatically before
      it writes `current.env`. The third kind needs the owner-supplied manifest
      for that SHA, and the record names the function in `scripts/production/`
      that performs the check
- [ ] Criteria that depend on the operator's own observation (browser, port and
      proxy probes, firewall, IPv6, existing sites, reboot) are checked only from
      the owner's supplied results or explicit confirmation, never from the
      manifest alone
- [ ] Criteria still unchecked are named, grouped, in the Completion evidence
      block as having no recorded runtime evidence. Their boxes stay unchecked
      and their wording is unchanged
- [ ] The section's opening paragraph no longer says that the deployment is
      pending; it points to the Completion evidence. The criteria wording and the
      Readiness Decisions stay as written
- [ ] The record contains no secret: no database URL, password, `prod.env`
      value, private Caddy configuration or unredacted audit output
- [ ] ID-29's `Done` row stays unchanged

### Changelog

- [ ] `## Unreleased — first production release preparation (#29)` becomes
      `## v0.1.0 — 2026-09-19`, the tag date. The two content bullets stay; the
      "not deployed, no release tag" bullet is replaced by the deployed identity
      (`https://rankvote.avshukan.com`, full SHA) and the #28 recovery drill
- [ ] No `Unreleased` section is added, since nothing in the images has changed
      since the tag

### Stale documentation

Each passage stops describing the first deployment, `v0.1.0` or #29 as pending,
`Todo`, not live or awaiting a record PR, and states the completed state:

- [ ] `README.md`, Production operations
- [ ] `AGENTS.md`: the sentence "Repository preparation alone does not complete
      #29." goes; the owner-operated rule for host-changing `make prod-*`
      commands stays
- [ ] `docs/production.md`: the opening paragraph, the end of section 8, and
      "Repository evidence and pending AC" including its heading, which points
      to the #29 Completion evidence
- [ ] `docs/05-architecture.md`: "Production is not live yet."
- [ ] `docs/06-decisions.md`, "First production release on the shared VPS": its
      Status line and the "remain pending" sentence
- [ ] `docs/07-process.md`: the `v0.1.0` paragraph under Release, the #29 clause
      of the "CD does not exist yet" principle, "releases will be tagged
      manually once there is something to release", and the first-deployment
      paragraph after the principles
- [ ] `docs/08-known-limitations.md`: the opening of Operations
- [ ] `docs/09-api-design.md`, Base URL: "not a statement that the service is
      live yet"
- [ ] `docs/10-storage.md`: the sentence on production evidence and closure of
      #29
- [ ] `docs/implementation-plan.md`: the Phase 5 status
- [ ] `docs/acceptance-criteria.md`, #28 Out of Scope: the post-deployment record
      points to ID-40 instead of #29

### Verification

- [ ] Every hit of
      `grep -rnE "#29|ID-29|v0\.1\.0|pending|live yet" --include='*.md' .`
      outside `node_modules` and this section is reviewed in context: none
      describes the first deployment or #29 as still pending. A search for exact
      phrases misses wrapped lines, which is why each hit is read
- [ ] Every checked #29 box traces to a fact in the Completion evidence; the PR
      description summarizes which evidence kinds were used
- [ ] The Definition of Done gate passes and CI is green
- [ ] ID-40 moves to `Done` in its implementation PR

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

## Not specified yet

Open backlog items with no criteria in this file. Listed so the gap is visible;
run `task-readiness` when one is picked up.

- **#33 Add production monitoring** — dependency-aware readiness, external
  uptime monitoring, alerting and error tracking follow the first deployment;
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
