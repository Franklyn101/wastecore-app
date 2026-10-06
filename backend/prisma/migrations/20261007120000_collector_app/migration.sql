-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COLLECTOR';

-- AlterTable
ALTER TABLE "Collector" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "collectorNote" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "onTheWayAt" TIMESTAMP(3),
ADD COLUMN     "proofPhotoUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Collector_userId_key" ON "Collector"("userId");

-- AddForeignKey
ALTER TABLE "Collector" ADD CONSTRAINT "Collector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

