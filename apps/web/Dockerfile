# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/web/package.json ./apps/web/

RUN npm install --legacy-peer-deps

# ── Stage 2: Builder ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=https://visao360-api-production.up.railway.app/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN mkdir -p apps/web/public && \
    cd apps/web && \
    npx next build && \
    # Patch server.js: hardcoda 0.0.0.0 para que o servidor ouça em todas
    # as interfaces. Docker sobrescreve process.env.HOSTNAME com o hostname
    # do container, então não podemos usar env var para isso.
    sed -i "s/process\.env\.HOSTNAME || '0\.0\.0\.0'/'0.0.0.0'/g" \
        .next/standalone/apps/web/server.js

# ── Stage 3: Production ───────────────────────────────────────────────────────
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends wget && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

# Standalone preserva estrutura do monorepo: apps/web/server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Arquivos estáticos devem ficar em apps/web/.next/static (relativo ao server.js)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# Pasta public relativa ao server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

# WORKDIR no diretório do server.js para CMD limpo
WORKDIR /app/apps/web

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server.js"]
