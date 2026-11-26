-- Administrator-declared "no class" dates. Attendance denominators and the
-- auto-absent sweep skip these meetups; teachers cannot submit a sheet for
-- them. `scope` cancels the whole day or only one half (periods before lunch
-- are AM).

CREATE TYPE "NoClassScope" AS ENUM ('whole_day', 'am', 'pm');

CREATE TABLE "NoClassDay" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "scope" "NoClassScope" NOT NULL DEFAULT 'whole_day',
  "reason" TEXT NOT NULL,
  "schoolYearId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NoClassDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoClassDay_date_key" ON "NoClassDay"("date");
CREATE INDEX "NoClassDay_schoolYearId_date_idx" ON "NoClassDay"("schoolYearId", "date");

ALTER TABLE "NoClassDay"
  ADD CONSTRAINT "NoClassDay_schoolYearId_fkey"
  FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'no_class_day_create';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'no_class_day_update';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'no_class_day_delete';
