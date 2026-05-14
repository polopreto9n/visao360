-- Migration: perf_indexes_audit_log_wo_unique
-- Adds: composite indexes for performance, AuditLog model, WorkOrder unique constraint fix

-- ─── WorkOrders: trocar @unique global por @@unique([code, companyId]) ─────────
-- Remove unique global para permitir mesmo código em empresas diferentes
ALTER TABLE "work_orders" DROP CONSTRAINT IF EXISTS "work_orders_code_key";

-- Adiciona unique composto por empresa (safe em produção)
CREATE UNIQUE INDEX IF NOT EXISTS "work_orders_code_companyId_key" ON "work_orders"("code", "companyId");

-- ─── Índices compostos para queries frequentes ─────────────────────────────────

-- work_orders: listagem com filtro de status por empresa
CREATE INDEX IF NOT EXISTS "work_orders_companyId_status_idx" ON "work_orders"("companyId", "status");
-- work_orders: "minhas OS" por assignee por empresa
CREATE INDEX IF NOT EXISTS "work_orders_companyId_assigneeId_idx" ON "work_orders"("companyId", "assigneeId");
-- work_orders: busca por responsável
CREATE INDEX IF NOT EXISTS "work_orders_assigneeId_idx" ON "work_orders"("assigneeId");
-- work_orders: queries de OS vencidas
CREATE INDEX IF NOT EXISTS "work_orders_dueDate_idx" ON "work_orders"("dueDate");

-- executions: dashboard e listagem por empresa+status
CREATE INDEX IF NOT EXISTS "executions_companyId_status_idx" ON "executions"("companyId", "status");
-- executions: "minhas execuções" por usuário
CREATE INDEX IF NOT EXISTS "executions_companyId_userId_idx" ON "executions"("companyId", "userId");
-- executions: queries por período (relatórios mensais)
CREATE INDEX IF NOT EXISTS "executions_completedAt_idx" ON "executions"("completedAt");

-- Drop índice simples de status em executions (substituído pelo composto)
DROP INDEX IF EXISTS "executions_status_idx";

-- notifications: "notificações não lidas" — query mais frequente
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
-- notifications: listagem cronológica
CREATE INDEX IF NOT EXISTS "notifications_createdAt_idx" ON "notifications"("createdAt");

-- Drop índice simples de isRead (substituído pelo composto)
DROP INDEX IF EXISTS "notifications_isRead_idx";

-- ─── AuditLog: rastreamento de ações críticas ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"         TEXT NOT NULL,
    "companyId"  TEXT,
    "userId"     TEXT,
    "action"     TEXT NOT NULL,
    "resource"   TEXT NOT NULL,
    "resourceId" TEXT,
    "statusCode" INTEGER,
    "ip"         TEXT,
    "userAgent"  TEXT,
    "durationMs" INTEGER,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_action_idx" ON "audit_logs"("resource", "action");
