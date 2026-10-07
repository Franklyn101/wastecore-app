-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'ORDER_BALANCE';

-- AlterTable
ALTER TABLE "Collector" ADD COLUMN     "onDuty" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onDutySince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "bagsCollected" INTEGER,
ADD COLUMN     "collectorPay" INTEGER,
ADD COLUMN     "extraAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extraPaidAt" TIMESTAMP(3),
ADD COLUMN     "extraPaymentMethod" "PaymentMethod",
ADD COLUMN     "payoutId" TEXT;

-- CreateTable
CREATE TABLE "CollectorPayout" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "jobs" INTEGER NOT NULL,
    "note" TEXT,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectorPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectorPayout_collectorId_createdAt_idx" ON "CollectorPayout"("collectorId", "createdAt");

-- AddForeignKey
ALTER TABLE "CollectorPayout" ADD CONSTRAINT "CollectorPayout_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "Collector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CollectorPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

