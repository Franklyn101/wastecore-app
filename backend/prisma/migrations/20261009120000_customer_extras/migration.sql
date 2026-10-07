-- CreateEnum
CREATE TYPE "TimeWindow" AS ENUM ('MORNING', 'AFTERNOON');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingComment" TEXT,
ADD COLUMN     "skippedAt" TIMESTAMP(3),
ADD COLUMN     "timeWindow" "TimeWindow";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "timeWindow" "TimeWindow";

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "orderId" TEXT;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

