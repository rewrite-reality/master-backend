-- CreateEnum
CREATE TYPE "PayoutType" AS ENUM ('EARNING', 'ADJUSTMENT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('POSTED', 'REVERSED');

-- AlterTable
ALTER TABLE "master_profiles" ADD COLUMN     "payoutPercent" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "masterId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "PayoutType" NOT NULL DEFAULT 'EARNING',
    "status" "PayoutStatus" NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(10,2) NOT NULL,
    "percent" INTEGER NOT NULL,
    "meta" JSONB,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payouts_masterId_createdAt_idx" ON "payouts"("masterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_orderId_key" ON "payouts"("orderId");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
