# Storage

## Decision

### Storage

- **Database**: PostgreSQL (hosted on Neon in production, local container in dev)
- **ORM**: Prisma

Status: accepted (migrated from SQLite; see `docs/06-decisions.md`)

Reason:

- a networked DB is required for independent `api` scaling — SQLite is
  single-writer and cannot back multiple replicas
- migrated while there is **no production data**, the cheapest moment to switch
- Prisma provides full TypeScript type safety and keeps the swap small

> **Implementation note:** the migration is a pending slice — backlog item #17.
> Until it lands, the running code still uses SQLite as documented under
> [Backup & Migration](#backup--migration) below.

---

## Migration path (SQLite → PostgreSQL)

- change the Prisma `provider` to `postgresql` and point `DATABASE_URL` at the
  Postgres instance (Neon in prod, the `docker-compose` Postgres locally)
- regenerate the migration history for Postgres, then `prisma migrate deploy`
- no application/business-logic code changes required

---

## Backup & Migration

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
