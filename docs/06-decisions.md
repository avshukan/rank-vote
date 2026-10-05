# Decisions

## Repository

### Monorepo

Status:

- accepted

Reason:

- simpler MVP development
- shared documentation
- easier CI/CD
- easier type sharing
- easier future expansion

---

## Applications

Initial applications:

- apps/web
- apps/api

Possible future applications:

- apps/mobile

---

## Frontend

Initial stack:

- React
- TypeScript
- Vite
- Tailwind CSS

Reason:

- fast MVP development
- large ecosystem
- good AI tooling support
- Tailwind CSS: utility-first, no design system dependency, fast to iterate in MVP
- shadcn/ui and a full component library are deferred; plain Tailwind is sufficient for MVP

---

## Backend

Initial stack:

- Node.js
- TypeScript
- NestJS
- Prisma

Reason:

- existing experience
- shared language across frontend/backend
- good ecosystem
- NestJS provides structured architecture aligned with layered backend design
- Prisma provides type-safe database access and easy migrations

---

## Package Manager

### pnpm

Status:

- accepted

Reason:

- efficient disk usage via symlinked node_modules
- native monorepo workspace support (`pnpm workspaces`)
- faster installs than npm
- stricter dependency resolution (avoids phantom dependencies)

---

## Monorepo Tool

### pnpm Workspaces

Status:

- accepted

Reason:

- sufficient for MVP without extra tooling overhead
- native to pnpm; no additional dependency required
- Turborepo can be added later if build orchestration becomes a bottleneck

---

## Shared Package Build

### Dual CommonJS + ESM output from `packages/shared`

Status:

- accepted

Chosen:

- `packages/shared` compiles twice — CommonJS to `dist/`, ESM to `dist/esm/` —
  and its `exports` map routes `require` (the NestJS API) and `import` (Vite and
  the browser) to the matching half
- `dist/esm/package.json` carries `{"type":"module"}`, so Node reads that
  subtree as ESM rather than as CommonJS
- `packages/shared/src/dist-exports.test.ts` pins both halves down

Reason:

- Vite does not pre-bundle **linked** workspace packages, so a CommonJS-only
  `dist` reached the browser raw, every named import threw, and `#root` stayed
  empty under `pnpm dev` (backlog #21)
- the break was dev-server-only — `vite build` was always fine, because Rollup
  converts CommonJS itself — so neither the gate nor `make web` could catch it,
  which is why the guard is a test rather than the `verify-app` ritual
- the `require` condition still points at the artifacts that already existed,
  so the API resolves exactly what it resolved before

Rejected:

- `optimizeDeps.include` in `vite.config.ts` — a one-liner that does clear the
  blank page, but Vite then never re-optimizes the linked dep, so rebuilding
  `shared` in watch mode left the dev server serving **stale code with no
  warning** (measured: `MAX_OPTIONS` changed to `9` on disk while the server
  kept serving `10` across a full page reload). `pnpm dev` runs `shared` in
  watch mode precisely so its edits flow through, and silent staleness is a
  worse failure than the loud one it would replace
- a single ESM-only build — the API is CommonJS and `require`s the package

---

## Deployment

MVP deployment targets:

| App        | Platform                     | Notes                  |
| ---------- | ---------------------------- | ---------------------- |
| `apps/web` | Docker image (nginx, static) | separately scalable    |
| `apps/api` | Docker image (Node.js)       | separately scalable    |
| Database   | PostgreSQL container         | on the application VPS |

Notes:

- no Kubernetes, no Redis in MVP

### First production release on the shared VPS

Status:

- accepted for backlog #29; repository tooling implemented, deployment pending

Chosen:

- deploy from `/opt/apps/rank-vote` on the existing Ubuntu DigitalOcean VPS
  (`pet-projects-1`, `165.22.91.190`) with the fixed Compose project name
  `rank-vote-prod`
- keep the existing Caddy Compose project at `/opt/infrastructure/caddy` as the
  TLS terminator and public reverse proxy; it routes the `/api/v1` prefix to API
  and every other path to web for `https://rankvote.avshukan.com`
- connect web to Caddy through the existing external `web` network, API to Caddy
  through the dedicated external `rank-vote-api-proxy` network, and
  PostgreSQL/migrate/API through the internal `rank-vote-prod-db` network
- publish no Ranking Vote host ports and trust exactly one proxy hop only after
  the Caddy-only API boundary is verified; run exactly one API process
- store PostgreSQL in the explicitly named external volume
  `rank_vote_prod_postgres_data`; use database `rank_vote_prod` and one
  non-superuser owner/runtime/migration role, `rank_vote_app`
- keep production configuration in root-only `/etc/rank-vote/prod.env`, with
  explicit values and no development fallbacks
- build web/API images on the VPS from one validated full commit SHA and tag
  them with that SHA; record current and previous SHA, image tags and immutable
  image IDs for release identification and recovery
- accept brief downtime: build first, stop web/API, leave PostgreSQL running,
  apply migrations once, then start and verify one API plus web
- prepare an Unreleased changelog entry in the implementation PR; cut annotated
  tag `v0.1.0` only after the first public deployment passes smoke verification

Reason:

- one origin keeps the browser, CORS and TLS contracts small while the existing
  Caddy can route the API prefix independently from static web traffic
- separate proxy networks let Ranking Vote coexist with other Compose projects
  without making the trusted API reachable to every container on the shared
  `web` network
- a stable checkout, Compose identity and external named volume prevent a path
  or project-name change from silently selecting empty PostgreSQL storage
- building on the VPS avoids introducing a registry or CD pipeline for the
  first pet-project release, while the SHA plus immutable image IDs still make
  the running artifact identifiable
- stopping the old API before migration avoids requiring every schema change to
  remain compatible with two application versions; bounded downtime is
  acceptable at current scale

Consequences:

- the existing Caddy remains outside the Ranking Vote lifecycle and must be
  validated/reloaded without disrupting its other sites
- application rollback is allowed only when the previous image is compatible
  with the schema already applied; database rollback is never automatic
- #35 implements graceful `SIGTERM` handling and must merge before #29 starts; the
  `containers` CI job must be required by the `protect-main` ruleset before the
  #29 implementation PR merges
- after the first release, #28 immediately proves offsite logical backup and
  restore; monitoring, automated backups and multi-replica limiter state remain
  #33, #32 and #34 respectively

Implementation uses Python standard-library validation/state helpers, a kernel
file lock, sequential builds from `git archive`, atomic manifest replacement,
and PostgreSQL's first-initialization SQL hook. Prisma's schema engine is
downloaded into the API image during build so the one-shot migration can run on
the internal database network without internet access. The Caddy snippet and
validate/reload command preserve the independently managed proxy lifecycle.
See `docs/production.md`; actual host and public verification remain pending.

Rejected for the first release:

- separate frontend/API domains — they add DNS, TLS and cross-origin state with
  no current benefit
- exposing API or PostgreSQL on host ports — it breaks the proxy trust and
  database isolation boundaries
- putting API on the shared `web` network — other pet-project containers would
  become part of its trusted network boundary
- per-SHA checkout directories, an image registry, a CD pipeline,
  zero-downtime deployment and automatic database rollback — each adds
  operational machinery that the first single-host deployment does not need

---

## Containerization

### Docker, separate images per app

Status:

- accepted

Chosen:

- one image per app (`web`: nginx serving the static build; `api`: Node.js),
  orchestrated with `docker-compose`
- backlog #17 introduced the repository-root `docker-compose.yml` with a
  PostgreSQL service only, plus `make db-up` as the standard local entry point
- backlog #27 added the `web` and `api` images and services before the first
  deploy
- CI supplies PostgreSQL independently and may use its native service mechanism
  instead of the local-development Compose file
- #27 introduced multi-stage builds from the repository-root context. Build
  stages and the API runtime use Node 22 Alpine plus the repository's pinned
  pnpm version; the web runtime is nginx Alpine. Maintained explicit image tags
  are selected during implementation rather than using `latest`
- the web Docker build requires `VITE_API_URL` and Vite embeds it into the static
  bundle. Compose supplies the local-development URL; #29 supplies the
  production value when building the production image. Runtime templating and
  an nginx API proxy are not introduced
- the API image contains both its production runtime and the Prisma CLI/schema/
  migrations needed for a one-shot `migrate` Compose service. The job runs
  `prisma migrate deploy` after PostgreSQL is healthy; API startup waits for the
  job to succeed instead of running migrations in every API entrypoint
- #27 added a minimal public `GET /api/v1/health` operational liveness endpoint.
  It returns `{ "status": "ok" }`, does not query dependencies and is not a
  product endpoint or a readiness guarantee. Dependency-aware health, external
  monitoring and alerting remain #33
- the extended Compose file is a complete local container stack: nginx is
  published on host port `5173`, the API on `3000`, and #17's PostgreSQL port
  `5432` remains available to host-native development. #29 owns production port
  exposure, networking, TLS and secrets

Reason:

- separate images give **independent scaling** of web and api
- the PostgreSQL migration needs a repeatable local database before application
  containers are justified; the database-only Compose stage provides it
- `pnpm dev` remains enough for the applications during local development, so
  their images wait until the structure is settled
- the same database engine runs in development and production
- build-time web configuration is explicit, so a production bundle cannot
  silently inherit the source-code localhost fallback
- a single migration job avoids startup races when the API is scaled and makes
  a clean Compose database usable without importing #29's release ritual
- a process-only liveness signal is sufficient for container startup in #27;
  deeper operational monitoring stays independently scoped

Rejected:

- single combined image (api also serving the frontend) — simpler to operate but
  couples web and api scaling, which contradicts the scaling goal
- runtime substitution of `VITE_API_URL` — adds an nginx startup/template path
  for a value Vite already models at build time
- nginx proxying `/api/v1` to the API — changes the established browser-to-API
  and CORS topology without a current need
- running `prisma migrate deploy` in every API entrypoint — couples migrations
  to replica startup and creates avoidable concurrency

### In-memory rate limiting for the first deployment

Status:

- implemented by backlog #31

Chosen:

- limit anonymous writes by framework-derived client IP, with separate fixed
  60-minute buckets for poll creation (5 requests) and ballot submission (300
  requests across all polls)
- count invalid attempts; do not extend a window when returning `429`
- keep counters in API-process memory and deploy one API replica initially;
  restarts may clear counters
- distrust forwarding headers by default. #31 makes an exact proxy-hop count
  configurable; #29 may set one trusted hop only after direct API access is
  blocked
- return the existing Nest error shape with `429` and mandatory `Retry-After`;
  do not add rate-limit metadata headers or a shared error DTO

Reason:

- groups often share a public IP in offices, classrooms, events and homes, so
  300 ballots per hour avoids an undue false-positive risk while still stopping
  simple automated abuse
- poll creation has much lower legitimate volume and can use the stricter limit
- process-local state adds no new persistence or service before the first
  deployment and matches its single-replica topology
- an explicit proxy trust boundary prevents clients from selecting arbitrary
  limiter keys through forwarding headers

Deferred:

- #29 owns the production reverse proxy, direct-access firewalling and runtime
  hop-count value
- #34 replaces process-local counters before horizontal API scaling
- #33 owns limiter metrics and alerting with the rest of production monitoring

Rejected for #31:

- PostgreSQL or Redis-backed counters — unnecessary infrastructure for the
  single-replica first deployment
- trusting forwarding headers unconditionally — clients could bypass limits by
  choosing their apparent address
- one shared write bucket — poll creation and group voting have materially
  different legitimate traffic profiles

---

## Storage

### PostgreSQL + Prisma

Status:

- accepted (supersedes the earlier SQLite decision below)

Chosen:

- PostgreSQL as the database, accessed via Prisma
- migrated before the first deploy while there was no production data

Reason:

- SQLite is a single-writer file → it cannot back multiple `api` replicas, which
  breaks the independent-scaling goal (see Containerization / Deployment)
- the cheapest moment to migrate a stateful DB is with **zero data**; migrating
  later under live data is a separate, risky project
- Prisma keeps the swap small: change `provider`, regenerate migrations

### SQLite + Prisma (superseded)

Status:

- superseded by PostgreSQL

Reason (historical):

- zero-ops setup for the initial MVP
- full TypeScript type safety via Prisma
- was chosen for easy future migration to PostgreSQL — that future is now

See `docs/10-storage.md` for schema details.

---

## Database Hosting

### Self-hosted PostgreSQL on the application VPS

Status:

- accepted (supersedes the Neon decision below)

Chosen:

- run PostgreSQL in Docker on the same DigitalOcean VPS as the application
- store database data in persistent storage / a Docker volume whose lifecycle
  is independent of the PostgreSQL container
- establish offsite recovery in stages: first a manual backup copied outside
  the VPS and DigitalOcean, then automated backups to independent object storage

Reason:

- minimizing recurring cost is the priority at the current, early stage
- sharing the application VPS avoids the cost of a managed database or a
  dedicated database VPS
- persistent storage keeps data across routine container replacement or
  recreation
- an offsite copy preserves a recovery path even after complete loss of the VPS,
  the DigitalOcean account, or DigitalOcean infrastructure

Consequences:

- the project owns PostgreSQL operations, including backup, restore, upgrades,
  monitoring, and recovery testing
- the application and database share a failure domain; persistent storage does
  not replace backups, and backups provide recovery rather than high availability
- the first production deployment is followed immediately by a manual
  `pg_dump`-style offsite copy and a restore drill (#28)
- once that recovery path is proven, scheduled backups move to independent
  object storage outside DigitalOcean (#32); see
  [Automated offsite backups to Cloudflare R2](#automated-offsite-backups-to-cloudflare-r2)

Evolution:

1. self-host PostgreSQL on the application VPS and prove manual offsite
   backup/restore immediately after the first deployment
2. automate scheduled offsite backups to independent object storage
3. when reliability requirements justify the cost, migrate to managed
   PostgreSQL from a provider separate from application hosting; keep
   independent backups

Rejected:

- a separate PostgreSQL VPS now — additional cost and operational complexity are
  not justified at the current scale
- multi-provider replication now — additional cost and complexity are not
  justified at the current scale

### Automated offsite backups to Cloudflare R2

Status:

- accepted for backlog #32 (Stage 2 of the staged backup plan); implementation
  pending

Chosen:

- store backups in one private Cloudflare R2 bucket in the owner's existing
  Cloudflare account, outside DigitalOcean
- rely on R2's built-in encryption at rest, without client-side encryption
- give the VPS only an `Object Read & Write` token scoped to that bucket and
  keep admin-level Cloudflare credentials off the VPS
- make every object immutable for 30 days with an R2 Bucket Lock and delete it
  after 90 days with a lifecycle rule
- once a day (RPO 24 hours), a systemd timer on the VPS host creates a
  custom-format `pg_dump -Fc` through `docker exec` in the running production
  `postgres` container and uploads it with `rclone` from an image pinned by
  digest
- alert the owner by email through Healthchecks.io when a backup fails or a
  scheduled run is missed
- run a manual restore drill from R2 every six months and after relevant
  events, and document a production recovery path; target RTO is 24 hours,
  best effort

Reason:

- R2 needs no new account, because the domain's DNS already uses Cloudflare,
  and the current data volume fits its free tier while staying independent of
  DigitalOcean
- the dump holds no accounts or personal data, so provider-side encryption is
  sufficient; a client-side key would add a secret whose loss makes every
  backup unusable
- deletion protection does not depend on token permissions: the Bucket Lock
  stops a compromised VPS from deleting or overwriting recent backups, and
  changing lock rules requires bucket-configuration rights the VPS token lacks
- the production database network has no internet egress, so the host rather
  than a Compose service performs the upload
- the custom-format dump repeats the path #28 already proved and can be
  validated with `pg_restore --list` before upload
- an external dead-man's switch also catches a timer that never fires or a host
  that is down

Consequences:

- backups and the domain's DNS share one Cloudflare account, which must be
  protected accordingly; the live data stays on DigitalOcean
- Healthchecks.io becomes part of operations, and the VPS keeps R2 and
  Healthchecks.io credentials separately from `prod.env`
- if backups stop, the owner is alerted before the lifecycle rule expires the
  last copy
- recovery stays owner-operated; production backups are not restored
  automatically on a schedule

Rejected:

- Backblaze B2 or AWS S3 — each needs a new account, and AWS is the heaviest to
  set up for a pet project
- client-side `age` encryption — a key-custody failure mode for
  low-sensitivity data
- a GitHub Actions freshness check — the public repository disables scheduled
  workflows after 60 days without activity, and the workflow would need an R2
  read token
- a plain-SQL dump — no `pg_restore --list` validation, and it departs from the
  proven #28 path
- an in-house S3 upload in Python — custom request-signing code instead of a
  proven tool

### Neon (managed PostgreSQL, superseded)

Status:

- superseded by self-hosted PostgreSQL on the application VPS

Reason (historical):

- managed operations and scale-to-zero suited a low-traffic early deployment
- a plain managed PostgreSQL service avoided an unused BaaS layer

Why superseded:

- minimizing recurring cost now takes precedence; managed PostgreSQL remains the
  planned next stage when reliability requirements grow

---

## Duplicate Vote Protection

### localStorage

Status:

- accepted

Reason:

- client-side only, no server state required
- simpler than cookies
- acceptable soft protection for anonymous MVP

Implementation: store voted poll IDs in `localStorage` key `voted_poll_ids`.

---

## MVP Principles

- minimal feature set
- fast delivery
- anonymous usage
- no authentication

---

## Voting Model

The system separates:

- ballot format
- counting method

Reason:

- allows multiple counting strategies
- supports future extensibility

---

## Ballot Format

Initial supported format:

- STRICT_RANKING

Future possible formats:

- RANKING_WITH_TIES
- PARTIAL_RANKING
- PAIRWISE

---

## Counting Methods

Initial supported method:

- BORDA

Future possible methods:

- IRV
- CONDORCET
- SCHULZE
- RANKED_PAIRS

---

## Mobile Strategy

Initial strategy:

- responsive web app
- possible PWA support later

Native mobile app is deferred.

---

## Frontend Routing

### react-router-dom

Status:

- accepted

Reason:

- de-facto standard for React SPAs
- v7 supports file-based routing for future upgrade path
- required for `/`, `/poll/:id`, `/poll/:id/results` routes

---

## Drag-and-Drop

### @dnd-kit/core

Status:

- accepted

Reason:

- lightweight, accessible, React-native
- no jQuery or external DOM dependency
- required for the ranked-ballot UI (drag & drop ranking)

---

## Agent Instructions

### Single canonical AGENTS.md

Status:

- accepted

Chosen:

- one canonical `AGENTS.md` at the repo root (open standard; read natively by
  Codex, Copilot coding agent, and Copilot code review)
- `CLAUDE.md` is a one-line `@AGENTS.md` import shim for Claude Code

Rejected:

- per-tool instruction files (`.github/copilot-instructions.md`, standalone
  `CLAUDE.md`) — duplicated content drifts
- symlink instead of import shim — poor Windows/portability story

See `docs/12-ai-first.md` for the wider AI-first strategy.

---

## Backlog

### Backlog-as-code

Status:

- accepted

Chosen:

- `docs/backlog.md` is the single source of truth for work items
- GitHub Issues are the raw idea inbox, not the backlog store
- a PR completing an item updates `docs/backlog.md` in the same PR (part of DoD)

Rejected:

- GitHub Issues/Projects as the backlog store — moves the source of truth out
  of the repository and drifts from the docs

### Automatic issue triage recommendation

Status:

- accepted

Chosen:

- GitHub Agentic Workflows (`.github/workflows/issue-triage.md`) with the
  Copilot engine
- the agent is read-only; its only write is one safe `add-comment` on the
  triggering Issue
- default trigger roles, so only eligible Issues (opened by someone with write
  access) are triaged automatically
- recommend-only: the owner decides, and backlog promotion stays a separate step

Rejected:

- alternatives that give the agent direct, write-capable repository access —
  rejected for a narrower trust boundary

### Automatic backlog promotion

Status:

- accepted

Chosen:

- a plain GitHub Actions workflow (`.github/workflows/backlog-promotion.yml`)
  running the tested `scripts/backlog-promotion.mjs`; there is no model, so the
  accepted recommendation is copied as written and never re-evaluated
- a repository admin applying `triage: accepted` starts it; it fails closed
  (exactly one comment from the `issue-triage` workflow, verdict `Keep`, values
  that fit the fixed widths) and reports the reason and the recovery step on
  the Issue
- the built-in `GITHUB_TOKEN` opens a pull request that closes the Issue on
  merge; the owner approves its CI runs, reviews it and merges it
- one promotion runs at a time; the next ID follows the backlog and every ID an
  open pull request adds, and rows go to the end of `Todo`, so two promotions
  open side by side conflict instead of merging a duplicate ID

Rejected:

- an agentic workflow with a `create-pull-request` safe output — a model would
  re-derive what the owner already accepted, and its output cannot be unit
  tested
- a GitHub App or personal access token so CI starts without approval — a
  secret to manage for a click the owner makes while reviewing anyway
- shortening overlong titles or notes automatically — the owner edits the
  triage comment instead, so the row says exactly what was accepted

### Backlog sweep process

Status:

- accepted; implemented by backlog ID-39

Chosen:

- one canonical `backlog-sweep` skill holds the sweep procedure; it only
  recommends, and the owner decides before `docs/` changes through a normal
  reviewed PR. `task-readiness` stays a separate stage and the only way an item
  becomes `Ready`
- one plain, deterministic workflow (`.github/workflows/backlog-sweep.yml`,
  running the tested `scripts/backlog-sweep.mjs`) is the common request entry
  point: `workflow_dispatch` with a required reason, plus a weekly best-effort
  check. It only requests and tracks sweeps
- one persistent tracker Issue with the reserved `backlog-sweep` label: open
  means a sweep is requested, closed means none is pending. A request reopens it
  when it is closed and comments the reason; the owner closes it after checking
  that the latest reasons were covered
- triggers: fewer than 2 `Ready` items left when a `Ready` item is picked for
  work (a procedural rule for agents and people); a release, only after a
  successful deployment and production verification; and about 60 days since
  the last closing
- no longer wanted items move to a `Cancelled` section shaped like `Done`, so
  they keep their ID and the reason

Reason:

- the same procedure serves every trigger, so it lives once, in the skill, and
  neither the workflow nor the tracker repeats it
- one tracker gathers repeated triggers in one place; a new Issue per request
  would fill the raw idea inbox with reminders
- the backlog has no `In progress` state, so only the person or agent picking an
  item knows the pool just shrank
- a tag push is not proof of a verified release, and would fire at the start of
  a tag-triggered deployment once CD exists
- a sweep result PR can wait in review while a newer request arrives, so the
  tracker is not closed automatically

Consequences:

- the Ready-pool trigger depends on whoever picks work following the rule; it is
  procedural, and concurrent pickups are not tracked
- the release flow gains one owner step after verification; a future CD
  workflow calls the same entry point after a successful deployment and
  verification
- GitHub disables scheduled workflows in a public repository after 60 days
  without activity, so the periodic check is best effort
- backlog tooling checks formatting, duplicate IDs and the next free ID across
  `Todo`, `Done` and `Cancelled`

Rejected:

- detecting the Ready-pool threshold when a completed item reaches `Done` — the
  signal arrives one pull request after the work was picked
- an `In progress` state or reservation tracking — ceremony out of proportion to
  the problem
- triggering a sweep from a tag push
- closing the tracker from the result PR with a closing keyword
- running the sweep itself in CI — the automation only requests and tracks
  sweeps
- a fixed calendar schedule, which ignores sweeps that already happened, and an
  external scheduler
