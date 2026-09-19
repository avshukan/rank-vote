# Storage

## Decision

### Storage

- **Database**: PostgreSQL (self-hosted in Docker on the application VPS in
  production, local container in dev)
- **ORM**: Prisma

Status: implemented (see `docs/06-decisions.md`)

Reason:

- a networked DB is required for independent `api` scaling — SQLite is
  single-writer and cannot back multiple replicas
- migrated while there was **no production data**, the cheapest moment to switch
- Prisma provides full TypeScript type safety and keeps the swap small
- self-hosting on the application VPS minimizes recurring cost at the current
  stage; offsite backups mitigate complete loss of the DigitalOcean environment

The migration landed in backlog #17 before the first deployment, while there
was no production data. The Prisma datasource now uses `postgresql`, runtime
connections use `@prisma/adapter-pg`, and the migration history begins with a
PostgreSQL `init` migration. Models and HTTP contracts did not change.

---

## Development and test PostgreSQL contract

The repository-root `docker-compose.yml` defines PostgreSQL plus the complete
containerized application stack. `make db-up` remains the standard command that
starts only PostgreSQL for host-native development. The Compose instance
provisions separate `rank_vote` development and fixed `rank_vote_test`
databases; `make stack-up` additionally builds and starts `migrate`, `api` and
`web`, and `make stack-down` preserves the named database volume.

The normal `apps/api/.env` points at `rank_vote`. `pnpm test:e2e` runs
`apps/api/test/run-e2e.mjs`, which gives Prisma and Jest an explicit test-only
`DATABASE_URL` pointing at `rank_vote_test`. The runner reads only
`TEST_DATABASE_URL` (or its fixed local test default), verifies the database
name, and refuses any other target. Before Jest starts, it runs
`prisma db push --force-reset`, so each run starts from a clean schema without
ever resetting the development database.

CI provides the equivalent `rank_vote_test` database through its native service
mechanism and runs the same e2e runner through `pnpm test`.

---

## Production PostgreSQL backup and recovery

Backup capability is introduced in stages so the early project keeps operating
cost and complexity low while still proving that recovery works.

### Data persistence

- Production PostgreSQL uses database `rank_vote_prod`, owned by the
  non-superuser runtime/migration role `rank_vote_app`. API and migrate use the
  same `DATABASE_URL`; a separate bootstrap/admin credential is never supplied
  to either application service.
- PostgreSQL data lives in the external Docker volume
  `rank_vote_prod_postgres_data`, mounted at `/var/lib/postgresql/data`. Its name
  and lifecycle are independent of `/opt/apps/rank-vote` and the fixed Compose
  project `rank-vote-prod`.
- Replacing or recreating the PostgreSQL container must not delete the database.
- Production mounts no development initialization script, creates no
  `rank_vote_test` database and never runs `prisma db push --force-reset` or
  `prisma migrate dev`.
- PostgreSQL publishes no host port and is attached only to the internal
  `rank-vote-prod-db` network with API and migrate.
- The volume remains part of the VPS failure domain and is **not** a backup.

### Stage 1 — manual offsite backup and restore

The owner completed backlog #28 on 2026-09-19 against verified release
`v0.1.0` at commit `7021f3137b597119e39ca13e6a86275da58b28e1`. `pg_dump -Fc`
created `rank-vote-20260919T140118Z.dump` from the running `rank_vote_prod`
database while production remained online; the procedure neither copied nor
changed the live Docker volume. Its SHA-256 was calculated on the VPS before
the dump and checksum were copied with `scp` to the owner's local WSL machine
outside DigitalOcean. Local verification matched the source digest exactly.

Restore used a fresh, isolated PostgreSQL 17 container, database, network,
storage and local-only credentials. It did not reuse or reset the normal
development database, `rank_vote_test`, their existing volumes, or any
production resource. `pg_restore --no-owner --no-acl --exit-on-error` completed
successfully, and direct schema/data reads plus the exact `v0.1.0` API connected
only to the restored database verified recovery.

Recovery was proven through smoke poll
`4647e500-8940-41a2-9b25-6261d82e9ace`: the restored API returned its
`Production smoke ...` poll with ordered options `Alpha`, `Beta`, `Gamma`, then
calculated one `BORDA` ballot as scores `2`, `1`, `0` with `Alpha` the sole
winner. This exercised restored poll, option, ballot and entry data rather than
accepting `pg_restore` success alone. The temporary application, database,
network, volume, credentials, worktree and image were removed. The verified
dump and checksum remain offsite under `~/backups/rank-vote/` on the owner's WSL
machine.

See `docs/acceptance-criteria.md` for the complete #28 contract and completion
evidence. The successful drill proved the complete recovery path; the retained
local copy is the Stage 1 artifact, not the intended long-term backup service.

### Stage 2 — automated offsite backups

With the manual backup/restore path proven, the next step is to automate logical
dumps on a schedule and send them to object storage with an independent
provider outside DigitalOcean. This stage remains backlog #32.

Stage 2 must define:

- backup tool and format
- schedule and target recovery point (RPO)
- retention policy
- encryption and access control
- failed-backup monitoring/alerting
- restore-test cadence and target recovery time (RTO)

### Stage 3 — managed PostgreSQL

When the project grows and reliability requirements justify the additional
cost, migrate to managed PostgreSQL from a provider separate from application
hosting. Independent backups remain required.

A dedicated PostgreSQL VPS and multi-provider replication are deliberately
deferred at the current scale because their cost and operational complexity are
not justified.

---

## Current PostgreSQL schema and migration workflow

### Where the database lives

- Local data lives in the named Docker volume declared by
  `docker-compose.yml`; replacing the container leaves that volume intact.
- Production data lives in the explicitly provisioned external volume
  `rank_vote_prod_postgres_data`. Production deployment must fail when that
  volume is missing rather than silently initialize an empty replacement.
- `apps/api/.env` supplies the development `DATABASE_URL` and
  `apps/api/prisma.config.ts` supplies it to Prisma CLI commands.
- `/etc/rank-vote/prod.env` supplies the production `DATABASE_URL` to both API
  and the one-shot migrate service. It points to
  `rank_vote_app@postgres:5432/rank_vote_prod?schema=public`; its generated
  password is URL-encoded as required and never committed.
- The schema is versioned under `apps/api/prisma/migrations/`. The history was
  regenerated for PostgreSQL in #17 because no production data existed.

### Apply the schema

Start PostgreSQL and apply development migrations from the repository root:

```bash
make db-up
make db-migrate
```

On a fresh non-development database, set `DATABASE_URL` and run
`pnpm --filter @rank-vote/api db:deploy` (`prisma migrate deploy`). This applies
the committed history without creating a new migration.

Backlog #27 packaged that production-safe command into a one-shot Compose
service named `migrate`. It reuses the API image, waits for the `postgres`
healthcheck and must complete successfully before the API starts. The image
therefore carries the Prisma CLI, schema, config and committed migration history
in addition to the compiled runtime. The API entrypoint does not apply
migrations itself, so scaling or restarting API replicas cannot start competing
migration processes.

This defines local container startup ordering. The #29 repository tooling adds
a separate production Compose and the operator ritual in `docs/production.md`.
Its first-initialization SQL hook creates the non-superuser app/database owner
using a separate bootstrap credential; normal deploy requires the existing
external volume. Prisma's schema engine is preloaded during image build, since
the migration container's internal database network has no internet access.
Production deployment evidence and closure of #29 remain a separate
documentation task from the completed #28 recovery drill.

### Backup / restore

PostgreSQL data is transferred with logical `pg_dump` / `pg_restore` backups,
not by copying the live Docker volume. The first production offsite dump used
custom format, was restored into isolated PostgreSQL 17 and was verified
through known application data as completed backlog #28; see
[Production PostgreSQL backup and recovery](#production-postgresql-backup-and-recovery).

---

## Schema

```prisma
model Poll {
  id        String   @id @default(uuid())
  title     String
  createdAt DateTime @default(now())

  options PollOption[]
  ballots Ballot[]
}

model PollOption {
  id     String @id @default(uuid())
  pollId String
  text   String
  order  Int

  poll    Poll          @relation(fields: [pollId], references: [id])
  entries BallotEntry[]
}

model Ballot {
  id        String   @id @default(uuid())
  pollId    String
  createdAt DateTime @default(now())

  poll    Poll          @relation(fields: [pollId], references: [id])
  entries BallotEntry[]
}

model BallotEntry {
  id       String @id @default(uuid())
  ballotId String
  optionId String
  rank     Int

  ballot Ballot     @relation(fields: [ballotId], references: [id])
  option PollOption @relation(fields: [optionId], references: [id])
}
```

---

## Duplicate Vote Protection

Soft protection using browser `localStorage`.

How it works:

- after submitting a ballot, the client stores the poll ID in `localStorage` key `voted_poll_ids`
- before showing the vote UI, the client checks `localStorage`
- if the poll ID is already present, the user sees the results page instead of the voting form

Notes:

- this is client-side only — no server enforcement
- protection can be bypassed by clearing browser storage
- acceptable for MVP scope
