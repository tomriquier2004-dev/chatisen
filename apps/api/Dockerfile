# syntax=docker/dockerfile:1
# Image de l'API (issue #12, NFR-07). Contexte de build : la RACINE du dépôt.
#   docker build -f apps/api/Dockerfile -t chatisen-api .
#
# Base épinglée par condensat : une mise à jour passe par Dependabot (voir .github/dependabot.yml).
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /repo
# pnpm à la version exacte de « packageManager » (package.json) : pas de désaccord avec la CI.
COPY package.json ./
RUN npm install --global "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
# Manifestes de tous les projets du workspace : le lockfile est vérifié contre eux (--frozen-lockfile).
COPY pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# --- Construction : dépendances de développement, puis bundle tsup (dist/server.js) -----------------
FROM base AS build
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @chatisen/api... --store-dir /pnpm/store
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @chatisen/api build

# --- Dépendances de production seulement ------------------------------------------------------------
# @chatisen/shared est inclus dans le bundle (tsup, noExternal) : seules ses métadonnées sont nécessaires.
FROM base AS prod-deps
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @chatisen/api... --store-dir /pnpm/store

# --- Exécution : image Node nue, sans npm ni pnpm, exécutée sans privilèges --------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# Ni npm ni corepack à l'exécution : seul « node » sert. Leurs dépendances embarquées (brace-expansion,
# pacote, picomatch…) font échouer le scan Trivy sans jamais être utilisées par l'API.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /repo
COPY --from=prod-deps /repo ./
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
