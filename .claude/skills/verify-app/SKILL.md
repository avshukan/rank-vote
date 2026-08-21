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

1. **Serve the web app** with `make web` — the target builds and previews the
   production bundle, which is what end-to-end verification should exercise.

   The port is load-bearing: `CORS_ORIGIN` in `apps/api/.env` pins
   `http://localhost:5173`, which is why `make web` passes `--strictPort`. On
   any other port the API rejects the preflight and every fetch surfaces as a
   generic network error, which reads exactly like an app bug and sends you
   chasing the wrong thing.

   That also makes this ritual a **production-bundle-only** check, which is a
   real blind spot: #21 rendered a blank page under `pnpm dev` while `make web`
   stayed green, because Rollup converts CommonJS itself and the dev server does
   not. `packages/shared/src/dist-exports.test.ts` is the guard for that class
   of break; if your slice changes how `packages/shared` is built, render at
   least one route under `pnpm dev` as well.

2. **Start the API separately** — `make api` in its own terminal, not root
   `pnpm dev`. Root `pnpm dev` is one supervisor over both apps: killing the web
   port to restart it takes the API down with it.

3. **Seed real data** with `make seed`, so the browser drives real UUIDs. It
   creates three polls and prints a vote and a results URL for each: one with no
   ballots, one with a single winner, one with a tie at the top and a trailing
   option.

   All three exist because a results page is in one of those states and
   verifying only the middle one leaves the others unproven — the tie is what
   exercises shared position ranges, and the empty poll is a different render
   path, not a table of zeroes.

   The ballots are not optional garnish: without them the results page renders
   all-zero scores and proves nothing. A ballot must rank every option, so the
   target builds `entries` in `python3` rather than in the shell — zsh does not
   word-split an unquoted variable, so collecting the option ids into a string
   and expanding it (`set -- $ids`) yields one argument, not N, and the API then
   rejects the ballot with a `400` that looks like a validation bug in the app.
   That trap is worth naming twice: it also catches you when you skip the target
   and hand-roll a fixture with `curl`.

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

   Under `pnpm dev` the dump carries the react-refresh preamble and the whole
   unbundled stylesheet ahead of the app markup — ~14 kB of it, against ~400
   bytes in the production bundle. Stripping the tags and reading the first
   lines therefore shows build noise, not the page: anchor on `id="root">`.

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

   What this proves is the _first paint_ of a route. `--dump-dom` loads, waits
   and prints once, so anything behind an interaction — a click, typed input, a
   permission prompt, `localStorage` carried across navigations — is invisible
   to it. A clean dump of every route is therefore not yet "verified end-to-end":
   interactive behaviour rests on the Vitest + RTL tests, and browser automation
   is out of MVP scope on purpose (`docs/11-testing-strategy.md`). Say which
   half you actually covered when you report.

6. **Read stderr too.** Console errors and CORS failures land there, not in the
   dumped DOM. An empty `<div id="root"></div>` plus an `Uncaught` line in stderr
   means the bundle failed to boot — the page is not "still loading".

7. **Cover the error paths,** not just the happy one: an unknown id (API `404`),
   a malformed URL, and at least one real record.

## Gotchas learned the hard way

- If the app misbehaves, check whether it also misbehaves on `main` before
  debugging your own diff: `git stash push -u`, render, `git stash pop`. This is
  how the blank-page bug (#21) was identified as pre-existing rather than
  caused by the slice.
- Coreutils sometimes resolve oddly inside loops and functions in this sandbox
  (`command not found: head`). It is not a short list of offenders — `rm`, `tr`
  and `wc` fail the same way. Use absolute paths (`/bin/rm`, `/usr/bin/head`,
  `/usr/bin/grep`, `/usr/bin/tr`, `/usr/bin/wc`) for every coreutil in a
  scripted render.
- Kill the servers when done: `make down`. If `make web` is running as a
  background job, expect it to report a _failure_ right after — `vite preview`
  is killed by the signal and exits `143`, which surfaces as
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` and a non-zero `make` status. That is the
  teardown, not a broken build; check the log for the `✓ built` line before
  spending a call on it.
