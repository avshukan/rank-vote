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
  Postgres instance (the application VPS in production, the `docker-compose`
  Postgres locally)
- regenerate the migration history for Postgres, then `prisma migrate deploy`
- no application/business-logic code changes required

---

## Production PostgreSQL backup and recovery

These are operational requirements, not a selected backup implementation. The
provider and tooling remain open until the deployment slice.

### Data persistence

- PostgreSQL data must live in persistent storage / a Docker volume whose
  lifecycle is independent of the database container.
- Replacing or recreating the PostgreSQL container must not delete the database.
- The volume remains part of the VPS failure domain and is **not** a backup.

### Offsite backup

- Backups must be copied outside the current VPS and outside DigitalOcean.
- The backup location must use an independent provider and remain usable if the
  VPS, the DigitalOcean account, or DigitalOcean infrastructure is completely
  lost.
- The backup process must be repeatable, monitored for failures, and covered by
  a documented retention policy.

### Restore and verification

- The restore procedure must start from an offsite backup and a clean PostgreSQL
  instance; it must not depend on access to the original VPS.
- Restore tests must run periodically and confirm that the schema and data are
  readable and that the application can connect to the restored database.
- The result and date of each restore test must be recorded so that backup
  existence is not mistaken for recoverability.

### Open implementation decisions

- independent backup provider and storage service
- backup tool and format (logical, physical, or both)
- backup frequency and target recovery point (RPO)
- retention periods and number of retained copies
- encryption, key custody, and access-control model
- restore-test cadence and target recovery time (RTO)
- monitoring, alerting, and ownership for failed backups

The intended next stage is managed PostgreSQL from a provider separate from
application hosting. A dedicated PostgreSQL VPS and multi-provider replication
are deliberately deferred at the current scale because their cost and
operational complexity are not justified.

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
above — swap the provider and `DATABASE_URL`, then `db:deploy`; no application
code changes.

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
