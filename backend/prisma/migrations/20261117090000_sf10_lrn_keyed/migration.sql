-- SF10 store is LRN-keyed, independent of learner accounts.
--
-- An SF10 upload is storage + extraction, never enrolment: the file carries
-- its own LRN and the record lives as `Sf10Record(lrn, desk)` whether or not
-- that LRN has a `StudentProfile`/`StudentRoster` row. Nothing is created on
-- upload, and the record is matched later by LRN when an adviser requests
-- access through the adviser-access desk.
--
-- Safe to re-run: every step is guarded.

ALTER TABLE "Sf10Record" ADD COLUMN IF NOT EXISTS "lrn" TEXT;
ALTER TABLE "Sf10Record" ADD COLUMN IF NOT EXISTS "learnerName" TEXT;
ALTER TABLE "Sf10Record" ADD COLUMN IF NOT EXISTS "gradeLevel" "GradeLevel";

-- Backfill from the account the old FK pointed at (legacy rows only).
UPDATE "Sf10Record" r
SET "lrn" = s."lrn",
    "learnerName" = COALESCE(r."learnerName", u."fullName"),
    "gradeLevel" = COALESCE(r."gradeLevel", s."gradeLevel")
FROM "StudentProfile" s
JOIN "User" u ON u."id" = s."userId"
WHERE r."studentId" = s."userId"
  AND r."lrn" IS NULL;

-- A record with no LRN has no identity and cannot be matched by any request.
DELETE FROM "Sf10Record" WHERE "lrn" IS NULL;

ALTER TABLE "Sf10Record" ALTER COLUMN "lrn" SET NOT NULL;

-- Per-desk storage keyed by LRN (one file per learner per desk).
ALTER TABLE "Sf10Record" DROP CONSTRAINT IF EXISTS "Sf10Record_studentId_desk_key";
DROP INDEX IF EXISTS "Sf10Record_studentId_desk_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Sf10Record_lrn_desk_key" ON "Sf10Record"("lrn", "desk");
CREATE INDEX IF NOT EXISTS "Sf10Record_lrn_idx" ON "Sf10Record"("lrn");

-- Drop the account link: an SF10 is a stored file, not a profile relation.
ALTER TABLE "Sf10Record" DROP CONSTRAINT IF EXISTS "Sf10Record_studentId_fkey";
ALTER TABLE "Sf10Record" DROP COLUMN IF EXISTS "studentId";
