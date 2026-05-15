-- AddColumn: expectedAnswer in checklist_items
-- Default true = resposta esperada é SIM (backwards compatible com dados existentes)
ALTER TABLE "checklist_items" ADD COLUMN "expectedAnswer" BOOLEAN NOT NULL DEFAULT true;
