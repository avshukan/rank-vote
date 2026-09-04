#!/usr/bin/env bash
set -euo pipefail

readonly PROJECT_NAME="rank-vote-smoke-$$"
readonly POSTGRES_PORT="${RANK_VOTE_POSTGRES_PORT:-55432}"
readonly API_PORT="${RANK_VOTE_API_PORT:-53000}"
readonly WEB_PORT="${RANK_VOTE_WEB_PORT:-55173}"
readonly HEALTH_URL="http://localhost:$API_PORT/api/v1/health"
readonly WEB_URL="http://localhost:$WEB_PORT"
readonly NESTED_ROUTE='/poll/00000000-0000-0000-0000-000000000000/results'

export RANK_VOTE_POSTGRES_PORT="$POSTGRES_PORT"
export RANK_VOTE_API_PORT="$API_PORT"
export RANK_VOTE_WEB_PORT="$WEB_PORT"
export VITE_API_URL="http://localhost:$API_PORT/api/v1"
export CORS_ORIGIN="http://localhost:$WEB_PORT"
export COMPOSE_PARALLEL_LIMIT=1

ROOT_HTML=$(mktemp)
NESTED_HTML=$(mktemp)
ROOT_HEADERS=$(mktemp)
ASSET_HEADERS=$(mktemp)
FAVICON_HEADERS=$(mktemp)
MISSING_ARGUMENT_LOG=$(mktemp)

cleanup() {
  docker compose --project-name "$PROJECT_NAME" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ROOT_HTML" "$NESTED_HTML" "$ROOT_HEADERS" "$ASSET_HEADERS" \
    "$FAVICON_HEADERS" "$MISSING_ARGUMENT_LOG"
}
trap cleanup EXIT

compose() {
  docker compose --project-name "$PROJECT_NAME" "$@"
}

echo 'container smoke: validate Compose model'
compose config --quiet

echo 'container smoke: build API and web images'
compose build api web

echo 'container smoke: reject a web build without VITE_API_URL'
if docker build --file apps/web/Dockerfile --progress=plain . >"$MISSING_ARGUMENT_LOG" 2>&1; then
  echo 'web image unexpectedly built without VITE_API_URL' >&2
  exit 1
fi
grep -q 'VITE_API_URL build argument is required' "$MISSING_ARGUMENT_LOG"

echo 'container smoke: start an isolated stack with fresh PostgreSQL storage'
compose up --detach --wait --wait-timeout 180

MIGRATE_CONTAINER=$(compose ps --all --quiet migrate)
test -n "$MIGRATE_CONTAINER"
test "$(docker inspect --format '{{.State.ExitCode}}' "$MIGRATE_CONTAINER")" = '0'

echo 'container smoke: prove migrations are idempotent'
compose run --rm --no-deps migrate

echo 'container smoke: check the API runtime contains deployable artifacts'
compose run --rm --no-deps --entrypoint sh api -c \
  'test "$(pnpm --version)" = 11.11.0 && test -f dist/main.js && \
   test -f ../../packages/shared/dist/index.js && \
   test -f prisma/schema.prisma && test -f prisma.config.ts && test ! -e src'

echo 'container smoke: check API liveness and a product request'
test "$(curl --fail --silent --show-error "$HEALTH_URL")" = '{"status":"ok"}'
POLL_RESPONSE=$(
  curl --fail --silent --show-error \
    --header 'Content-Type: application/json' \
    --data '{"title":"Container smoke","options":["Alpha","Beta"]}' \
    "http://localhost:$API_PORT/api/v1/polls"
)
grep -q '"title":"Container smoke"' <<<"$POLL_RESPONSE"

echo 'container smoke: check nginx, SPA fallback, and cache policy'
curl --fail --silent --show-error --dump-header "$ROOT_HEADERS" "$WEB_URL/" --output "$ROOT_HTML"
curl --fail --silent --show-error "$WEB_URL$NESTED_ROUTE" --output "$NESTED_HTML"
cmp --silent "$ROOT_HTML" "$NESTED_HTML"
grep -q '<div id="root"></div>' "$ROOT_HTML"
grep -Eiq '^cache-control: no-cache' "$ROOT_HEADERS"

ASSET_PATH=$(sed -n 's#.*src="\(/assets/[^"?]*\.js\)".*#\1#p' "$ROOT_HTML" | head -n 1)
test -n "$ASSET_PATH"
curl --fail --silent --show-error --head "$WEB_URL$ASSET_PATH" >"$ASSET_HEADERS"
grep -Eiq '^cache-control: public, max-age=31536000, immutable' "$ASSET_HEADERS"

curl --fail --silent --show-error --head "$WEB_URL/favicon.svg" >"$FAVICON_HEADERS"
if grep -Eiq '^cache-control:.*immutable' "$FAVICON_HEADERS"; then
  echo 'unhashed root asset received immutable caching' >&2
  exit 1
fi

echo 'container smoke: check the web runtime contains static files only'
compose exec --no-TTY web sh -c \
  'test ! -e /workspace && ! command -v node >/dev/null && ! command -v pnpm >/dev/null'

echo 'container smoke: passed'
