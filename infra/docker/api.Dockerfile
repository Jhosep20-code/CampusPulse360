# CampusPulse 360 - stack local SIN CONEXION (Worker + D1 local + SPA) para contingencia.
# workerd requiere glibc: se usa Debian slim (no Alpine).
# Build (desde la raiz): docker compose build
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@12.14.0 && apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# 1) Dependencias (capa cacheable: solo manifiestos y lockfile)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY tools/simulator/package.json tools/simulator/
RUN pnpm install --frozen-lockfile

# 2) Codigo y build de la SPA
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN pnpm --filter @campuspulse/web build

# 3) Ejecucion (wrangler dev en modo local; D1 persistido en volumen)
FROM build AS runtime
COPY infra/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh && mkdir -p /repo/apps/api/.wrangler && chown -R node:node /repo/apps/api
USER node
WORKDIR /repo/apps/api
EXPOSE 8787
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
