# @rank-vote/api

The rank-vote backend: NestJS + Prisma. The product API has four documented
endpoints under `/api/v1`; the current Nest scaffold also exposes
`GET /api/v1` returning `Hello World!` until backlog #30 removes it. Part of the
[rank-vote](../../README.md) monorepo — run it from the repository root
(`make api`), not from here.

`GET /api/v1/health` is the separate process-liveness endpoint used by the
container healthcheck. It returns `{"status":"ok"}` without querying the
database; dependency-aware readiness remains backlog #33.

## Layout

```txt
src/
  domain/          # pure logic: Borda count, strict-ranking validation
  application/     # services + mappers from persisted rows to shared DTOs
  infrastructure/  # PrismaService (global module)
  presentation/    # controllers + class-validator DTOs at the edge
  app.setup.ts     # runtime config shared by main.ts and the e2e suite
```

See [`docs/05-architecture.md`](../../docs/05-architecture.md) for how the
layers depend on each other.

## Scripts

```bash
pnpm dev            # nest start --watch
pnpm test           # unit specs, then the e2e suite
pnpm test:e2e       # reset rank_vote_test, then run the API e2e suite
pnpm db:migrate     # prisma migrate dev
pnpm db:deploy      # prisma migrate deploy
```

The multi-stage [`Dockerfile`](Dockerfile) builds from the repository-root
context, generates the Prisma Client and CommonJS shared package, and starts the
compiled API with Node. Its runtime also carries the Prisma CLI, schema, config
and migration history, so Compose's one-shot `migrate` service can reuse the
same image before the API starts. `DATABASE_URL`, `PORT` and `CORS_ORIGIN` are
provided only at runtime.

## Database

PostgreSQL is accessed through Prisma. Start the local development and test
databases with `make db-up`; `DATABASE_URL` comes from `apps/api/.env` (copy
`.env.example`, or run `make setup`). The e2e runner always resets the separate
`rank_vote_test` database and never reads the development URL. Schema, backup
and migration notes live in
[`docs/10-storage.md`](../../docs/10-storage.md); the wire contract in
[`docs/09-api-design.md`](../../docs/09-api-design.md).
