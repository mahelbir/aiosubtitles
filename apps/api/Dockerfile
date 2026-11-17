# Build from the REPO ROOT so the workspace (lockfile + @repo/shared) is visible:
#   docker build -f apps/api/Dockerfile .
FROM node:26-alpine AS build
COPY --from=ghcr.io/pnpm/pnpm:12-alpine /opt/pnpm /opt/pnpm
RUN for bin in pnpm pn pnpx pnx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
WORKDIR /repo

# pnpm comes from the root "packageManager" field, in its own cached layer.
COPY package.json ./
RUN pnpm --version

ENV PNPM_CONFIG_STORE_DIR=/pnpm-store
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/tooling/package.json packages/tooling/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline --filter api...

COPY packages/shared packages/shared
COPY packages/tooling packages/tooling
COPY apps/api apps/api

# Self-contained production bundle (workspace deps injected, dev deps dropped).
# Injection is scoped to this step so dev installs keep symlinking the workspace.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    PNPM_CONFIG_INJECT_WORKSPACE_PACKAGES=true pnpm --filter api deploy --prod /out \
    && date -u +%y%m%d.%H%M > /out/.revision

FROM node:26-alpine
ENV NODE_ENV=production

WORKDIR /app
COPY --from=build --chown=node:node /out .

# Storage seeding: keep pristine storage defaults; the entrypoint copies them
# into the (possibly empty) mounted host directory on every start.
RUN apk add --no-cache su-exec \
    && mkdir -p /app/storage /app/storage.default \
    && cp -a /app/storage/. /app/storage.default/ \
    && chown -R node:node /app

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
