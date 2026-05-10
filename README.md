# Visão360 — Gestão Predial Inteligente

Plataforma SaaS de inteligência operacional para facility management.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | NestJS + TypeScript + Prisma ORM |
| Banco | PostgreSQL 16 |
| Cache | Redis 7 |
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Mobile | React Native Expo (Etapa 4) |
| Auth | JWT (HS256) |
| Monorepo | Turborepo + npm workspaces |

## Início rápido

### 1. Pré-requisitos
- Node.js 20+
- Docker + Docker Compose
- npm 10+

### 2. Setup inicial

```bash
# Clone e instale dependências
cd visao360
npm install

# Copie e configure o .env
cp .env.example .env
# Edite .env com suas variáveis (JWT_SECRET obrigatório)

# Suba o PostgreSQL e Redis
npm run docker:up

# Gere o cliente Prisma
npm run db:generate

# Execute as migrações
npm run db:migrate

# Popule com dados de exemplo
npm run db:seed
```

### 3. Executar em desenvolvimento

```bash
# API (porta 3001) + Web (porta 3000) simultaneamente
npm run dev
```

Ou individualmente:
```bash
# Apenas API
cd apps/api && npm run dev

# Apenas Web
cd apps/web && npm run dev
```

## URLs

| Serviço | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/api/docs |
| Prisma Studio | `cd packages/database && npm run db:studio` |

## Credenciais de desenvolvimento

| Usuário | Email | Senha | Role |
|---------|-------|-------|------|
| Administrador | admin@visao360.com.br | admin@123 | ADMIN |
| Gestora | gestor@visao360.com.br | gestor@123 | GESTOR |
| Técnico | tecnico@visao360.com.br | tecnico@123 | TECNICO |

## Estrutura do monorepo

```
visao360/
├── apps/
│   ├── api/          ← NestJS backend (porta 3001)
│   ├── web/          ← Next.js 14 frontend (porta 3000)
│   └── mobile/       ← React Native Expo (Etapa 4)
├── packages/
│   ├── database/     ← Prisma schema + migrations + seed
│   ├── shared/       ← Tipos TypeScript e utilitários
│   └── ui/           ← Componentes React compartilhados
├── docker-compose.yml
└── turbo.json
```

## Autenticação (JWT multi-tenant)

**Fluxo de login:**
1. `GET /api/v1/auth/find-companies?email=...` — descobre as empresas do usuário
2. Usuário seleciona a empresa
3. `POST /api/v1/auth/login` com `{ email, password, companyId }`
4. Resposta: `{ accessToken, user }`
5. Usar `Authorization: Bearer <token>` em todas as requests

**RBAC:**
- `ADMIN` → acesso total
- `GESTOR` → gerencia unidades e equipe
- `TECNICO` → executa checklists e OS
- `CLIENTE` → visualiza relatórios

## Roadmap MVP

- [x] **Etapa 1** — Monorepo, Docker, Schema Prisma, Auth JWT multi-tenant
- [ ] **Etapa 2** — CRUD de assets/units/users, Checklists, Work Orders, Upload de fotos
- [ ] **Etapa 3** — Dashboard, Listagem de OSs e Checklists, QR Code
- [ ] **Etapa 4** — Mobile: scanner QR, câmera, assinatura digital
