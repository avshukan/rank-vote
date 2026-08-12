---
name: verify-app
description: Drive the running app in a real browser against a live API, to satisfy the "Manually verified end-to-end" item in the Definition of Done.
---

# verify-app

Prove a change works in the actual app, not only in jsdom. `AGENTS.md` makes
"Manually verified end-to-end" part of the Definition of Done, and `new-slice`
step 7 requires it — this is how.

## When to use

Any slice that touches `apps/web`, before opening the PR. API-only changes need
`curl` against a running API, not the browser half of this.

## Steps

1. **Serve the web app.** `pnpm dev` is broken (backlog #21), so build and preview:

   ```bash
   pnpm --filter @rank-vote/web exec vite build
   pnpm --filter @rank-vote/web exec vite preview --port 5173 --strictPort
   ```

   The port is load-bearing: `CORS_ORIGIN` in `apps/api/.env` pins
   `http://localhost:5173`. On any other port the API rejects the preflight and
   every fetch surfaces as a generic network error, which reads exactly like an
   app bug and sends you chasing the wrong thing.

2. **Start the API separately** — `cd apps/api && pnpm dev`, not root `pnpm dev`.
   Root `pnpm dev` is one supervisor over both apps: killing the web port to
   restart it takes the API down with it.

3. **Seed real data** through the API, so the browser drives real UUIDs:

   ```bash
   POLL_ID=$(curl -s -X POST http://localhost:3000/api/v1/polls \
     -H 'Content-Type: application/json' \
     -d '{"title":"check","options":["Alpha","Beta"]}' \
     | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
   ```

   The results page needs a ballot too, or it renders all-zero scores and
   proves nothing. A ballot must rank every option, so build `entries` from
   the poll itself rather than by hand:

   ```bash
   curl -s "http://localhost:3000/api/v1/polls/$POLL_ID" \
     | python3 -c 'import sys,json; o=json.load(sys.stdin)["options"]; print(json.dumps({"entries":[{"optionId":x["id"],"rank":i+1} for i,x in enumerate(o)]}))' \
     | curl -s -X POST "http://localhost:3000/api/v1/polls/$POLL_ID/ballots" \
       -H 'Content-Type: application/json' -d @-
   ```

   Let `python3` assemble the JSON. zsh does not word-split an unquoted
   variable, so collecting the option ids into a shell string and expanding it
   (`set -- $ids`) yields one argument, not N — the API then rejects the ballot
   with a `400` that looks like a validation bug in the app.

4. **Render each route headlessly.** Playwright's chromium is already in the
   local cache — no project dependency needed. `--dump-dom` runs the JS and
   prints the resulting DOM:

   ```bash
   SHELL_BIN=$(ls -d ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell | tail -1)
   "$SHELL_BIN" --headless --disable-gpu --no-sandbox --virtual-time-budget=6000 \
     --user-data-dir=<scratch>/profile --dump-dom "http://localhost:5173/<path>"
   ```

   `--virtual-time-budget` waits for the fetch and re-render; without it you dump
   an empty `#root`. Give each render its own `--user-data-dir` so a stuck
   profile lock cannot silently reuse a previous page.

   The routes (`apps/web/src/App.tsx`) are **singular** — `/poll/:id` — while
   the API path is plural (`/api/v1/polls/:id`). Guessing the plural form on the
   web side hits the `*` catch-all and renders the not-found page, which is
   indistinguishable from a real bug:
   - `/` — create-poll form
   - `/poll/:id` — vote page
   - `/poll/:id/results` — results page
   - anything else — shared `NotFound`

5. **Assert on the rendered DOM,** not on the HTTP status — the SPA answers `200`
   for every path, including the ones that render the 404 page. Grep for the
   markers that distinguish the states (`<h1>` text, a button label, an option).

6. **Read stderr too.** Console errors and CORS failures land there, not in the
   dumped DOM. An empty `<div id="root"></div>` plus an `Uncaught` line in stderr
   means the bundle failed to boot — the page is not "still loading".

7. **Cover the error paths,** not just the happy one: an unknown id (API `404`),
   a malformed URL, and at least one real record.

## Gotchas learned the hard way

- If the app misbehaves, check whether it also misbehaves on `main` before
  debugging your own diff: `git stash push -u`, render, `git stash pop`. This is
  how #21 was identified as pre-existing rather than caused by the slice.
- Coreutils sometimes resolve oddly inside loops and functions in this sandbox
  (`command not found: head`). Use absolute paths — `/usr/bin/head`,
  `/usr/bin/grep` — in scripted renders.
- Kill the servers when done: `lsof -ti:5173,3000 | xargs kill`.
