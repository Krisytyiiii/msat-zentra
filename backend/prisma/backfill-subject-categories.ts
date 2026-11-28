/**
 * Migrate `Subject.category` to the DepEd SHS classification
 * (CORE / APPLIED / SPECIALIZED) and classify every existing subject.
 *
 * Applies the same two DDL statements as
 * `migrations/20261127090000_subject_category_applied_specialized` (the repo
 * applies migrations by hand — `migrate deploy` cannot bootstrap this DB), then
 * backfills names whose stored value is still the default CORE where the DepEd
 * subject matrix says otherwise. Idempotent: safe to re-run.
 *
 *   npm run prisma:backfill:subject-categories
 */
import { prisma } from "../src/lib/prisma.js";
import {
  knownSubjectCategory,
  normalizeSubjectCategory,
} from "../src/services/sf10/subject-category.js";

async function enumLabels(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
    `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'SubjectCategory'`,
  );
  return rows.map((r) => r.enumlabel);
}

async function main(): Promise<void> {
  let labels = await enumLabels();
  if (labels.includes("ELECTIVE")) {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "SubjectCategory" RENAME VALUE 'ELECTIVE' TO 'SPECIALIZED'`,
    );
    console.log("renamed enum value ELECTIVE -> SPECIALIZED");
  }
  labels = await enumLabels();
  if (!labels.includes("APPLIED")) {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "SubjectCategory" ADD VALUE IF NOT EXISTS 'APPLIED'`,
    );
    console.log("added enum value APPLIED");
  }
  console.log("enum values:", (await enumLabels()).join(", "));

  const subjects = await prisma.subject.findMany({
    select: { id: true, name: true, gradeLevel: true, category: true },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
  });

  let changed = 0;
  for (const subject of subjects) {
    const current = normalizeSubjectCategory(subject.category) ?? "CORE";
    // Only override a name the matrix recognises; an unknown SHS subject
    // defaults to Specialized (strand-specific), an unknown JHS one to Core.
    const desired =
      knownSubjectCategory(subject.name) ??
      (subject.gradeLevel === "G11" || subject.gradeLevel === "G12" ? "SPECIALIZED" : "CORE");
    if (current === desired) continue;
    await prisma.subject.update({
      where: { id: subject.id },
      data: { category: desired },
    });
    changed += 1;
    console.log(`  ${subject.gradeLevel} ${subject.name}: ${current} -> ${desired}`);
  }
  console.log(`${changed} subject(s) reclassified, ${subjects.length} checked`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
