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
        web api seed down db-migrate

help: ## List the available targets
	@awk -F':.*## ' '/^[a-z][a-z-]*:.*## /{printf "  \033[36m%-13s\033[0m%s\n", $$1, $$2}' $(MAKEFILE_LIST)

# --- setup -------------------------------------------------------------------

setup: ## Install dependencies and create each app's .env from its .env.example
	corepack enable || echo "corepack enable failed; using the pnpm already on PATH"
	pnpm install
	test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
	test -f apps/web/.env || cp apps/web/.env.example apps/web/.env

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

test: ## Jest (api) + Vitest (web, shared)
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

seed: ## Create a poll with one full ballot through the running API
	@POLL_ID=$$(curl -sS -X POST $(API_URL)/polls \
	    -H 'Content-Type: application/json' \
	    -d '{"title":"check","options":["Alpha","Beta"]}' \
	  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])') && \
	curl -sS "$(API_URL)/polls/$$POLL_ID" \
	  | python3 -c 'import sys,json; o=json.load(sys.stdin)["options"]; print(json.dumps({"entries":[{"optionId":x["id"],"rank":i+1} for i,x in enumerate(o)]}))' \
	  | curl -sS -X POST "$(API_URL)/polls/$$POLL_ID/ballots" \
	      -H 'Content-Type: application/json' -d @- > /dev/null && \
	echo "vote:    http://localhost:$(WEB_PORT)/poll/$$POLL_ID" && \
	echo "results: http://localhost:$(WEB_PORT)/poll/$$POLL_ID/results"

down: ## Stop whatever is listening on the web and API ports
	@PIDS=$$(lsof -ti:$(WEB_PORT),$(API_PORT) || true); \
	if [ -n "$$PIDS" ]; then kill $$PIDS && echo "stopped: $$PIDS"; \
	else echo "nothing to stop on ports $(WEB_PORT) and $(API_PORT)"; fi

# --- database ----------------------------------------------------------------

db-migrate: ## Apply Prisma migrations to the local database
	pnpm --filter @rank-vote/api db:migrate
