# Thin facade over the pnpm scripts. Only targets that combine several steps or
# carry a load-bearing detail belong here; everything else stays a pnpm script.
# Kept compatible with GNU Make 3.81 (what macOS ships): no .ONESHELL and no
# .SHELLFLAGS, so multi-command recipes are chained with `&&`.

SHELL := /bin/bash

WEB_PORT ?= 5173
API_PORT ?= 3000
API_URL  ?= http://localhost:$(API_PORT)/api/v1

.DEFAULT_GOAL := help
.NOTPARALLEL:
.PHONY: help setup verify format format-check lint typecheck test build \
        web api seed render-app prune-merged down db-up db-migrate

help: ## List the available targets
	@awk -F':.*## ' '/^[a-z][a-z-]*:.*## /{printf "  \033[36m%-13s\033[0m%s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --- setup -------------------------------------------------------------------

setup: ## Install dependencies and create each app's .env from its .env.example
	corepack enable || echo "corepack enable failed; using the pnpm already on PATH"
	pnpm install
	@if test -f apps/api/.env; then \
		echo "warning: apps/api/.env already exists; setup left it unchanged. Check it against apps/api/.env.example."; \
	else \
		cp apps/api/.env.example apps/api/.env; \
	fi
	@if test -f apps/web/.env; then \
		echo "warning: apps/web/.env already exists; setup left it unchanged. Check it against apps/web/.env.example."; \
	else \
		cp apps/web/.env.example apps/web/.env; \
	fi

# --- gate --------------------------------------------------------------------
# Same steps in the same order as .github/workflows/ci.yml — green here is green
# there. Each step is also its own target, to re-run one without the whole gate.

verify: format-check lint typecheck test build ## Run the full gate (mirrors CI)
	@echo "gate: all steps passed"

format-check: ## Prettier, check only
	pnpm format:check

format: ## Prettier, write
	pnpm format

lint: ## ESLint across the workspace
	pnpm lint

typecheck: ## tsc per package
	pnpm typecheck

test: ## Node tooling + Jest (api) + Vitest (web, shared)
	pnpm test

build: ## Build every package
	pnpm build

# --- running the app ---------------------------------------------------------
# Root `pnpm dev` puts both apps under one supervisor, so restarting the web half
# kills the API. Hence two targets, meant for two terminals; `web` previews the
# production bundle, which is what end-to-end verification should exercise.
# WEB_PORT is load-bearing: CORS_ORIGIN in apps/api/.env pins it, and on any
# other port every fetch fails as a CORS error.

web: ## Build the web app and preview it on WEB_PORT (5173)
	pnpm --filter @rank-vote/web exec vite build && \
	pnpm --filter @rank-vote/web exec vite preview --port $(WEB_PORT) --strictPort

api: ## Run the API in watch mode on API_PORT (3000), in its own terminal
	pnpm --filter @rank-vote/api dev

# One python program rather than a curl pipeline: a ballot must rank every
# option, and building `entries` in the shell is how the ids get collapsed into
# a single argument (zsh does not word-split), which the API then rejects as a
# 400 that reads like an app bug. It seeds all three states a results page can
# be in — no ballots, one winner, a tie — because verifying only the middle one
# leaves the other two unproven.
define SEED_PY
import json, os, urllib.request

API = os.environ["API_URL"]
WEB = os.environ["WEB_BASE"]

def post(path, body):
    request = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)

def seed(label, title, options, rankings):
    poll = post("/polls", {"title": title, "options": options})
    ids = [option["id"] for option in poll["options"]]
    for ranking in rankings:
        post(
            "/polls/%s/ballots" % poll["id"],
            {"entries": [{"optionId": ids[o], "rank": r + 1} for r, o in enumerate(ranking)]},
        )
    print("%-13s %s/poll/%s/results" % (label + ":", WEB, poll["id"]))
    print("%-13s %s/poll/%s" % ("", WEB, poll["id"]))

# A tie needs opposing ballots: the first two options swap places and split the
# points, the third trails so the table also shows a position after the range.
seed("no ballots", "Dinner?", ["Ramen", "Tacos", "Pho"], [])
seed("one winner", "check", ["Alpha", "Beta"], [[0, 1]])
seed("tie", "Offsite city?", ["Lisbon", "Porto", "Faro"], [[0, 1, 2], [1, 0, 2]])
endef
export SEED_PY

seed: ## Seed three polls through the running API: no ballots, one winner, a tie
	@API_URL=$(API_URL) WEB_BASE=http://localhost:$(WEB_PORT) python3 -c "$$SEED_PY"

render-app: ## Dump rendered DOM for local URL=... (optional BROWSER_BIN=...)
	@test -n "$(URL)" || { echo "usage: make render-app URL=http://localhost:$(WEB_PORT)/<path>"; exit 2; }
	@node scripts/dump-dom.mjs "$(URL)"

prune-merged: ## Delete local branches whose PR is merged
	@git fetch --quiet --prune origin && \
	CURRENT=$$(git rev-parse --abbrev-ref HEAD) && \
	MERGED=$$(gh pr list --state merged --limit 300 --json headRefName -q '.[].headRefName') && \
	for BRANCH in $$(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v '^main$$'); do \
	  if [ "$$BRANCH" = "$$CURRENT" ]; then echo "kept:    $$BRANCH (checked out)"; \
	  elif echo "$$MERGED" | grep -qx "$$BRANCH"; then git branch -D "$$BRANCH" > /dev/null && echo "deleted: $$BRANCH"; \
	  else echo "kept:    $$BRANCH (no merged PR)"; fi; \
	done

down: ## Stop whatever is listening on the web and API ports
	@PIDS=$$(lsof -ti:$(WEB_PORT),$(API_PORT) || true); \
	if [ -n "$$PIDS" ]; then kill $$PIDS && echo "stopped: $$PIDS"; \
	else echo "nothing to stop on ports $(WEB_PORT) and $(API_PORT)"; fi

# --- database ----------------------------------------------------------------

db-up: ## Start the local PostgreSQL development and test databases
	docker compose up -d --wait postgres

db-migrate: ## Apply Prisma migrations to the local database
	pnpm --filter @rank-vote/api db:migrate
