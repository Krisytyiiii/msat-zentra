-- Subject categories now follow DepEd's SHS classification: CORE / APPLIED /
-- SPECIALIZED. The old ELECTIVE value becomes SPECIALIZED (the strand-specific
-- subjects it was used for); Applied is the only new value.
ALTER TYPE "SubjectCategory" RENAME VALUE 'ELECTIVE' TO 'SPECIALIZED';
ALTER TYPE "SubjectCategory" ADD VALUE IF NOT EXISTS 'APPLIED';
