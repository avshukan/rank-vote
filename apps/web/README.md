# @rank-vote/web

The rank-vote frontend: React + Vite + TypeScript + Tailwind CSS. Part of the
[rank-vote](../../README.md) monorepo — run it from the repository root
(`make web`), not from here.

## Layout

```txt
src/
  pages/     # one component per route
  features/  # create-poll, vote, results
  shared/    # api client, localStorage helpers, shared UI
```

Routes: `/` create a poll, `/poll/:id` vote, `/poll/:id/results` results, `*`
not found.

## Scripts

```bash
pnpm dev            # vite dev server
pnpm build          # tsc -b && vite build
pnpm test           # Vitest + React Testing Library
```

## Configuration

`VITE_API_URL` points at the API (copy `.env.example`, or run `make setup`).
The dev server and `make web` listen on port 5173, which `CORS_ORIGIN` in
`apps/api/.env` pins — any other port fails every request as a CORS error.
