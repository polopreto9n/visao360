# Dockerfile raiz do monorepo — usado pelo Railway para deploy da API
# Faz build do NestJS a partir do contexto completo do monorepo

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json   ./packages/shared/
COPY packages/ui/package.json       ./packages/ui/
COPY apps/api/package.json          ./apps/api/

RUN npm install --legacy-peer-deps

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN cd apps/api && npx nest build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist       ./dist
COPY --from=builder /app/node_modules        ./node_modules
COPY --from=builder /app/packages/database/prisma ./prisma

RUN mkdir -p uploads

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/v1/health || exit 1

CMD ["node", "dist/main"]
