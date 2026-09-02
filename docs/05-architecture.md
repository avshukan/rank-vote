# Architecture

## Monorepo

The project uses a monorepo structure managed with **pnpm workspaces**.

Goals:

- keep frontend and backend together
- simplify development
- share types and contracts
- simplify CI/CD

---

## Applications

### apps/web

Frontend application.

Responsibilities:

- poll creation UI
- voting UI
- results UI

Tech (initial):

- React
- TypeScript
- Vite
- Tailwind CSS

---

### apps/api

Backend application.

Responsibilities:

- store polls
- store ballots
- calculate results
- expose HTTP API

Tech (initial):

- Node.js
- TypeScript
- NestJS
- Prisma

---

## Shared Package

### packages/shared

Shared types and contracts.

Examples:

- DTOs
- enums
- validation schemas
- API contracts

---

## Backend Structure

The backend follows a simplified layered architecture.

```txt
apps/api/src/
  domain/
  application/
  infrastructure/
  presentation/
```

---

## Frontend Structure

Frontend is feature-oriented.

```txt
apps/web/src/
  features/
  shared/
  pages/
```

---

## Storage

Current implementation:

- SQLite (via Prisma)

Accepted production target:

- PostgreSQL (via Prisma)
- PostgreSQL container on the application VPS
- persistent storage independent of the container lifecycle
- offsite backups with a provider outside DigitalOcean

The PostgreSQL migration is backlog item #17 and must land before the first
deployment. See `docs/06-decisions.md` for the hosting decision and
`docs/10-storage.md` for storage, backup, and recovery requirements.

---

## Future Extensions

Possible future additions:

- PWA
- native mobile app
- multiple counting engines
- real-time updates
