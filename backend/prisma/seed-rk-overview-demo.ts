import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

/**
 * Tiny record-keeper overview demo seed:
 *   1. one pending G7 student account (Accounts queue + Pending students tile),
 *   2. one adviser-approved final grade for that learner (Final grade approvals),
 *   3. one pending adviser SF10 access request for the G7 section (SF10 chart).
 *
 * Idempotent — the account is keyed by email/LRN, the final grade by its unique
 * (student, subject, term) tuple, and the access request by adviser+section+
 * reason. Safe to re-run; the request's `requestedAt` is refreshed so it lands
 * in today's chart bucket.
 *
 * Run: npm run prisma:seed:rk-overview-demo
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const PASSWORD = "Student2025!";
const EMAIL = "136120269901@pending.students.zentra.test";
const LRN = "136120269901";
const STUDENT_NAME = "Mikaela Joy Ramos";
const REASON = "SF10 access for advisory records (demo seed)";

async function main() {
  // ---- School context -----------------------------------------------------
  const schoolYear = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!schoolYear) throw new Error("No active school year — run the base seed first.");

  const term = await prisma.term.findFirst({
    where: { schoolYearId: schoolYear.id },
    orderBy: { termNumber: "asc" },
    select: { id: true, termNumber: true },
  });
  if (!term) throw new Error("Active school year has no terms.");

  const section = await prisma.section.findFirst({
    where: { gradeLevel: "G7", adviserId: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, adviserId: true },
  });
  if (!section?.adviserId) {
    throw new Error("No G7 section with an adviser — run the base seed first.");
  }
  const adviserId = section.adviserId;

  // ---- 1. Pending G7 student account --------------------------------------
  const passwordHash = await argon2.hash(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      fullName: STUDENT_NAME,
      role: "student",
      status: "pending",
      lrn: LRN,
      passwordHash,
    },
    create: {
      email: EMAIL,
      passwordHash,
      role: "student",
      fullName: STUDENT_NAME,
      lrn: LRN,
      status: "pending",
    },
    select: { id: true },
  });

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: { lrn: LRN, gradeLevel: "G7" },
    create: {
      userId: user.id,
      lrn: LRN,
      gradeLevel: "G7",
      gender: "Female",
      birthdate: new Date("2014-05-18T00:00:00.000Z"),
      address: "12 Sampaguita St., Brgy. Malanday, Marikina City",
    },
  });
  console.log(`pending G7 student ready: ${STUDENT_NAME} <${EMAIL}>`);

  // ---- 2. One adviser-approved final grade --------------------------------
  let subject = await prisma.subject.findFirst({
    where: { gradeLevel: "G7" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  if (!subject) {
    subject = await prisma.subject.create({
      data: { code: "MATH7", name: "Math 7", gradeLevel: "G7" },
      select: { id: true, code: true, name: true },
    });
  }

  await prisma.finalGrade.upsert({
    where: {
      studentId_subjectId_termId: {
        studentId: user.id,
        subjectId: subject.id,
        termId: term.id,
      },
    },
    update: {
      computedAverage: 91.25,
      transmutedGrade: 91,
      remarks: "Passed",
      lockStatus: "adviser_approved",
      lockedBy: adviserId,
      lockedAt: new Date(),
      adviserApprovedBy: adviserId,
      adviserApprovedAt: new Date(),
    },
    create: {
      studentId: user.id,
      subjectId: subject.id,
      termId: term.id,
      computedAverage: 91.25,
      transmutedGrade: 91,
      remarks: "Passed",
      lockStatus: "adviser_approved",
      lockedBy: adviserId,
      lockedAt: new Date(),
      adviserApprovedBy: adviserId,
      adviserApprovedAt: new Date(),
    },
  });
  console.log(
    `final grade ready: ${subject.code} · ${subject.name} — term ${term.termNumber} · adviser_approved`,
  );

  // ---- 3. One pending adviser SF10 access request -------------------------
  const existing = await prisma.adviserSf10AccessRequest.findFirst({
    where: { adviserId, sectionId: section.id, reason: REASON },
    select: { id: true },
  });
  if (existing) {
    await prisma.adviserSf10AccessRequest.update({
      where: { id: existing.id },
      data: {
        status: "pending",
        requestedAt: new Date(),
        requestedLrns: [LRN],
        decidedAt: null,
        decidedBy: null,
        decisionReason: null,
      },
    });
  } else {
    await prisma.adviserSf10AccessRequest.create({
      data: {
        adviserId,
        sectionId: section.id,
        gradeLevel: "G7",
        reason: REASON,
        requestedLrns: [LRN],
        status: "pending",
      },
    });
  }
  console.log(
    `SF10 access request ready: ${section.name} (G7) · pending · 1 LRN`,
  );

  console.log(
    `\nDone — ${schoolYear.name}, section "${section.name}". Refresh /record-keeper/overview.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
