-- Timetable configuration moves to the administrator desk and the Master
-- Teacher designation is retired.
ALTER TABLE "StaffProfile"
  DROP COLUMN IF EXISTS "isMasterTeacher",
  DROP COLUMN IF EXISTS "isMasterTeacherSenior";

-- Legacy submitted grids become published so teacher desks keep their classes
-- (publish now writes APPROVED directly).
UPDATE "SectionTimetableEntry" SET "status" = 'APPROVED' WHERE "status" = 'SUBMITTED';
