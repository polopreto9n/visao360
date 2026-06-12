-- Read receipts for dynamic operational alerts in the intelligent alert center.
CREATE TABLE "alert_reads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alert_reads_userId_fingerprint_key"
ON "alert_reads"("userId", "fingerprint");

CREATE INDEX "alert_reads_companyId_userId_idx"
ON "alert_reads"("companyId", "userId");

CREATE INDEX "alert_reads_fingerprint_idx"
ON "alert_reads"("fingerprint");

ALTER TABLE "alert_reads"
ADD CONSTRAINT "alert_reads_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_reads"
ADD CONSTRAINT "alert_reads_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
