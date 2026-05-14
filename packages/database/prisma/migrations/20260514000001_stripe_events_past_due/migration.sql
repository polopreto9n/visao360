-- Migration: tabela stripe_events (idempotência) + campo pastDueSince na Company

-- 1. Tabela de eventos Stripe processados — previne processamento duplo
CREATE TABLE IF NOT EXISTS "stripe_events" (
  "id"          TEXT        NOT NULL,  -- Stripe event ID (evt_xxx)
  "type"        TEXT        NOT NULL,
  "companyId"   TEXT,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stripe_events_companyId_idx"
  ON "stripe_events"("companyId");
CREATE INDEX IF NOT EXISTS "stripe_events_processedAt_idx"
  ON "stripe_events"("processedAt");

-- 2. Campo pastDueSince na Company — rastreia quando o status virou PAST_DUE
--    Usado pelo scheduler safety-net (PAST_DUE → SUSPENDED após 10 dias)
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "pastDueSince" TIMESTAMP(3);
