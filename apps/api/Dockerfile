FROM node:22.23.2-alpine3.24 AS base

ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/corepack
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && \
    corepack prepare pnpm@11.11.0 --activate && \
    chmod -R a+rX "$COREPACK_HOME"

WORKDIR /workspace

FROM base AS build-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=rank-vote-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --filter . --filter @rank-vote/api --filter @rank-vote/shared \
      --prod=false --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

FROM build-dependencies AS build

COPY apps/api apps/api
COPY packages/shared packages/shared

RUN pnpm --filter @rank-vote/api run prisma:generate && \
    pnpm --filter @rank-vote/shared run build:cjs && \
    pnpm --filter @rank-vote/api run build

FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,id=rank-vote-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --filter @rank-vote/api... --prod --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

FROM base AS runtime

ENV NODE_ENV=production

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml /workspace/
COPY --from=production-dependencies --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist /workspace/apps/api/dist
COPY --from=build --chown=node:node /workspace/packages/shared/dist /workspace/packages/shared/dist
COPY --chown=node:node apps/api/package.json /workspace/apps/api/package.json
COPY --chown=node:node apps/api/prisma.config.ts /workspace/apps/api/prisma.config.ts
COPY --chown=node:node apps/api/prisma /workspace/apps/api/prisma
COPY --chown=node:node packages/shared/package.json /workspace/packages/shared/package.json

WORKDIR /workspace/apps/api
USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
