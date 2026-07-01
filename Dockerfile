# syntax=docker/dockerfile:1
#
# Multi-stage build for the bundled app (API + SSR frontend on one port).
#
#   build   — full workspace install + `pnpm build` (compiles both apps).
#   runtime — production-only install (drops vite/typescript/eslint/@types/…),
#             regenerates the Prisma client, and copies just the built output
#             plus the small web runtime entry. This is the final image.
#
# The runtime image still needs a few packages that are "dev" tooling elsewhere
# but are required to run: tsx (runs the web server), sirv/compression (prod
# static serving), http-proxy-middleware (the API proxies the frontend), the
# prisma CLI (boot-time `prisma db push`) and concurrently (runs both processes).
# Those live in "dependencies", so `--prod` keeps them.
#
# Required at runtime (pass with `-e` / compose `environment`):
#   DATABASE_URL, JWT_SECRET   (optional: WEB_ORIGIN, WEB_URL)

FROM node:24-alpine AS base
# OpenSSL + CA certs are needed by Prisma's query/schema engines (musl build).
RUN apk add --no-cache openssl ca-certificates
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- build stage: all deps + compile both apps ---
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- runtime stage: production deps only ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
# No Prisma CLI in this image, so the app must not self-migrate on boot. Schema
# sync runs as a separate one-shot step (the `migrate` service in compose.yml).
ENV AUTO_MIGRATE=false

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Prisma schema/config are needed to generate the client during install.
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/

# Install prod deps, generate the client, then strip the Prisma CLI + Studio/dev
# packages — all in ONE layer so the removal actually shrinks the image (an `rm`
# in a later layer wouldn't). `@prisma/client` + the query engine stay; only the
# CLI tooling (used at build time for `generate`, and by the migrate step) goes.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile \
 && pnpm --filter server exec prisma generate \
 && rm -rf \
      node_modules/.pnpm/prisma@* \
      node_modules/.pnpm/@prisma+studio-core@* \
      node_modules/.pnpm/@prisma+dev@* \
      node_modules/.pnpm/@electric-sql+pglite@* \
      node_modules/.pnpm/@rolldown+* \
      node_modules/.bin/prisma \
      apps/server/node_modules/prisma \
      apps/server/node_modules/.bin/prisma

# Built output from the build stage.
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist

# Web runtime entry: server.ts (run by tsx) + the one self-contained module it
# imports. No other source is shipped.
COPY apps/web/server.ts apps/web/
COPY apps/web/src/lib/error-page.ts apps/web/src/lib/error-page.ts

EXPOSE 3000

# `pnpm start` runs both processes via concurrently: API on :3000 (front door)
# and the web SSR server on :4000 (proxied through the API).
CMD ["pnpm", "start"]
