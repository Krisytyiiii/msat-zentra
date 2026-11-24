import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

/**
 * Seeds TEN pending student accounts for the account-approval desks:
 *
 *   - 5 "empty"    — `User` (status pending) + `StudentProfile` only. No section,
 *                    no grades, no attendance: they land in the approvals queue
 *                    as a bare registration.
 *   - 5 "recorded" — same pending accounts, but already carrying a full academic
 *                    set inside the active school year: section, subjects,
 *                    teaching assignments, grade components, assessments,
 *                    scores, final grades, attendance and a risk snapshot.
 *
 *   npx tsx prisma/seed-pending-students-split-5.ts
 *   npm run prisma:seed:pending-students-split-5
 *
 * Both sets stay `status: pending` so every approval lane still has work to do.
 * Idempotent: accounts upsert by email, and the recorded cohort's section
 * records are upserted (re-running refreshes scores instead of duplicating).
 *
 * Sign in with any seeded email and `Student2025!` once approved.
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const PASSWORD = "Student2025!";
const EMPTY_EMAIL_DOMAIN = "pending.students.zentra.test";
const RECORDED_EMAIL_DOMAIN = "pending.recorded.students.zentra.test";
const RECORDED_SECTION_NAME = "Grade 7 - Sampaguita";

type GradeLevel = "G7" | "G8" | "G9" | "G10" | "G11" | "G12";

interface SeedStudent {
  lrn: string;
  fullName: string;
  gradeLevel: GradeLevel;
  gender: string;
  birthdate: string;
  address: string;
  contactNumber: string;
  daysAgo: number;
}

/** No records: account + profile only (same accounts as seed-pending-student-accounts-5). */
const EMPTY_STUDENTS: SeedStudent[] = [
  {
    lrn: "136120260001",
    fullName: "Althea Marie Bautista",
    gradeLevel: "G7",
    gender: "Female",
    birthdate: "2014-03-12",
    address: "24 Mabini St., Brgy. San Isidro, Quezon City",
    contactNumber: "09171234001",
    daysAgo: 0,
  },
  {
    lrn: "136120260002",
    fullName: "Joaquin Reyes Delgado",
    gradeLevel: "G8",
    gender: "Male",
    birthdate: "2013-07-28",
    address: "88 Rizal Ave., Brgy. Poblacion, Quezon City",
    contactNumber: "09171234002",
    daysAgo: 1,
  },
  {
    lrn: "136120260003",
    fullName: "Kimberly Anne Santos",
    gradeLevel: "G9",
    gender: "Female",
    birthdate: "2012-11-05",
    address: "5 Luna St., Brgy. Sta. Cruz, Quezon City",
    contactNumber: "09171234003",
    daysAgo: 2,
  },
  {
    lrn: "136120260004",
    fullName: "Rafael Luis Mendoza",
    gradeLevel: "G10",
    gender: "Male",
    birthdate: "2011-01-19",
    address: "117 Bonifacio St., Brgy. Bagong Pag-asa, Quezon City",
    contactNumber: "09171234004",
    daysAgo: 3,
  },
  {
    lrn: "136120260005",
    fullName: "Sofia Isabel Navarro",
    gradeLevel: "G7",
    gender: "Female",
    birthdate: "2014-09-23",
    address: "31 Katipunan Ave., Brgy. Milagrosa, Quezon City",
    contactNumber: "09171234005",
    daysAgo: 4,
  },
];

/** With records: pending accounts that already sit in a section with grades/attendance. */
const RECORDED_STUDENTS: SeedStudent[] = [
  {
    lrn: "136120260101",
    fullName: "Daniella Rose Umali",
    gradeLevel: "G7",
    gender: "Female",
    birthdate: "2014-01-16",
    address: "12 Sampaguita St., Brgy. Central, Mati City, Davao Oriental",
    contactNumber: "09171234101",
    daysAgo: 5,
  },
  {
    lrn: "136120260102",
    fullName: "Paolo Miguel Ferrer",
    gradeLevel: "G7",
    gender: "Male",
    birthdate: "2013-10-02",
    address: "45 Narra St., Brgy. Dahican, Mati City, Davao Oriental",
    contactNumber: "09171234102",
    daysAgo: 6,
  },
  {
    lrn: "136120260103",
    fullName: "Bea Clarisse Villamor",
    gradeLevel: "G7",
    gender: "Female",
    birthdate: "2013-12-24",
    address: "7 Ilang-Ilang St., Brgy. Sainz, Mati City, Davao Oriental",
    contactNumber: "09171234103",
    daysAgo: 7,
  },
  {
    lrn: "136120260104",
    fullName: "Jomari Dancel",
    gradeLevel: "G7",
    gender: "Male",
    birthdate: "2013-06-11",
    address: "102 Calachuchi St., Brgy. Matiao, Mati City, Davao Oriental",
    contactNumber: "09171234104",
    daysAgo: 8,
  },
  {
    lrn: "136120260105",
    fullName: "Krisha Mae Lumbao",
    gradeLevel: "G7",
    gender: "Female",
    birthdate: "2014-04-30",
    address: "19 Camia St., Brgy. Central, Mati City, Davao Oriental",
    contactNumber: "09171234105",
    daysAgo: 9,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const d = (iso: string) => new Date(`${iso}T08:00:00.000Z`);

async function upsertPendingStudent(s: SeedStudent, emailDomain: string, sectionId?: string) {
  const email = `${s.lrn}@${emailDomain}`;
  const createdAt = new Date(Date.now() - s.daysAgo * DAY_MS);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName: s.fullName,
      role: "student",
      status: "pending",
      lrn: s.lrn,
      contactNumber: s.contactNumber,
    },
    create: {
      email,
      passwordHash: await argon2.hash(PASSWORD),
      role: "student",
      fullName: s.fullName,
      lrn: s.lrn,
      status: "pending",
      contactNumber: s.contactNumber,
      createdAt,
    },
    select: { id: true },
  });

  const profile = {
    lrn: s.lrn,
    gradeLevel: s.gradeLevel,
    sectionId: sectionId ?? null,
    birthdate: d(s.birthdate),
    gender: s.gender,
    address: s.address,
  };

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: profile,
    create: { userId: user.id, ...profile },
  });

  return user.id;
}

async function resolveActiveYearAndTerm() {
  const now = new Date();
  let year = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
    include: { terms: { orderBy: { termNumber: "asc" } } },
  });

  if (!year) {
    const creator = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!creator) {
      throw new Error("No users in this database. Run `npm run prisma:seed:roles` first.");
    }
    const created = await prisma.schoolYear.create({
      data: {
        name: "SY 2026-2027",
        startDate: d("2026-06-08"),
        endDate: d("2027-04-08"),
        isActive: true,
        createdBy: creator.id,
      },
    });
    await prisma.term.createMany({
      data: [
        { schoolYearId: created.id, termNumber: 1, startDate: d("2026-06-08"), endDate: d("2026-09-15") },
        { schoolYearId: created.id, termNumber: 2, startDate: d("2026-09-16"), endDate: d("2026-12-18") },
        { schoolYearId: created.id, termNumber: 3, startDate: d("2027-01-04"), endDate: d("2027-04-08") },
      ],
    });
    year = await prisma.schoolYear.findUniqueOrThrow({
      where: { id: created.id },
      include: { terms: { orderBy: { termNumber: "asc" } } },
    });
    console.log("Created active school year SY 2026-2027 (3 terms).");
  }

  const term =
    year.terms.find((t) => t.startDate && t.endDate && now >= t.startDate && now <= t.endDate) ??
    year.terms[0];

  if (!term) {
    throw new Error(`School year ${year.name} has no terms. Seed terms first.`);
  }

  return { year, term };
}

async function resolveStaffMember() {
  const existing = await prisma.user.findFirst({
    where: { role: { in: ["adviser", "subject_teacher"] }, status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true },
  });
  if (existing) return existing;

  const user = await prisma.user.upsert({
    where: { email: "seed.staff@zentra.test" },
    update: { role: "subject_teacher", status: "active" },
    create: {
      email: "seed.staff@zentra.test",
      fullName: "Seed Class Teacher",
      role: "subject_teacher",
      passwordHash: await argon2.hash("Zentra2025!"),
      status: "active",
    },
    select: { id: true, fullName: true },
  });

  const staff = await prisma.staffProfile.findUnique({ where: { userId: user.id } });
  if (!staff) {
    await prisma.staffProfile.create({
      data: { userId: user.id, employeeId: "SEED-TCH-PENDING", department: "Academic", handledGradeLevels: ["G7"] },
    });
  }
  console.log(`Created fallback class teacher <seed.staff@zentra.test> / Zentra2025!`);
  return user;
}

async function ensureSection(schoolYearId: string, adviserId: string) {
  const existing = await prisma.section.findFirst({
    where: { name: RECORDED_SECTION_NAME, schoolYearId },
    select: { id: true, name: true },
  });
  if (existing) return existing;

  const section = await prisma.section.create({
    data: {
      name: RECORDED_SECTION_NAME,
      gradeLevel: "G7",
      schoolYearId,
      adviserId,
      adviserLabel: "Pending-intake advisory",
    },
    select: { id: true, name: true },
  });
  console.log(`Created section ${RECORDED_SECTION_NAME}.`);
  return section;
}

async function ensureSubjects() {
  const FIXED = [
    { name: "Mathematics 7", code: "MATH7" },
    { name: "English 7", code: "ENG7" },
    { name: "Science 7", code: "SCI7" },
  ];

  const subjects: { id: string; name: string }[] = [];
  for (const f of FIXED) {
    const existing = await prisma.subject.findUnique({
      where: { code_gradeLevel: { code: f.code, gradeLevel: "G7" } },
      select: { id: true, name: true },
    });
    if (existing) {
      subjects.push(existing);
      continue;
    }
    subjects.push(
      await prisma.subject.create({
        data: { ...f, gradeLevel: "G7", category: "CORE" },
        select: { id: true, name: true },
      }),
    );
  }

  return subjects;
}

async function seedRecordsForLearner(
  studentId: string,
  learnerName: string,
  index: number,
  ctx: {
    sectionId: string;
    termId: string;
    teacherId: string;
    subjects: { id: string; name: string }[];
    subjectState: Map<
      string,
      { components: Map<string, string>; assessments: { id: string; max: number }[]; assignmentId: string }
    >;
  },
) {
  const weights = [
    ["WRITTEN_WORK", 30],
    ["PERFORMANCE_TASK", 50],
    ["EXAM", 20],
  ] as const;

  const scores = [29, 24, 20, 16, 27, 22, 18];
  let scoreIdx = index;

  for (const [subjectIdx, subject] of ctx.subjects.entries()) {
    let state = ctx.subjectState.get(subject.id);
    if (!state) {
      const assignment = await prisma.teacherSubjectAssignment.upsert({
        where: {
          teacherId_subjectId_sectionId_termId: {
            teacherId: ctx.teacherId,
            subjectId: subject.id,
            sectionId: ctx.sectionId,
            termId: ctx.termId,
          },
        },
        update: {},
        create: {
          teacherId: ctx.teacherId,
          subjectId: subject.id,
          sectionId: ctx.sectionId,
          termId: ctx.termId,
        },
        select: { id: true },
      });

      const components = new Map<string, string>();
      const assessments: { id: string; max: number }[] = [];

      for (const [type, weight] of weights) {
        const component = await prisma.gradeComponent.upsert({
          where: {
            subjectId_termId_componentType: { subjectId: subject.id, termId: ctx.termId, componentType: type },
          },
          update: { weightPercentage: weight },
          create: { subjectId: subject.id, termId: ctx.termId, componentType: type, weightPercentage: weight },
          select: { id: true },
        });
        components.set(type, component.id);

        const title = `${type === "EXAM" ? "Quarterly Exam" : type === "WRITTEN_WORK" ? "Long Quiz" : "Performance Task"} 1 – ${subject.name}`;
        const existingAssessment = await prisma.assessment.findFirst({
          where: { gradeComponentId: component.id, sectionId: ctx.sectionId, title },
          select: { id: true, maxScore: true },
        });
        const assessment =
          existingAssessment ??
          (await prisma.assessment.create({
            data: {
              gradeComponentId: component.id,
              sectionId: ctx.sectionId,
              title,
              maxScore: type === "EXAM" ? 50 : 30,
              dateGiven: d("2026-11-06"),
              createdBy: ctx.teacherId,
            },
            select: { id: true, maxScore: true },
          }));
        assessments.push({ id: assessment.id, max: assessment.maxScore });
      }

      state = { components, assessments, assignmentId: assignment.id };
      ctx.subjectState.set(subject.id, state);
    }

    const average = 74 + ((index + subjectIdx * 2) % 6) * 3;

    for (const assessment of state.assessments) {
      const raw = Math.min(assessment.max, scores[scoreIdx++ % scores.length]!);
      await prisma.studentGrade.upsert({
        where: { assessmentId_studentId: { assessmentId: assessment.id, studentId } },
        update: { rawScore: raw, percentageScore: Math.round((raw / assessment.max) * 10000) / 100 },
        create: {
          assessmentId: assessment.id,
          studentId,
          rawScore: raw,
          percentageScore: Math.round((raw / assessment.max) * 10000) / 100,
        },
      });
    }

    await prisma.finalGrade.upsert({
      where: { studentId_subjectId_termId: { studentId, subjectId: subject.id, termId: ctx.termId } },
      update: {
        computedAverage: average,
        transmutedGrade: average,
        remarks: average >= 75 ? "Passed" : "Failed",
      },
      create: {
        studentId,
        subjectId: subject.id,
        termId: ctx.termId,
        computedAverage: average,
        transmutedGrade: average,
        remarks: average >= 75 ? "Passed" : "Failed",
        lockStatus: "adviser_approved",
        lockedBy: ctx.teacherId,
        lockedAt: d("2026-11-13"),
        adviserApprovedBy: ctx.teacherId,
        adviserApprovedAt: d("2026-11-14"),
      },
    });
  }

  const attendanceDays = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
  const statuses = ["present", "present", "late", "absent", "excused"] as const;
  const firstSubject = ctx.subjects[0]!;
  const firstState = ctx.subjectState.get(firstSubject.id)!;

  for (const [dayIdx, date] of attendanceDays.entries()) {
    await prisma.attendanceRecord.upsert({
      where: {
        studentId_subjectId_date_slot: {
          studentId,
          subjectId: firstSubject.id,
          date: d(date),
          slot: 1,
        },
      },
      update: { status: statuses[(index + dayIdx) % statuses.length]! },
      create: {
        studentId,
        sectionId: ctx.sectionId,
        date: d(date),
        session: "AM",
        status: statuses[(index + dayIdx) % statuses.length]!,
        recordedBy: ctx.teacherId,
        termId: ctx.termId,
        subjectId: firstSubject.id,
        assignmentId: firstState.assignmentId,
        slot: 1,
      },
    });
  }

  const riskLevel = index < 2 ? "High" : index === 2 ? "Moderate" : "Low";
  const flags = { academic: index < 2, attendance: index === 2, behavioral: index === 1 };
  const existingSnapshot = await prisma.riskSnapshot.findFirst({
    where: { studentId, termId: ctx.termId },
    select: { id: true },
  });
  const snapshotData = {
    riskLevel: riskLevel as "High" | "Moderate" | "Low",
    riskLevelRaw: riskLevel as "High" | "Moderate" | "Low",
    riskLevelFinal: riskLevel as "High" | "Moderate" | "Low",
    academicFlag: flags.academic,
    attendanceFlag: flags.attendance,
    behavioralFlag: flags.behavioral,
    academicFlagRaw: flags.academic,
    attendanceFlagRaw: flags.attendance,
    behavioralFlagRaw: flags.behavioral,
    riskCount: (flags.academic ? 1 : 0) + (flags.attendance ? 1 : 0) + (flags.behavioral ? 1 : 0),
    snapshotDate: d("2026-11-14"),
  };
  if (existingSnapshot) {
    await prisma.riskSnapshot.update({ where: { id: existingSnapshot.id }, data: snapshotData });
  } else {
    await prisma.riskSnapshot.create({ data: { studentId, termId: ctx.termId, ...snapshotData } });
  }

  await prisma.studentProfile.update({
    where: { userId: studentId },
    data: {
      riskLevel: riskLevel as "High" | "Moderate" | "Low",
      riskCount: snapshotData.riskCount,
      academicFlag: flags.academic,
      attendanceFlag: flags.attendance,
      behavioralFlag: flags.behavioral,
    },
  });

  console.log(`  recorded learner ready: ${learnerName} (${riskLevel} risk)`);
}

async function main() {
  // 1) Empty pending accounts — account + profile only.
  for (const s of EMPTY_STUDENTS) {
    await upsertPendingStudent(s, EMPTY_EMAIL_DOMAIN);
    console.log(`pending (no records) ready: ${s.fullName} (${s.gradeLevel}) <${s.lrn}@${EMPTY_EMAIL_DOMAIN}>`);
  }

  // 2) Recorded pending accounts — resolve the academic spine first.
  const { year, term } = await resolveActiveYearAndTerm();
  const staff = await resolveStaffMember();
  const section = await ensureSection(year.id, staff.id);
  const subjects = await ensureSubjects();

  const ctx = {
    sectionId: section.id,
    termId: term.id,
    teacherId: staff.id,
    subjects,
    subjectState: new Map<
      string,
      { components: Map<string, string>; assessments: { id: string; max: number }[]; assignmentId: string }
    >(),
  };

  const recordedIds: string[] = [];
  for (const s of RECORDED_STUDENTS) {
    recordedIds.push(await upsertPendingStudent(s, RECORDED_EMAIL_DOMAIN, section.id));
  }

  // The recorded cohort owns this section, so rebuild its academic rows on
  // every run: no duplicate attendance/grades and no leftovers from an earlier
  // subject set.
  await prisma.studentGrade.deleteMany({
    where: { studentId: { in: recordedIds }, assessment: { sectionId: section.id } },
  });
  await prisma.assessment.deleteMany({ where: { sectionId: section.id } });
  await prisma.attendanceRecord.deleteMany({
    where: { studentId: { in: recordedIds }, sectionId: section.id, termId: term.id },
  });
  await prisma.finalGrade.deleteMany({ where: { studentId: { in: recordedIds }, termId: term.id } });
  await prisma.riskSnapshot.deleteMany({ where: { studentId: { in: recordedIds }, termId: term.id } });

  for (const [index, s] of RECORDED_STUDENTS.entries()) {
    const id = recordedIds[index]!;
    console.log(`pending (with records) ready: ${s.fullName} (${s.gradeLevel}) <${s.lrn}@${RECORDED_EMAIL_DOMAIN}>`);
    await seedRecordsForLearner(id, s.fullName, index, ctx);
  }

  const [pendingTotal, recordedCount, gradeCount, attendanceCount] = await Promise.all([
    prisma.user.count({ where: { role: "student", status: "pending" } }),
    prisma.user.count({ where: { email: { endsWith: `@${RECORDED_EMAIL_DOMAIN}` } } }),
    prisma.studentGrade.count({ where: { studentId: { in: recordedIds } } }),
    prisma.attendanceRecord.count({ where: { sectionId: section.id, termId: term.id } }),
  ]);

  console.log(
    `\nDone in ${year.name} term ${term.termNumber} (${term.id}): ` +
      `${EMPTY_STUDENTS.length} pending with no records, ${recordedCount} pending with records, ` +
      `${section.name}.`,
  );
  console.log(`Total pending student accounts in the system: ${pendingTotal}.`);
  console.log(`  recorded scores: ${gradeCount}, attendance rows in the seeded section/term: ${attendanceCount}`);

  console.log(`\nAll seeded logins use password: ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
