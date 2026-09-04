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

- PostgreSQL data must live in persistent storage / a Docker volume whose
  lifecycle is independent of the database container.
- Replacing or recreating the PostgreSQL container must not delete the database.
- The volume remains part of the VPS failure domain and is **not** a backup.

### Stage 1 — manual offsite backup and restore

Immediately after the first production deployment, create a logical PostgreSQL
backup manually and copy it outside the VPS and outside DigitalOcean, initially
to the project owner's local machine. Then restore that backup into a clean
PostgreSQL instance and verify that the schema/data are readable and the
application can connect.

This stage is backlog #28. Its purpose is to prove the complete recovery path
before automating it; the local machine is an offsite copy, but it is not the
intended long-term backup service.

### Stage 2 — automated offsite backups

After the manual backup/restore path is proven, automate logical dumps on a
schedule and send them to object storage with an independent provider outside
DigitalOcean. This stage is backlog #32.

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
- `apps/api/.env` supplies the development `DATABASE_URL` and
  `apps/api/prisma.config.ts` supplies it to Prisma CLI commands.
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

This defines container startup ordering, not the production release ritual. #29
decides how and when the production stack is built, configured and invoked.

### Backup / restore

PostgreSQL data is transferred with logical `pg_dump` / `pg_restore` backups,
not by copying the live Docker volume. The first production offsite dump and
restore drill remains backlog #28, immediately after the first deployment; see
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
