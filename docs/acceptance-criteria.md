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
lifecycle from #35. The readiness PR documents the contract only; the production
Compose, deploy tooling, Caddy change and deployment are implemented later in
the #29 PR.

### Prerequisites

- [ ] #35 is merged before implementation of #29 begins
- [ ] Before the implementation PR for #29 merges, the `protect-main` repository
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
      `https://rank-vote.avshukan.com`
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
- [ ] `VITE_API_URL=https://rank-vote.avshukan.com/api/v1` is passed explicitly
      while building the production web image and is verified in the served
      bundle; changing it requires a new web image
- [ ] The API receives
      `CORS_ORIGIN=https://rank-vote.avshukan.com`; no development origin or
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
      `CORS_ORIGIN=https://rank-vote.avshukan.com` and
      `TRUSTED_PROXY_HOPS=1`, together with the production PostgreSQL bootstrap
      and application secrets required by the chosen initialization mechanism
- [ ] Production Compose fails before changing running services when any
      required value is absent or still equals a repository development
      credential/origin; no `${VAR:-development-default}` form is used
- [ ] `VITE_API_URL=https://rank-vote.avshukan.com/api/v1` is an explicit,
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
      public `GET https://rank-vote.avshukan.com/api/v1/health` returns
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

- The production origin is `https://rank-vote.avshukan.com`; Caddy splits the
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

## Not specified yet

Open backlog items with no criteria in this file. Listed so the gap is visible;
run `task-readiness` when one is picked up.

- **#28 Manual offsite backup** — after #29, create a logical dump, copy it to
  the owner's local machine outside DigitalOcean, restore it into clean
  PostgreSQL and verify the application can use the restored database.
- **#32 Automate offsite backups** — after #28 proves recovery, choose the
  independent object-storage provider, schedule, retention, encryption,
  monitoring and restore-test cadence.
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
