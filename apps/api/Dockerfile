# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifests primeiro (otimiza cache de layers)
COPY package*.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copiar packages
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

# Copiar app
COPY apps/api/package.json ./apps/api/

# Instalar dependências
RUN npm install --legacy-peer-deps

# Copiar código-fonte
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Gerar Prisma client e compilar
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN cd apps/api && npx nest build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copiar apenas o necessário
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/prisma ./prisma

# Criar diretório de uploads
RUN mkdir -p uploads

# Usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main"]
