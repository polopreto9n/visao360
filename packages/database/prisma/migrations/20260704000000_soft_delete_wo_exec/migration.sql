-- AlterTable: add soft-delete column to work_orders
ALTER TABLE "work_orders" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: add soft-delete column to executions
ALTER TABLE "executions" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex: composite index for companyId + deletedAt on work_orders
CREATE INDEX "work_orders_companyId_deletedAt_idx" ON "work_orders"("companyId", "deletedAt");

-- CreateIndex: composite index for companyId + deletedAt on executions
CREATE INDEX "executions_companyId_deletedAt_idx" ON "executions"("companyId", "deletedAt");
