# Architecture

## Monorepo

The project uses a monorepo structure.

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

## Initial Storage

MVP storage:
- SQLite or PostgreSQL

Decision deferred until implementation phase.

---

## Future Extensions

Possible future additions:
- PWA
- native mobile app
- multiple counting engines
- real-time updates
