-- CreateTable
CREATE TABLE "checklist_schedules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "assetId" TEXT,
    "assigneeId" TEXT,
    "name" TEXT,
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "repeatDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_schedules_companyId_idx" ON "checklist_schedules"("companyId");

-- CreateIndex
CREATE INDEX "checklist_schedules_assigneeId_idx" ON "checklist_schedules"("assigneeId");

-- CreateIndex
CREATE INDEX "checklist_schedules_nextDueAt_idx" ON "checklist_schedules"("nextDueAt");

-- AddForeignKey
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_schedules" ADD CONSTRAINT "checklist_schedules_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
