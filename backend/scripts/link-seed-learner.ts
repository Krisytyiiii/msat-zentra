/**
 * Link a seeded (or any) student account to its class through the adviser
 * enlistment path — the same service the advisory desk uses, so the roster
 * row, its learner link code, and the profile placement are written exactly
 * as the app writes them.
 *
 * Usage:
 *   npx tsx scripts/link-seed-learner.ts --email=student.seed@zentra.test --section=Rizal
 *
 * Refuses to touch a learner that already belongs to another section in the
 * active school year.
 */
import { prisma } from "../src/lib/prisma.js";
import { resolveActiveTermId } from "../src/lib/term-resolve.js";
import { enlistRoster } from "../src/services/advisory/roster.service.js";
import { placementForStudent } from "../src/services/learnerLink.js";
import type { AdvisoryContext } from "../src/services/advisory/advisory.types.js";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

async function main() {
  const email = arg("email");
  const lrnArg = arg("lrn");
  const sectionName = arg("section");
  if (!email && !lrnArg) {
    throw new Error("Pass --email=... or --lrn=... (and optionally --section=...)");
  }

  const user = await prisma.user.findFirst({
    where: email ? { email } : { lrn: lrnArg },
    select: {
      id: true, email: true, fullName: true, role: true, status: true, lrn: true,
      studentProfile: { select: { sectionId: true, gradeLevel: true, lrn: true } },
    },
  });
  if (!user) throw new Error("No user found for that email/LRN");
  if (user.role !== "student") throw new Error(`Account role is ${user.role}, not student`);
  if (user.status !== "active") throw new Error(`Account status is ${user.status}, not active`);
  const lrn = user.lrn ?? user.studentProfile?.lrn;
  if (!lrn) throw new Error("Account has no LRN");

  const year = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!year) throw new Error("No active school year");

  const termId = await resolveActiveTermId();
  if (!termId) throw new Error("No active term");

  const grade = user.studentProfile?.gradeLevel;
  const section = await prisma.section.findFirst({
    where: {
      schoolYearId: year.id,
      ...(sectionName ? { name: { equals: sectionName, mode: "insensitive" } } : {}),
      ...(grade && !sectionName ? { gradeLevel: grade } : {}),
    },
    select: { id: true, name: true, gradeLevel: true, adviserId: true },
    orderBy: { name: "asc" },
  });
  if (!section) throw new Error("No matching section in the active school year");
  if (!section.adviserId) throw new Error(`Section ${section.name} has no adviser to enlist through`);

  const existing = await prisma.studentRoster.findUnique({
    where: { lrn_schoolYearId: { lrn, schoolYearId: year.id } },
    select: { id: true, linkCode: true, sectionId: true },
  });

  let linkCode = existing?.linkCode ?? null;
  let enlisted = false;
  if (!existing) {
    const ctx: AdvisoryContext = {
      userId: section.adviserId,
      role: "adviser",
      termId,
      schoolYearId: year.id,
    };
    const result = await enlistRoster(
      ctx,
      { fullName: user.fullName, lrn, sectionId: section.id, learnerType: "regular" },
      year.id,
    );
    enlisted = true;
    linkCode = result.linkCode ?? null;
  }

  const placement = await placementForStudent(user.id, year.id);
  console.log(JSON.stringify({
    user: { email: user.email, name: user.fullName, lrn, status: user.status },
    schoolYear: year.name,
    section: { id: section.id, name: section.name, gradeLevel: section.gradeLevel },
    enlisted,
    linkCode,
    placement,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
