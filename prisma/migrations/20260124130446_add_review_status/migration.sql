-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REVIEW';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "proofPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[];
