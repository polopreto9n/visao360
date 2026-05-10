# Dockerfile raiz — Railway deploy da API NestJS + Prisma
# Usa node:20-slim (Debian) em vez de Alpine para compatibilidade com OpenSSL

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist  ./dist
COPY --from=builder /app/node_modules   ./node_modules

RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "dist/main"]
