# rank-vote

Simple web app for group decisions using ranked voting (Borda count).

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env files and fill in values
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start all apps in dev mode
pnpm dev
```

## Environment Variables

| Variable | App | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | api | `file:./dev.db` | SQLite path (or PostgreSQL URL in production) |
| `PORT` | api | `3000` | API listen port |
| `CORS_ORIGIN` | api | `http://localhost:5173` | Allowed frontend origin |
| `VITE_API_URL` | web | `http://localhost:3000/api/v1` | Backend API base URL |

## Docs

See [`docs/`](docs/) for full documentation. Start with:

- [`docs/00-product.md`](docs/00-product.md) — product vision
- [`docs/05-architecture.md`](docs/05-architecture.md) — monorepo structure and tech stack
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — phased plan
- [`AGENTS.md`](AGENTS.md) — guide for AI agents and contributors
