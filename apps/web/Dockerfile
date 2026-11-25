# syntax=docker/dockerfile:1
# Image du client : build Vite servi par Caddy (issue #12, ADR-0016). Contexte de build : la RACINE du dépôt.
#   docker build -f apps/web/Dockerfile -t chatisen-web .
#
# L'image contient Caddy et le build statique dans /srv/web. Le Caddyfile n'est PAS dans l'image : le
# Compose de déploiement monte infra/caddy/Caddyfile, qui reste la configuration relue en PR.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb
ARG CADDY_IMAGE=caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /repo
COPY package.json ./
RUN npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
COPY pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @chatisen/web... --store-dir /pnpm/store
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @chatisen/web build

FROM ${CADDY_IMAGE} AS runtime
COPY --from=build /repo/apps/web/dist /srv/web
