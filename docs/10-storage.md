# Storage

## Decision

### Storage

- **Database**: PostgreSQL (self-hosted in Docker on the application VPS in
  production, local container in dev)
- **ORM**: Prisma

Status: accepted target (migration from SQLite pending; see
`docs/06-decisions.md`)

Reason:

- a networked DB is required for independent `api` scaling — SQLite is
  single-writer and cannot back multiple replicas
- migrated while there is **no production data**, the cheapest moment to switch
- Prisma provides full TypeScript type safety and keeps the swap small
- self-hosting on the application VPS minimizes recurring cost at the current
  stage; offsite backups mitigate complete loss of the DigitalOcean environment

> **Implementation note:** the migration is a pending slice — backlog item #17.
> Until it lands, the running code still uses SQLite as documented under
> [Current SQLite backup and migration](#current-sqlite-backup-and-migration)
> below.

---

## Migration path (SQLite → PostgreSQL)

- change the Prisma `provider` to `postgresql` and point `DATABASE_URL` at the
  Postgres instance (the application VPS in production, a local Postgres in dev)
- swap the Prisma 7 driver adapter: `@prisma/adapter-better-sqlite3` →
  the Postgres adapter, in `src/infrastructure/prisma/prisma.service.ts`
- regenerate the migration history for Postgres (there is no production data,
  so the SQLite history is replaced rather than migrated), then
  `prisma migrate deploy`
- no domain or application logic changes: the services speak Prisma's model
  API, not SQL

**What the swap does reach**, and is easy to under-estimate: the e2e suite
provisions its database itself (`prisma db push` onto a throwaway SQLite file),
so it needs a real Postgres instance — locally and in CI. Dev and CI therefore
both gain a database dependency they do not have today. Acceptance criteria for
the migration are in `docs/acceptance-criteria.md` (#17).

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

## Current SQLite backup and migration

This section applies only until backlog item #17 replaces the current SQLite
implementation with PostgreSQL.

### Where the database lives

- Single SQLite file: `apps/api/dev.db`.
- The path comes from `DATABASE_URL` in `apps/api/.env` (`file:./dev.db`, resolved
  relative to `apps/api/`) and is wired into Prisma via `apps/api/prisma.config.ts`.
- The file is **not** committed (`*.db` is git-ignored), so it exists only on the
  machine that ran the app. The **schema** is versioned separately under
  `apps/api/prisma/migrations/` and can be reproduced anywhere.

### Backup / dump

Run from `apps/api/`:

```bash
sqlite3 dev.db .dump > backup.sql      # portable SQL dump
sqlite3 dev.db ".backup backup.db"     # safe hot copy (works while the app runs)
cp dev.db dev.db.bak                   # plain copy (app stopped)
```

### Move to another machine or server

- **Schema only** (fresh, empty DB): copy `prisma/`, set `DATABASE_URL`, then run
  `pnpm --filter @rank-vote/api db:deploy` (`prisma migrate deploy`).
- **Schema + data**: copy the `dev.db` file directly, or restore a dump with
  `sqlite3 new.db < backup.sql`.

For the move to PostgreSQL see [Migration path](#migration-path-sqlite--postgresql)
above — swap the provider and `DATABASE_URL`, replace the SQLite driver adapter,
then `db:deploy`.

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
