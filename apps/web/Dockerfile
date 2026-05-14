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
    # Patch: substitui a linha inteira de hostname independente do formato
    # Docker sobrescreve process.env.HOSTNAME com hostname interno do container,
    # tornando-o inacessivel externamente. Hardcodamos 0.0.0.0 direto no binario.
    find .next/standalone -name "server.js" ! -path "*/node_modules/*" \
        -exec sed -i "s/const hostname = .*/const hostname = '0.0.0.0';/" {} \; && \
    # Verificacao: falha o build se o patch nao funcionou
    grep -q "const hostname = '0.0.0.0'" .next/standalone/apps/web/server.js || \
        (echo "PATCH FAILED: hostname not patched" && exit 1)

# ── Stage 3: Production ───────────────────────────────────────────────────────
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends wget && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

# Standalone inclui apps/web/.next/server/ + node_modules otimizados
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Static files: devem ficar em apps/web/.next/static/ (relativo ao server.js)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# Public: relativo ao server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD wget -qO- http://localhost:3000 || exit 1

# WORKDIR /app — CMD compativel com Custom Start Command no Railway dashboard
# (node apps/web/server.js a partir de /app)
CMD ["node", "apps/web/server.js"]
