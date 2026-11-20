-- Day-shape presets move from one row per Term to many named rows per SchoolYear.
-- Existing per-term rows are kept as presets named after their term, and one
-- preset per year is promoted to `isActive` so live timetables keep their shape.

ALTER TABLE "ScheduleConfig" ADD COLUMN "schoolYearId" TEXT;
ALTER TABLE "ScheduleConfig" ADD COLUMN "name" TEXT;
ALTER TABLE "ScheduleConfig" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ScheduleConfig" sc
SET "schoolYearId" = t."schoolYearId",
    "name" = 'Term ' || t."termNumber" || ' schedule'
FROM "Term" t
WHERE sc."termId" = t.id;

-- Orphan rows (their term is gone) cannot be placed in a year; drop them.
DELETE FROM "ScheduleConfig" WHERE "schoolYearId" IS NULL;

-- Exactly one active preset per school year, preferring the earliest term.
UPDATE "ScheduleConfig" sc
SET "isActive" = true
WHERE sc.id IN (
  SELECT DISTINCT ON ("schoolYearId") id
  FROM "ScheduleConfig"
  ORDER BY "schoolYearId", "name" ASC, id ASC
);

ALTER TABLE "ScheduleConfig" ALTER COLUMN "name" SET DEFAULT 'Default';
ALTER TABLE "ScheduleConfig" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "ScheduleConfig" ALTER COLUMN "schoolYearId" SET NOT NULL;

ALTER TABLE "ScheduleConfig" DROP CONSTRAINT IF EXISTS "ScheduleConfig_termId_fkey";
ALTER TABLE "ScheduleConfig" DROP CONSTRAINT IF EXISTS "ScheduleConfig_termId_key";
ALTER TABLE "ScheduleConfig" DROP COLUMN "termId";

ALTER TABLE "ScheduleConfig"
  ADD CONSTRAINT "ScheduleConfig_schoolYearId_fkey"
  FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ScheduleConfig_schoolYearId_name_key" ON "ScheduleConfig"("schoolYearId", "name");
CREATE INDEX "ScheduleConfig_schoolYearId_idx" ON "ScheduleConfig"("schoolYearId");
