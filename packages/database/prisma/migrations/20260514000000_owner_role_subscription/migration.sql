-- Migration: add OWNER role, Plan/SubscriptionStatus enums, subscription fields to Company
-- Safe: purely additive — nenhuma coluna existente é alterada ou removida

-- 1. Adicionar OWNER ao enum Role
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';

-- 2. Criar enum Plan
DO $$ BEGIN
  CREATE TYPE "Plan" AS ENUM ('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Criar enum SubscriptionStatus
DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Adicionar campos de assinatura à tabela companies
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "plan"                 "Plan"               NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS "subscriptionStatus"   "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS "trialEndsAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"     TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "currentPeriodEnd"     TIMESTAMP(3);

-- 5. Unique constraints para os IDs do Stripe
CREATE UNIQUE INDEX IF NOT EXISTS "companies_stripeCustomerId_key"
  ON "companies"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "companies_stripeSubscriptionId_key"
  ON "companies"("stripeSubscriptionId");

-- 6. Index para consultas de assinatura (scheduler, guards)
CREATE INDEX IF NOT EXISTS "companies_subscriptionStatus_idx"
  ON "companies"("subscriptionStatus");
