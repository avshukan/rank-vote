# rank-vote

Simple web app for group decisions using ranked voting (Borda count).

## Quick Start

Run the complete application in containers:

```bash
make stack-up       # web: http://localhost:5173, API: http://localhost:3000
make stack-down     # stops containers and preserves PostgreSQL data
```

The first command builds both application images, applies committed migrations
through the one-shot `migrate` service and waits for PostgreSQL, API and web
healthchecks. To work on the applications with native watchers instead:

```bash
# Install dependencies and create the .env files from the examples
make setup

# Start PostgreSQL and apply migrations
make db-up
make db-migrate

# Run the app — two terminals
make api
make web        # http://localhost:5173
```

`make help` lists the rest. `pnpm dev` runs both halves plus the shared
package in watch mode under one supervisor; the split targets exist so that
restarting the web half does not take the API down with it.

`make db-up` continues to start only PostgreSQL. `make container-smoke` builds
both images and exercises an isolated stack with fresh temporary storage.

## Stopping and Restarting

For the container stack, use `make stack-down`; the named PostgreSQL volume is
preserved. Run `make stack-up` again for the next session.

To stop the host-native app cleanly:

1. Press `Ctrl+C` in both terminals running `make api` and `make web`.
2. From the repository root, run `make down`. This stops anything still
   listening on the web and API ports (`5173` and `3000` by default), including
   a process left behind by a watcher.
3. Stop PostgreSQL with `docker compose stop postgres`.

`make down` stops the web and API processes only; it does not stop PostgreSQL.
The database is stored in the named Docker volume `rank_vote_postgres_data`, so
both `docker compose stop postgres` and `docker compose down` preserve the local
data. The latter also removes the Compose container and network. Do not add
`-v` unless you intentionally want to delete the local database.

For the next development session, start PostgreSQL and the two app processes
again:

```bash
make db-up

# Two terminals
make api
make web        # http://localhost:5173
```

There is no need to repeat `make setup` on every run. Run `make db-migrate`
again after pulling or creating new database migrations.

## Environment Variables

| Variable             | App | Default                                                                   | Description                        |
| -------------------- | --- | ------------------------------------------------------------------------- | ---------------------------------- |
| `DATABASE_URL`       | api | `postgresql://rank_vote:rank_vote@localhost:5432/rank_vote?schema=public` | PostgreSQL development URL         |
| `PORT`               | api | `3000`                                                                    | API listen port                    |
| `CORS_ORIGIN`        | api | `http://localhost:5173`                                                   | Allowed frontend origin            |
| `TRUSTED_PROXY_HOPS` | api | `0`                                                                       | Exact number of trusted proxy hops |
| `VITE_API_URL`       | web | `http://localhost:3000/api/v1`                                            | Backend API base URL               |

For Docker, `VITE_API_URL` is a required web-image build argument because Vite
embeds it in the static bundle. Compose supplies the local default above.
`DATABASE_URL`, `PORT`, `CORS_ORIGIN` and `TRUSTED_PROXY_HOPS` remain runtime
settings for the API. Keep `TRUSTED_PROXY_HOPS=0` whenever clients connect to
the API directly; #29 may set it to `1` only after placing the API exclusively
behind one reverse proxy hop.
The optional `RANK_VOTE_POSTGRES_PORT`, `RANK_VOTE_API_PORT` and
`RANK_VOTE_WEB_PORT` variables override Compose's published host ports while
leaving container-to-container ports unchanged.

## Docs

See [`docs/`](docs/) for full documentation. Start with:

- [`docs/00-product.md`](docs/00-product.md) — product vision
- [`docs/05-architecture.md`](docs/05-architecture.md) — monorepo structure and tech stack
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — phased plan
- [`docs/backlog.md`](docs/backlog.md) — what is done and what is next
- [`AGENTS.md`](AGENTS.md) — guide for AI agents and contributors
