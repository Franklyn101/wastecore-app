-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "wastecoreBags" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wastedTrip" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

