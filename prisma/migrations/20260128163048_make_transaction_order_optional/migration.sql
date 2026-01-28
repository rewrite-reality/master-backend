-- AlterTable
ALTER TABLE "master_profiles" ALTER COLUMN "debtLimit" SET DEFAULT 5000;

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "orderId" DROP NOT NULL;
