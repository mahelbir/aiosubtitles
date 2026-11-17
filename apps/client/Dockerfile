FROM node:26-alpine AS build
COPY --from=ghcr.io/pnpm/pnpm:12-alpine /opt/pnpm /opt/pnpm
RUN for bin in pnpm pn pnpx pnx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
WORKDIR /repo

# pnpm comes from the root "packageManager" field, in its own cached layer.
COPY package.json ./
RUN pnpm --version

ENV PNPM_CONFIG_STORE_DIR=/pnpm-store
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
COPY packages/tooling/package.json packages/tooling/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --prefer-offline --filter client...

COPY packages/shared packages/shared
COPY packages/tooling packages/tooling
COPY apps/client apps/client

ENV NEXT_TELEMETRY_DISABLED=1

# The image has no .git, so the version is stamped here — in the build step
# itself, so it is recomputed exactly when the build is. The root .env is
# optional — a platform may pass its values as build args instead — and is
# linked from the mounted context for this step only, so no layer keeps it.
RUN --mount=type=bind,target=/context \
    if [ -f /context/.env ]; then ln -s /context/.env .env; fi \
    && APP_VERSION="$(date -u +%y%m%d.%H%M)" pnpm --filter client build \
    && rm -f .env \
    && mkdir -p apps/client/public \
    && cp -r apps/client/public apps/client/.next/standalone/apps/client/ \
    && cp -r apps/client/.next/static apps/client/.next/standalone/apps/client/.next/

FROM node:26-alpine
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/client/.next/standalone ./

USER node
CMD ["node", "apps/client/server.js"]
