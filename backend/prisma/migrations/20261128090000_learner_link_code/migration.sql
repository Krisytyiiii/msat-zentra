-- School-issued learner link codes on the per-year roster row.
-- Additive only: existing rows keep NULL until minted or backfilled.
ALTER TABLE "StudentRoster" ADD COLUMN "linkCode" TEXT;
ALTER TABLE "StudentRoster" ADD COLUMN "linkCodeIssuedAt" TIMESTAMP(3);
ALTER TABLE "StudentRoster" ADD COLUMN "linkCodeRevokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "StudentRoster_linkCode_key" ON "StudentRoster"("linkCode");
