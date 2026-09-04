FROM node:22.23.2-alpine3.24 AS build

ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && \
    corepack prepare pnpm@11.11.0 --activate && \
    chmod -R a+rX "$COREPACK_HOME"

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=rank-vote-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --filter . --filter @rank-vote/web --filter @rank-vote/shared \
      --prod=false --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

COPY apps/web apps/web
COPY packages/shared packages/shared

ARG VITE_API_URL

RUN test -n "${VITE_API_URL:-}" || \
      { echo "VITE_API_URL build argument is required" >&2; exit 1; }; \
    node node_modules/typescript/bin/tsc -p packages/shared/tsconfig.build.esm.json && \
    echo '{"type":"module"}' > packages/shared/dist/esm/package.json && \
    cd apps/web && \
    node node_modules/typescript/bin/tsc -b && \
    VITE_API_URL="$VITE_API_URL" node node_modules/vite/bin/vite.js build

FROM nginx:1.31.4-alpine3.24 AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80
