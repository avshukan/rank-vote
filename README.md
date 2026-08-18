# rank-vote

Simple web app for group decisions using ranked voting (Borda count).

## Quick Start

```bash
# Install dependencies and create the .env files from the examples
make setup

# Run the app — two terminals, API first
make api
make web        # http://localhost:5173
```

`make help` lists the rest. `pnpm dev` runs both halves plus the shared
package in watch mode under one supervisor; the split targets exist so that
restarting the web half does not take the API down with it.

## Environment Variables

| Variable       | App | Default                        | Description                                   |
| -------------- | --- | ------------------------------ | --------------------------------------------- |
| `DATABASE_URL` | api | `file:./dev.db`                | SQLite path (or PostgreSQL URL in production) |
| `PORT`         | api | `3000`                         | API listen port                               |
| `CORS_ORIGIN`  | api | `http://localhost:5173`        | Allowed frontend origin                       |
| `VITE_API_URL` | web | `http://localhost:3000/api/v1` | Backend API base URL                          |

## Docs

See [`docs/`](docs/) for full documentation. Start with:

- [`docs/00-product.md`](docs/00-product.md) — product vision
- [`docs/05-architecture.md`](docs/05-architecture.md) — monorepo structure and tech stack
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — phased plan
- [`AGENTS.md`](AGENTS.md) — guide for AI agents and contributors
