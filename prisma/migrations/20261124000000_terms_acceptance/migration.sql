-- Clickwrap acceptance record for the published Terms of Service.
-- Nullable: existing accounts are not retroactively presumed to have accepted,
-- and OAuth-created accounts have no consent step yet.
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
