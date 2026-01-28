-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('FEE_ACCRUAL', 'DEBT_PAYMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "master_profiles" ADD COLUMN     "debt" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "debtLimit" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "isBlockedByDebt" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "masterId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "externalPaymentId" TEXT,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_masterId_createdAt_idx" ON "transactions"("masterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_orderId_type_key" ON "transactions"("orderId", "type");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "master_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
