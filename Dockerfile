# Dockerfile raiz — Railway/production deploy da API NestJS + Prisma
# node:20-slim (Debian) para compatibilidade com OpenSSL do Prisma

# ── Stage 1: Dependencies ──────────────────────────────────────────────────────
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar apenas manifests para cache de camada de dependências
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json   ./packages/shared/
COPY packages/ui/package.json       ./packages/ui/
COPY apps/api/package.json          ./apps/api/

RUN npm install --legacy-peer-deps --prefer-offline

# ── Stage 2: Builder ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma && \
    cd apps/api && npx nest build

# ── Stage 3: Production ────────────────────────────────────────────────────────
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && \
    rm -rf /var/lib/apt/lists/*

# Non-root user — nunca rodar como root em produção
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nestjs

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copiar artefatos de build (apenas o necessário para runtime)
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist          ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules           ./node_modules
# Prisma schema + migrations — necessários para prisma migrate deploy
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./prisma
# Prisma client gerado
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma   ./node_modules/.prisma

# Diretório de uploads (fallback local — produção deve usar Supabase)
RUN mkdir -p uploads && chown nestjs:nodejs uploads

USER nestjs

EXPOSE 3001

# Health check — Railway/Kubernetes usam para saber se o container está pronto
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3001/api/v1/health || exit 1

# Executa migrations + inicia API
# migrate deploy é idempotente e seguro em multi-instância (usa advisory locks do PostgreSQL)
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma && node dist/main"]
