-- AlterTable
ALTER TABLE "Collector" ADD COLUMN     "approvedAt" TIMESTAMP(3);


-- Collectors that existed before self sign-up were all added by staff.
UPDATE "Collector" SET "approvedAt" = "createdAt";
