-- AddColumns: releaseBeforeDays and toleranceDays in checklist_schedules
-- releaseBeforeDays: quantos dias antes do vencimento o checklist fica disponível (default 3)
-- toleranceDays: dias de tolerância após o vencimento antes de expirar (default 2)
ALTER TABLE "checklist_schedules" ADD COLUMN "releaseBeforeDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "checklist_schedules" ADD COLUMN "toleranceDays" INTEGER NOT NULL DEFAULT 2;
