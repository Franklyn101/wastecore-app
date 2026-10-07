-- Password reset codes become general one-time codes (password reset and phone verification).
CREATE TYPE "CodePurpose" AS ENUM ('PASSWORD_RESET', 'PHONE_VERIFY');

ALTER TABLE "PasswordReset" RENAME TO "OneTimeCode";
ALTER TABLE "OneTimeCode" RENAME CONSTRAINT "PasswordReset_pkey" TO "OneTimeCode_pkey";
ALTER TABLE "OneTimeCode" RENAME CONSTRAINT "PasswordReset_userId_fkey" TO "OneTimeCode_userId_fkey";
ALTER TABLE "OneTimeCode" ADD COLUMN "purpose" "CodePurpose" NOT NULL DEFAULT 'PASSWORD_RESET';
ALTER TABLE "OneTimeCode" ALTER COLUMN "purpose" DROP DEFAULT;
DROP INDEX "PasswordReset_userId_createdAt_idx";
CREATE INDEX "OneTimeCode_userId_purpose_createdAt_idx" ON "OneTimeCode"("userId", "purpose", "createdAt");

-- Phone verification. Accounts that existed before it are treated as verified.
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "phoneVerifiedAt" = "createdAt";
