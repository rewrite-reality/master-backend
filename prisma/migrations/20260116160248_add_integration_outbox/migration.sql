-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('AMOCRM');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxEventType" AS ENUM ('AMOCRM_LEAD_MOVE');

-- CreateTable
CREATE TABLE "integration_outbox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "type" "OutboxEventType" NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT NOT NULL,
    "amoLeadId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "integration_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_outbox_dedupeKey_key" ON "integration_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "integration_outbox_status_nextRetryAt_idx" ON "integration_outbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "integration_outbox_orderId_idx" ON "integration_outbox"("orderId");

-- AddForeignKey
ALTER TABLE "integration_outbox" ADD CONSTRAINT "integration_outbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
