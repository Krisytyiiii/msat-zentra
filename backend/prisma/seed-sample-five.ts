/**
 * Sample data for development / demos — "at least 5 rows in every table", drawn
 * from a realistic Mati School of Arts and Trades setting (Grades 7-8, SY
 * 2026-2027, trimester terms per DepEd Order 009 s. 2026).
 *
 * This seed is SELF-CONTAINED: it truncates every public table first, then creates
 * the 11 canonical role accounts (same logins as `prisma:seed:roles`) plus five
 * demo learners, five demo parents and their support records.
 *
 *   npm run prisma:seed:sample5
 *
 * Do not stack it with `prisma:seed:school` (that seeder wants employee id TCH001,
 * which this one also uses).
 */
import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const STAFF_PASSWORD = "Zentra2025!";
const STUDENT_PASSWORD = "Student2025!";
const PARENT_PASSWORD = "Parent2025!";

type Role = "student" | "parent" | "subject_teacher" | "adviser" | "nurse" | "adm_coordinator" | "guidance_counselor" | "record_keeper" | "registrar" | "principal" | "admin";

const ACCOUNTS: {
  email: string;
  fullName: string;
  role: Role;
  password: string;
  employeeId?: string;
  department?: string;
  handledGradeLevels?: ("G7" | "G8" | "G9" | "G10" | "G11" | "G12")[];
}[] = [
  { email: "admin@zentra.test", fullName: "System Administrator", role: "admin", password: "Admin2025!" },
  { email: "principal@zentra.test", fullName: "Dr. Editha M. Cabrera", role: "principal", password: STAFF_PASSWORD, employeeId: "PRN001", department: "Administration", handledGradeLevels: ["G7", "G8", "G9", "G10", "G11", "G12"] },
  { email: "registrar@zentra.test", fullName: "Mr. Rolando P. Sabanal", role: "registrar", password: STAFF_PASSWORD, employeeId: "REG001", department: "Registrar", handledGradeLevels: ["G11", "G12"] },
  { email: "record_keeper@zentra.test", fullName: "Ms. Analyn B. Tumulak", role: "record_keeper", password: STAFF_PASSWORD, employeeId: "RKP001", department: "Records", handledGradeLevels: ["G7", "G8", "G9", "G10"] },
  { email: "nurse@zentra.test", fullName: "Mrs. Jocelyn D. Bentulan", role: "nurse", password: STAFF_PASSWORD, employeeId: "NUR001", department: "Clinic" },
  { email: "guidance_counselor@zentra.test", fullName: "Ms. Richelle Anne V. Lopoz", role: "guidance_counselor", password: STAFF_PASSWORD, employeeId: "GDC001", department: "Guidance" },
  { email: "adm_coordinator@zentra.test", fullName: "Mr. Elmer T. Cadungog", role: "adm_coordinator", password: STAFF_PASSWORD, employeeId: "ADM001", department: "ADM" },
  { email: "subject_teacher@zentra.test", fullName: "Mr. Arnel C. Villanueva", role: "subject_teacher", password: STAFF_PASSWORD, employeeId: "TCH001", department: "Academic", handledGradeLevels: ["G7", "G8"] },
  { email: "adviser@zentra.test", fullName: "Mrs. Marilou S. Guinto", role: "adviser", password: STAFF_PASSWORD, employeeId: "ADV001", department: "Academic", handledGradeLevels: ["G7"] },
  { email: "student@zentra.test", fullName: "Mark Angelo D. Reyes", role: "student", password: STUDENT_PASSWORD },
  { email: "parent@zentra.test", fullName: "Mr. Rodolfo A. Reyes", role: "parent", password: PARENT_PASSWORD },
];

/** Five demo learners (accounts) — Grades 7 and 8. */
const LEARNERS = [
  { email: "cristina.dizon@student.zentra.test", fullName: "Ma. Cristina B. Dizon", lrn: "136207010001", grade: "G7" as const, section: "Grade 7 - Amethyst", birthdate: "2013-03-14", gender: "Female", address: "Purok 3, Brgy. Central, Mati City, Davao Oriental" },
  { email: "johnpaul.maturan@student.zentra.test", fullName: "John Paul R. Maturan", lrn: "136207010002", grade: "G7" as const, section: "Grade 7 - Amethyst", birthdate: "2013-07-02", gender: "Male", address: "Purok 1, Brgy. Dahican, Mati City, Davao Oriental" },
  { email: "angelamae.lumactod@student.zentra.test", fullName: "Angela Mae S. Lumactod", lrn: "136207010003", grade: "G7" as const, section: "Grade 7 - Emerald", birthdate: "2013-11-21", gender: "Female", address: "Purok 5, Brgy. Mayo, Mati City, Davao Oriental" },
  { email: "kervinjay.abad@student.zentra.test", fullName: "Kervin Jay D. Abad", lrn: "136207020004", grade: "G8" as const, section: "Grade 8 - Narra", birthdate: "2012-05-09", gender: "Male", address: "Purok 2, Brgy. Sainz, Mati City, Davao Oriental" },
  { email: "lovely.pineda@student.zentra.test", fullName: "Lovely Grace T. Pineda", lrn: "136207020005", grade: "G8" as const, section: "Grade 8 - Molave", birthdate: "2012-09-30", gender: "Female", address: "Purok 4, Brgy. Matiao, Mati City, Davao Oriental" },
];

const PARENTS = [
  { email: "mother.dizon@parent.zentra.test", fullName: "Mrs. Elena B. Dizon", relationship: "Mother", occupation: "Public school teacher" },
  { email: "father.maturan@parent.zentra.test", fullName: "Mr. Benjamin R. Maturan", relationship: "Father", occupation: "Fisherman" },
  { email: "mother.lumactod@parent.zentra.test", fullName: "Mrs. Marilyn S. Lumactod", relationship: "Mother", occupation: "Sari-sari store owner" },
  { email: "father.abad@parent.zentra.test", fullName: "Mr. Dante M. Abad", relationship: "Father", occupation: "Construction worker" },
  { email: "aunt.pineda@parent.zentra.test", fullName: "Ms. Rosalie T. Pineda", relationship: "Guardian", occupation: "Barangay health worker" },
];

/** Enlisted learners without accounts (StudentRoster). */
const ROSTER_LEARNERS = [
  { lrn: "136207010011", fullName: "Marlon E. Bacalso", grade: "G7" as const, section: "Grade 7 - Amethyst" },
  { lrn: "136207010012", fullName: "Shaira D. Ungab", grade: "G7" as const, section: "Grade 7 - Emerald" },
  { lrn: "136207010013", fullName: "Clyde Vincent O. Tamayo", grade: "G7" as const, section: "Grade 7 - Ruby" },
  { lrn: "136207020014", fullName: "Nino Anthony C. Bautista", grade: "G8" as const, section: "Grade 8 - Narra" },
  { lrn: "136207020015", fullName: "Jessa Mae L. Salazar", grade: "G8" as const, section: "Grade 8 - Molave" },
];

const SECTIONS = [
  { name: "Grade 7 - Amethyst", grade: "G7" as const, adviserCode: "G7-AMETHYST" },
  { name: "Grade 7 - Emerald", grade: "G7" as const, adviserCode: "G7-EMERALD" },
  { name: "Grade 7 - Ruby", grade: "G7" as const, adviserCode: "G7-RUBY" },
  { name: "Grade 8 - Narra", grade: "G8" as const, adviserCode: "G8-NARRA" },
  { name: "Grade 8 - Molave", grade: "G8" as const, adviserCode: "G8-MOLAVE" },
];

const SUBJECTS_G7 = [
  { name: "Mathematics 7", code: "MATH7", category: "CORE" as const },
  { name: "English 7", code: "ENG7", category: "CORE" as const },
  { name: "Science 7", code: "SCI7", category: "CORE" as const },
  { name: "Filipino 7", code: "FIL7", category: "CORE" as const },
  { name: "Araling Panlipunan 7", code: "AP7", category: "CORE" as const },
  { name: "Edukasyon sa Pagpapakatao 7", code: "ESP7", category: "CORE" as const },
  { name: "MAPEH 7", code: "MAPEH7", category: "CORE" as const },
  { name: "TLE 7", code: "TLE7", category: "CORE" as const },
];

const SUBJECTS_G8 = [
  { name: "Mathematics 8", code: "MATH8", category: "CORE" as const },
  { name: "English 8", code: "ENG8", category: "CORE" as const },
  { name: "Science 8", code: "SCI8", category: "CORE" as const },
  { name: "Filipino 8", code: "FIL8", category: "CORE" as const },
  { name: "Araling Panlipunan 8", code: "AP8", category: "CORE" as const },
  { name: "Edukasyon sa Pagpapakatao 8", code: "ESP8", category: "CORE" as const },
  { name: "MAPEH 8", code: "MAPEH8", category: "CORE" as const },
  { name: "TLE 8", code: "TLE8", category: "CORE" as const },
];

const PH_SCHOOL_YEARS = [
  { name: "SY 2022-2023", start: "2022-08-22", end: "2023-07-07" },
  { name: "SY 2023-2024", start: "2023-08-29", end: "2024-07-06" },
  { name: "SY 2024-2025", start: "2024-07-29", end: "2025-06-13" },
  { name: "SY 2025-2026", start: "2025-06-16", end: "2026-04-03" },
  { name: "SY 2026-2027", start: "2026-06-08", end: "2027-04-08" },
];

const d = (iso: string) => new Date(`${iso}T08:00:00.000Z`);
const at = (iso: string) => new Date(iso);

async function wipeAll() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production" && process.env.ALLOW_PROD_SEED !== "yes") {
    throw new Error("Refusing to wipe in production without ALLOW_PROD_SEED=yes");
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  console.log(`Wipe: truncated ${tables.length} public tables.`);
}

async function main() {
  const t0 = Date.now();
  await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'admin'`);
  await wipeAll();

  // ---------------------------------------------------------------- accounts
  const users: Record<string, { id: string }> = {};
  for (const a of ACCOUNTS) {
    const passwordHash = await argon2.hash(a.password);
    const user = await prisma.user.create({
      data: { email: a.email, fullName: a.fullName, role: a.role, passwordHash, status: "active" },
    });
    users[a.role] = user;
    if (a.employeeId) {
      await prisma.staffProfile.create({
        data: {
          userId: user.id,
          employeeId: a.employeeId,
          department: a.department,
          isAdviser: a.role === "adviser",
          handledGradeLevels: a.handledGradeLevels ?? [],
        },
      });
    }
  }
  const admin = users.admin!;
  const principal = users.principal!;
  const registrar = users.registrar!;
  const recordKeeper = users.record_keeper!;
  const nurse = users.nurse!;
  const guidance = users.guidance_counselor!;
  const admCoord = users.adm_coordinator!;
  const subjectTeacher = users.subject_teacher!;
  const adviser = users.adviser!;
  const seededStudent = users.student!;
  const seededParent = users.parent!;

  // -------------------------------------------------- master teacher seat (G7–10)
  // The timetable workspace (school-day config, teacher-name catalog, a subject
  // per period) is Master-Teacher-only, so a fresh seed with no seat can't build
  // one. The junior-high teacher (TCH001, handles G7/G8) takes the G7–10 seat;
  // the G7/G8 subjects and the teacher-name catalog below all sit inside that
  // band, so the schedule desk opens with subjects and teacher names to place.
  await prisma.staffProfile.update({
    where: { userId: subjectTeacher.id },
    data: { isMasterTeacher: true },
  });

  // ------------------------------------------------------- school years/terms
  const years: { id: string; name: string; terms: { id: string; termNumber: number }[] }[] = [];
  for (const [i, sy] of PH_SCHOOL_YEARS.entries()) {
    const year = await prisma.schoolYear.create({
      data: {
        name: sy.name,
        startDate: d(sy.start),
        endDate: d(sy.end),
        isActive: i === PH_SCHOOL_YEARS.length - 1,
        createdBy: principal.id,
      },
    });
    const startYear = Number(sy.start.slice(0, 4));
    const termWindows = [
      { n: 1, start: `${startYear}-06-08`, end: `${startYear}-09-15` },
      { n: 2, start: `${startYear}-09-16`, end: `${startYear}-12-18` },
      { n: 3, start: `${startYear + 1}-01-04`, end: `${startYear + 1}-04-08` },
    ];
    const terms = [];
    for (const t of termWindows) {
      terms.push(
        await prisma.term.create({
          data: { schoolYearId: year.id, termNumber: t.n, startDate: d(t.start), endDate: d(t.end) },
        }),
      );
    }
    years.push({ id: year.id, name: sy.name, terms });
  }
  const activeYear = years[years.length - 1]!;
  const term1 = activeYear.terms[0]!;
  const term2 = activeYear.terms[1]!;
  const allTerms = years.flatMap((y) => y.terms);

  // ------------------------------------------------------------- sections
  const sections: Record<string, { id: string }> = {};
  for (const s of SECTIONS) {
    sections[s.name] = await prisma.section.create({
      data: {
        name: s.name,
        gradeLevel: s.grade,
        schoolYearId: activeYear.id,
        adviserCode: s.adviserCode,
        adviserId: s.grade === "G7" ? adviser.id : null,
        adviserLabel: s.grade === "G7" ? "Mrs. Marilou S. Guinto" : null,
      },
    });
  }
  const amethyst = sections["Grade 7 - Amethyst"]!;
  const emerald = sections["Grade 7 - Emerald"]!;
  const ruby = sections["Grade 7 - Ruby"]!;
  const narra = sections["Grade 8 - Narra"]!;
  const molave = sections["Grade 8 - Molave"]!;

  // -------------------------------------------------------------- subjects
  const subjects: Record<string, { id: string }> = {};
  for (const subj of SUBJECTS_G7) {
    subjects[subj.code] = await prisma.subject.create({ data: { ...subj, gradeLevel: "G7" } });
  }
  for (const subj of SUBJECTS_G8) {
    subjects[subj.code] = await prisma.subject.create({ data: { ...subj, gradeLevel: "G8" } });
  }

  // ------------------------------------------------------------- learners
  const studentHash = await argon2.hash(STUDENT_PASSWORD);
  const parentHash = await argon2.hash(PARENT_PASSWORD);

  const learnerProfiles: { userId: string; sectionId: string; lrn: string; fullName: string }[] = [];
  for (const [i, l] of LEARNERS.entries()) {
    const user = await prisma.user.create({
      data: {
        email: l.email,
        fullName: l.fullName,
        role: "student",
        passwordHash: studentHash,
        status: "active",
        approvedBy: registrar.id,
        approvedAt: at("2026-06-05T01:00:00.000Z"),
      },
    });
    await prisma.studentProfile.create({
      data: {
        userId: user.id,
        lrn: l.lrn,
        gradeLevel: l.grade,
        sectionId: sections[l.section]!.id,
        birthdate: d(l.birthdate),
        gender: l.gender,
        address: l.address,
        riskLevel: i < 2 ? "Moderate" : "Low",
        riskCount: i < 2 ? 2 : 1,
      },
    });
    learnerProfiles.push({ userId: user.id, sectionId: sections[l.section]!.id, lrn: l.lrn, fullName: l.fullName });

    const p = PARENTS[i]!;
    const parentUser = await prisma.user.create({
      data: {
        email: p.email,
        fullName: p.fullName,
        role: "parent",
        passwordHash: parentHash,
        status: "active",
        approvedBy: registrar.id,
        approvedAt: at("2026-06-05T01:00:00.000Z"),
      },
    });
    await prisma.parentProfile.create({
      data: { userId: parentUser.id, occupation: p.occupation, address: l.address },
    });
    await prisma.parentStudentLink.create({
      data: {
        parentId: parentUser.id,
        studentId: user.id,
        relationship: p.relationship,
        approvedBy: registrar.id,
      },
    });
  }

  // The canonical student/parent accounts also get profiles so the learner desk
  // has a real learner behind it.
  await prisma.studentProfile.create({
    data: {
      userId: seededStudent.id,
      lrn: "136207010000",
      gradeLevel: "G7",
      sectionId: amethyst.id,
      birthdate: d("2013-01-08"),
      gender: "Male",
      address: "Purok 6, Brgy. Central, Mati City, Davao Oriental",
    },
  });
  await prisma.parentProfile.create({
    data: { userId: seededParent.id, occupation: "Tricycle driver", address: "Purok 6, Brgy. Central, Mati City, Davao Oriental" },
  });
  await prisma.parentStudentLink.create({
    data: { parentId: seededParent.id, studentId: seededStudent.id, relationship: "Father", approvedBy: registrar.id },
  });

  // ------------------------------------------------------- roster learners
  const rosters: { id: string; sectionId: string; lrn: string }[] = [];
  for (const r of ROSTER_LEARNERS) {
    const row = await prisma.studentRoster.create({
      data: {
        lrn: r.lrn,
        fullName: r.fullName,
        gradeLevel: r.grade,
        sectionId: sections[r.section]!.id,
        schoolYearId: activeYear.id,
        enlistedTermId: term1.id,
        learnerType: "regular",
      },
    });
    rosters.push({ id: row.id, sectionId: row.sectionId, lrn: row.lrn });
  }

  // ------------------------------------------------------------- timetable
  await prisma.scheduleConfig.create({
    data: { termId: term1.id, startTime: "07:30", periodMins: 60, lunchAfter: 4, lunchMins: 60 },
  });
  for (const t of allTerms.slice(1, 6)) {
    await prisma.scheduleConfig.create({ data: { termId: t.id } });
  }

  const teacherNames = [
    { name: "Mr. Arnel C. Villanueva", code: "TCH-ARNEL", userId: subjectTeacher.id },
    { name: "Mrs. Marilou S. Guinto", code: "TCH-MARILOU", userId: adviser.id },
    { name: "Ms. Richelle Anne V. Lopoz", code: "TCH-RICHELLE", userId: null },
    { name: "Mr. Elmer T. Cadungog", code: "TCH-ELMER", userId: null },
    { name: "Mrs. Jocelyn D. Bentulan", code: "TCH-JOCELYN", userId: null },
  ];
  const teacherNameIds: string[] = [];
  for (const tn of teacherNames) {
    const row = await prisma.teacherName.create({ data: tn });
    teacherNameIds.push(row.id);
  }

  for (const [i, t] of allTerms.slice(0, 5).entries()) {
    await prisma.teacherTermGrant.create({
      data: { userId: adviser.id, termId: t.id, via: "code", teacherNameId: teacherNameIds[1]!, createdAt: d("2026-06-10") },
    });
    // The Master Teacher's own classes stay reachable too (grading/attendance
    // gates read the term grant, not the seat).
    await prisma.teacherTermGrant.create({
      data: { userId: subjectTeacher.id, termId: t.id, via: "code", teacherNameId: teacherNameIds[0]!, createdAt: d("2026-06-10") },
    });
    await prisma.termRosterConfirmation.create({
      data: {
        userId: adviser.id,
        termId: t.id,
        kind: "roster",
        rosterFingerprint: `fp-${t.id.slice(0, 8)}-${i}`,
        sameAsPrevious: i > 0,
      },
    });
  }

  for (const [day, period, subjectCode, section] of [
    [1, 1, "MATH7", amethyst],
    [1, 2, "ENG7", amethyst],
    [2, 1, "MATH7", emerald],
    [2, 2, "ENG7", emerald],
    [3, 1, "MATH8", narra],
  ] as const) {
    await prisma.sectionTimetableEntry.create({
      data: {
        sectionId: section.id,
        subjectId: subjects[subjectCode]!.id,
        termId: term1.id,
        day,
        period,
        teacherNameId: teacherNameIds[0]!,
        status: "APPROVED",
        submittedBy: subjectTeacher.id,
        submittedAt: d("2026-06-12"),
        reviewedBy: principal.id,
        reviewedAt: d("2026-06-13"),
      },
    });
  }

  // --------------------------------------------------- teaching assignments
  const assignmentSpec: [string, string, string, "teacher" | "adviser"][] = [
    ["MATH7", amethyst.id, "Mathematics 7", "teacher"],
    ["ENG7", amethyst.id, "English 7", "adviser"],
    ["MATH7", emerald.id, "Mathematics 7", "teacher"],
    ["FIL7", ruby.id, "Filipino 7", "adviser"],
    ["MATH8", narra.id, "Mathematics 8", "teacher"],
    ["ENG8", molave.id, "English 8", "adviser"],
  ];
  const assignments: { id: string; subjectCode: string; sectionId: string; teacherId: string }[] = [];
  for (const [code, sectionId, , who] of assignmentSpec) {
    const teacherId = who === "teacher" ? subjectTeacher.id : adviser.id;
    const row = await prisma.teacherSubjectAssignment.create({
      data: { teacherId, subjectId: subjects[code]!.id, sectionId, termId: term1.id },
    });
    assignments.push({ id: row.id, subjectCode: code, sectionId, teacherId });
  }
  const taughtCodes = [...new Set(assignments.map((a) => a.subjectCode))];

  // ---------------------------------------------------------- gradebook
  const components: Record<string, { id: string }> = {};
  const weights: [("WRITTEN_WORK" | "PERFORMANCE_TASK" | "EXAM"), number][] = [
    ["WRITTEN_WORK", 30],
    ["PERFORMANCE_TASK", 50],
    ["EXAM", 20],
  ];
  for (const code of taughtCodes) {
    for (const [type, weight] of weights) {
      components[`${code}:${type}`] = await prisma.gradeComponent.create({
        data: { subjectId: subjects[code]!.id, termId: term1.id, componentType: type, weightPercentage: weight },
      });
    }
  }

  const assessmentTitles: Record<string, string[]> = {
    WRITTEN_WORK: ["Long Quiz 1 – Sets and Real Numbers", "Long Quiz 2 – Integers"],
    PERFORMANCE_TASK: ["Performance Task 1 – Real-life problem solving", "Performance Task 2 – Group presentation"],
    EXAM: ["First Quarterly Examination"],
  };

  const assessmentIds: { id: string; subjectCode: string; sectionId: string; max: number }[] = [];
  for (const a of assignments) {
    for (const [type] of weights) {
      for (const title of assessmentTitles[type] ?? ["Assessment"]) {
        const maxScore = type === "EXAM" ? 50 : 30;
        const row = await prisma.assessment.create({
          data: {
            gradeComponentId: components[`${a.subjectCode}:${type}`]!.id,
            sectionId: a.sectionId,
            title,
            maxScore,
            dateGiven: d(type === "EXAM" ? "2026-09-10" : "2026-07-15"),
            createdBy: a.teacherId,
          },
        });
        assessmentIds.push({ id: row.id, subjectCode: a.subjectCode, sectionId: a.sectionId, max: maxScore });
      }
    }
  }

  const scores = [28, 24, 21, 19, 17];
  let scoreIdx = 0;
  for (const a of assessmentIds) {
    const classLearners = learnerProfiles.filter((l) => l.sectionId === a.sectionId);
    for (const l of classLearners) {
      const raw = Math.min(a.max, scores[scoreIdx++ % scores.length]!);
      await prisma.studentGrade.create({
        data: {
          assessmentId: a.id,
          studentId: l.userId,
          rawScore: raw,
          percentageScore: Math.round((raw / a.max) * 10000) / 100,
        },
      });
    }
    // one roster learner per assessment keeps the roster side populated too
    const roster = rosters.find((r) => r.sectionId === a.sectionId);
    if (roster) {
      const raw = Math.min(a.max, scores[scoreIdx++ % scores.length]!);
      await prisma.studentGrade.create({
        data: { assessmentId: a.id, rosterId: roster.id, rawScore: raw, percentageScore: Math.round((raw / a.max) * 10000) / 100 },
      });
    }
  }

  const finalGrades: { id: string }[] = [];
  for (const [i, l] of learnerProfiles.entries()) {
    for (const [j, code] of ["MATH7", "ENG7"].entries()) {
      const avg = 78 + ((i + j) % 5) * 3;
      finalGrades.push(
        await prisma.finalGrade.create({
          data: {
            studentId: l.userId,
            subjectId: subjects[code === "MATH7" ? "MATH7" : "ENG7"]!.id,
            termId: term1.id,
            computedAverage: avg,
            transmutedGrade: avg >= 75 ? avg : 74,
            remarks: avg >= 75 ? "Passed" : "Failed",
            lockStatus: "adviser_approved",
            lockedBy: l.userId,
            lockedAt: d("2026-09-11"),
            adviserApprovedBy: adviser.id,
            adviserApprovedAt: d("2026-09-12"),
          },
        }),
      );
    }
  }
  // roster learner final grade
  for (const r of rosters.slice(0, 2)) {
    await prisma.finalGrade.create({
      data: {
        rosterId: r.id,
        subjectId: subjects["MATH7"]!.id,
        termId: term1.id,
        computedAverage: 82,
        transmutedGrade: 82,
        remarks: "Passed",
        lockStatus: "locked",
        lockedBy: subjectTeacher.id,
        lockedAt: d("2026-09-11"),
      },
    });
  }

  // ------------------------------------------------------------ attendance
  const attendanceDates = ["2026-08-03", "2026-08-04", "2026-08-05"];
  const statuses = ["present", "present", "late", "absent", "excused"] as const;
  let stIdx = 0;
  for (const [i, l] of learnerProfiles.entries()) {
    for (const date of attendanceDates) {
      await prisma.attendanceRecord.create({
        data: {
          studentId: l.userId,
          sectionId: l.sectionId,
          date: d(date),
          session: i % 2 === 0 ? "AM" : "PM",
          status: statuses[stIdx++ % statuses.length]!,
          recordedBy: adviser.id,
          termId: term1.id,
          slot: 1,
        },
      });
    }
  }
  for (const [i, r] of rosters.entries()) {
    await prisma.attendanceRecordLegacy.create({
      data: {
        id: `legacy-att-${rt()}-${i}`,
        rosterId: r.id,
        sectionId: r.sectionId,
        date: d(attendanceDates[i % attendanceDates.length]!),
        session: i % 2 === 0 ? "AM" : "PM",
        status: statuses[i % statuses.length]!,
        recordedBy: adviser.id,
        termId: term1.id,
      },
    });
  }

  // ---------------------------------------------------- anecdotal + folders
  const folders: { id: string }[] = [];
  for (const name of ["Behavioral Concerns", "Academic Follow-ups", "Attendance Notes", "Health Referrals", "Parent Conferences"]) {
    folders.push(await prisma.anecdotalFolder.create({ data: { ownerId: adviser.id, name } }));
  }

  const anecdoteSpec = [
    { category: "behavioral", text: "Repeatedly talking with seatmates during Mathematics class despite verbal reminders.", student: 0, folder: 0 },
    { category: "bullying", text: "Reported by classmates for teasing a Grade 7 learner during recess.", student: 1, folder: 0 },
    { category: "academic", text: "Submitted three consecutive missing written works in English 7.", student: 2, folder: 1 },
    { category: "attendance", text: "Absent for four consecutive days without a letter from the parent.", student: 3, folder: 2 },
    { category: "health", text: "Complained of recurring headache and dizziness after the flag ceremony.", student: 4, folder: 3 },
  ] as const;

  const anecdotes: { id: string; studentIndex: number }[] = [];
  for (const [i, a] of anecdoteSpec.entries()) {
    const l = learnerProfiles[a.student]!;
    const row = await prisma.anecdotalRecord.create({
      data: {
        studentId: l.userId,
        observerId: adviser.id,
        sectionId: l.sectionId,
        observationDatetime: at(`2026-08-1${i}T02:30:00.000Z`),
        descriptionOfIncident: a.text,
        descriptionOfLocation: "Room 204, MSAT Main Building",
        notesRecommendationsActions: "Discussed with the learner; parent informed through the adviser's logbook.",
        classPerformance: "Satisfactory",
        attendanceSummary: "2 absences, 1 late this month",
        termId: term1.id,
        category: a.category,
        confidentialityLevel: "restricted",
        folderId: folders[a.folder]!.id,
        signedBy: adviser.id,
        signedAt: at(`2026-08-1${i}T06:00:00.000Z`),
      },
    });
    anecdotes.push({ id: row.id, studentIndex: a.student });
  }
  for (const [i, a] of anecdotes.entries()) {
    await prisma.anecdotalRecordFollowup.create({
      data: {
        anecdotalRecordId: a.id,
        followupBy: adviser.id,
        followupDate: at(`2026-08-2${i}T01:00:00.000Z`),
        notes: "Follow-up conference held; learner committed to improved attendance.",
      },
    });
  }

  // --------------------------------------------------------------- referrals
  const referralSpec = [
    { target: "guidance_counselor" as const, status: "in_progress" as const, reason: "Repeated classroom disruption affecting the section's recitation schedule." },
    { target: "guidance_counselor" as const, status: "resolved" as const, reason: "Learner reported being teased by older students along the corridor." },
    { target: "nurse" as const, status: "in_progress" as const, reason: "Frequent headache and dizziness reported during class hours." },
    { target: "nurse" as const, status: "dismissed" as const, reason: "Minor wound on the right hand from a TLE workshop activity." },
    { target: "adm_coordinator" as const, status: "escalated" as const, reason: "Learner has four consecutive weeks of absence; family situation needs ADM assessment." },
  ];
  const referrals: { id: string; target: string; studentIndex: number }[] = [];
  for (const [i, r] of referralSpec.entries()) {
    const a = anecdotes[i]!;
    const l = learnerProfiles[a.studentIndex]!;
    const row = await prisma.referral.create({
      data: {
        anecdotalRecordId: a.id,
        referredToRole: r.target,
        referredBy: adviser.id,
        reason: r.reason,
        status: r.status,
        priority: i < 2 ? "high" : "normal",
        notes: "Referred after a follow-up conference with the learner.",
        studentId: l.userId,
        termId: term1.id,
        consultReviewer: r.target,
        consultReviewedAt: d("2026-08-20"),
        referralFormReady: true,
        acceptedAt: d("2026-08-20"),
      },
    });
    referrals.push({ id: row.id, target: r.target, studentIndex: a.studentIndex });
  }

  // ADM cases: one profile per ADM referral (5 total), so re-use the ADM referral
  // and add four more ADM referrals to cover five learners.
  const admReferrals = [referrals[4]!];
  for (const [i, l] of learnerProfiles.slice(1, 5).entries()) {
    const anecdote = await prisma.anecdotalRecord.create({
      data: {
        studentId: l.userId,
        observerId: adviser.id,
        sectionId: l.sectionId,
        observationDatetime: at(`2026-08-2${i}T02:00:00.000Z`),
        descriptionOfIncident: "Learner's family requested alternative delivery arrangements due to work-related relocation.",
        termId: term1.id,
        category: "attendance",
        folderId: folders[2]!.id,
      },
    });
    const row = await prisma.referral.create({
      data: {
        anecdotalRecordId: anecdote.id,
        referredToRole: "adm_coordinator",
        referredBy: adviser.id,
        reason: "Family requested ADM assessment for continued learning while working.",
        status: "escalated",
        studentId: l.userId,
        termId: term1.id,
        consultReviewer: "adm_coordinator",
        consultReviewedAt: d("2026-08-25"),
        referralFormReady: true,
      },
    });
    admReferrals.push({ id: row.id, target: "adm_coordinator", studentIndex: 0 });
  }

  // ------------------------------------------------------ counseling sessions
  const guidanceReferrals = referrals.filter((r) => r.target === "guidance_counselor");
  const sessionSpec = [
    { type: "individual_counseling", at: "2026-08-26T01:00:00.000Z", status: "completed", notes: "Learner identified seatmate conflict as the source of disruption." },
    { type: "group_counseling", at: "2026-08-27T02:00:00.000Z", status: "completed", notes: "Five learners joined a session on respectful classroom behavior." },
    { type: "parent_conference", at: "2026-09-01T01:30:00.000Z", status: "scheduled", notes: null },
    { type: "follow_up", at: "2026-09-03T02:30:00.000Z", status: "cancelled", notes: "Learner was out of school due to a barangay activity." },
    { type: "individual_counseling", at: "2026-09-04T03:00:00.000Z", status: "scheduled", notes: null },
  ];
  const sessions: { id: string }[] = [];
  for (const [i, s] of sessionSpec.entries()) {
    const ref = guidanceReferrals[i % guidanceReferrals.length]!;
    sessions.push(
      await prisma.counselingSession.create({
        data: {
          referralId: ref.id,
          sessionType: s.type,
          scheduledAt: at(s.at),
          venue: "Guidance Office, MSAT",
          status: s.status,
          sessionNotes: s.notes,
          outcome: s.status === "completed" ? "Learner agreed to a behavior contract with the adviser." : null,
          cancelReason: s.status === "cancelled" ? "Learner absent" : null,
          createdBy: guidance.id,
          completedAt: s.status === "completed" ? at(s.at) : null,
        },
      }),
    );
  }
  for (const [i, s] of sessions.entries()) {
    await prisma.clinicSessionAttachment.create({
      data: {
        sessionId: s.id,
        fileUrl: `https://fqqhezpdniohylybujhp.supabase.co/storage/v1/object/public/referral-docs/sessions/session-${i + 1}-notes.pdf`,
        fileName: `counseling-session-${i + 1}-notes.pdf`,
        mimeType: "application/pdf",
        fileSize: 184_320 + i * 2048,
        uploadedBy: guidance.id,
      },
    });
  }

  // ------------------------------------------------------------ interventions
  for (const [i, spec] of [
    { level: "High" as const, action: "Weekly counseling session and behavior contract monitoring." },
    { level: "Moderate" as const, action: "Parent-teacher conference and daily attendance monitoring." },
    { level: "Moderate" as const, action: "Referral to the school nurse for recurring headaches; stress management." },
    { level: "High" as const, action: "Home visitation with the barangay and ADM orientation." },
    { level: "Low" as const, action: "Peer tutoring in Mathematics after class." },
  ].entries()) {
    const l = learnerProfiles[i % learnerProfiles.length]!;
    await prisma.intervention.create({
      data: {
        studentId: l.userId,
        riskLevelAtFlag: spec.level,
        recommendedAction: spec.action,
        assignedTo: guidance.id,
        assignedAt: d("2026-08-28"),
        approvalStatus: i % 2 === 0 ? "approved" : "pending",
        outcomeStatus: i < 2 ? "resolved" : "ongoing",
        outcomeNotes: i < 2 ? "Learner showed improvement in the last two weeks." : null,
        priority: spec.level === "High" ? "high" : "normal",
        termId: term1.id,
      },
    });
  }

  // ------------------------------------------------- health + home visitation
  const healthSpec = [
    { complaint: "Headache and dizziness", diagnosis: "Tension headache", treatment: "Rest at the clinic, 500 ml oral hydration; advised to see a physician if it recurs." },
    { complaint: "Stomach ache", diagnosis: "Mild gastritis", treatment: "Antacid given; advised to eat breakfast before coming to school." },
    { complaint: "Minor cut on the right hand", diagnosis: "Superficial laceration", treatment: "Wound cleaned and dressed; tetanus status verified with the parent." },
    { complaint: "Fever, 38.1°C", diagnosis: "Viral fever", treatment: "Paracetamol given; parent notified and learner sent home." },
    { complaint: "Sprained ankle during PE", diagnosis: "Grade 1 ankle sprain", treatment: "RICE protocol applied; advised 3 days rest and follow-up." },
  ];
  for (const [i, h] of healthSpec.entries()) {
    const l = learnerProfiles[i]!;
    await prisma.healthRecord.create({
      data: {
        studentId: l.userId,
        referralId: referrals[i % referrals.length]!.id,
        visitDatetime: at(`2026-08-${10 + i}T01:00:00.000Z`),
        complaint: h.complaint,
        diagnosis: h.diagnosis,
        treatmentGiven: h.treatment,
        recordedBy: nurse.id,
        termId: term1.id,
        confidentialityLevel: "restricted",
      },
    });
  }

  const visitSpec = [
    { person: "Mrs. Elena B. Dizon (Mother)", home: "Concrete house, 2 rooms, with electricity and running water.", family: "Both parents employed; learner shares a study area with two siblings." },
    { person: "Mr. Benjamin R. Maturan (Father)", home: "Semi-concrete house near the shoreline; affected by high tide.", family: "Father is a fisherman; learner helps with the family livelihood before school." },
    { person: "Mrs. Marilyn S. Lumactod (Mother)", home: "Sari-sari store at the front of the residence.", family: "Mother manages the store; learner minds the store after class." },
    { person: "Mr. Dante M. Abad (Father)", home: "Boarding house shared with relatives.", family: "Father works out of town; learner stays with an aunt." },
    { person: "Ms. Rosalie T. Pineda (Guardian)", home: "Barangay housing unit.", family: "Guardian is a barangay health worker; learner's mother works abroad." },
  ];
  for (const [i, v] of visitSpec.entries()) {
    const l = learnerProfiles[i]!;
    await prisma.homeVisitationRecord.create({
      data: {
        studentId: l.userId,
        referralId: referrals[i % referrals.length]!.id,
        personVisited: v.person,
        homeCondition: v.home,
        familyCondition: v.family,
        agreements: "Parent will monitor the learner's attendance weekly and inform the adviser of any absence.",
        certificationBy: guidance.id,
        termId: term1.id,
        confidentialityLevel: "restricted",
      },
    });
  }

  // -------------------------------------------------------------------- ADM
  const admStages = ["consultation", "meeting_parents", "home_visitation", "certification", "enrollment_monitoring"] as const;
  const admProfiles: { id: string; studentIndex: number }[] = [];
  for (const [i, ref] of admReferrals.entries()) {
    const l = learnerProfiles[ref.studentIndex + (i === 0 ? 0 : 0)] ?? learnerProfiles[i]!;
    const profile = await prisma.admLearnerProfile.create({
      data: {
        studentId: l.userId,
        referralId: ref.id,
        eligibilityStatus: i === 4 ? "eligible" : "pending",
        stage: admStages[i % admStages.length]!,
        preparedBy: admCoord.id,
        approvedBy: i === 4 ? principal.id : null,
        approvedAt: i === 4 ? d("2026-09-05") : null,
        certificationDetails: {
          reason: "Alternative Delivery Mode due to family livelihood constraints",
          reviewedBy: "ADM Coordinator",
        },
        termId: term1.id,
        confidentialityLevel: "restricted",
      },
    });
    admProfiles.push({ id: profile.id, studentIndex: i });
  }

  const meetingVenues = ["MSAT Conference Room", "Guidance Office", "Barangay Hall", "MSAT Conference Room", "Home visit"] as const;
  for (const [i, profile] of admProfiles.entries()) {
    const meeting = await prisma.admParentMeeting.create({
      data: {
        admLearnerProfileId: profile.id,
        referralId: admReferrals[i]!.id,
        recordedBy: admCoord.id,
        meetingDatetime: at(`2026-08-2${i}T02:00:00.000Z`),
        venue: meetingVenues[i]!,
        attended: i !== 3,
        parentConfirmedAt: i !== 3 ? at(`2026-08-2${i}T01:30:00.000Z`) : null,
        minutesOfMeeting: "Orientation on the ADM program, module release schedule and submission expectations.",
        attendees: ["ADM Coordinator", "Adviser", "Parent/Guardian"],
      },
    });
    await prisma.admMeetingInvitee.create({
      data: { meetingId: meeting.id, userId: [adviser.id, guidance.id, principal.id, nurse.id, admCoord.id][i]! },
    });
    await prisma.admMeetingAttachment.create({
      data: {
        meetingId: meeting.id,
        fileUrl: `https://fqqhezpdniohylybujhp.supabase.co/storage/v1/object/public/referral-docs/adm/meeting-${i + 1}-minutes.pdf`,
        fileName: `adm-meeting-${i + 1}-minutes.pdf`,
        mimeType: "application/pdf",
        fileSize: 96_256,
        uploadedBy: admCoord.id,
      },
    });
    await prisma.admModule.create({
      data: {
        admLearnerProfileId: profile.id,
        moduleName: `Quarter 1 Module ${i + 1} – Mathematics 7`,
        releaseDate: d("2026-08-25"),
        dueDate: d("2026-09-08"),
        submitted: i < 2,
        submissionDate: i < 2 ? d("2026-09-06") : null,
        recordedBy: admCoord.id,
      },
    });
    await prisma.admDevice.create({
      data: {
        admLearnerProfileId: profile.id,
        deviceType: i % 2 === 0 ? "Tablet" : "Laptop",
        deviceSerial: `MSAT-ADM-2026-${String(i + 1).padStart(4, "0")}`,
        issuedBy: admCoord.id,
        issuedDate: d("2026-08-25"),
        returnedDate: i === 4 ? null : null,
        conditionNotes: "Issued in good condition with charger and case.",
      },
    });
    await prisma.admForm.create({
      data: {
        admLearnerProfileId: profile.id,
        formType: i === 4 ? "PRINCIPAL_SIGNAGE" : "CERTIFICATION",
        title: i === 4 ? "Principal's Approval of ADM Enrolment" : "ADM Certification of Eligibility",
        status: i === 4 ? "verified" : "submitted",
        uploadedBy: admCoord.id,
        notes: "Scanned copy filed with the ADM coordinator.",
      },
    });
  }

  // ------------------------------------------------------------- advisory modules
  const modules: { id: string }[] = [];
  const moduleNames = [
    "Homeroom Guidance Module 1 – Self-awareness",
    "Homeroom Guidance Module 2 – Family and community",
    "Reading Intervention 1 – Context clues",
    "Reading Intervention 2 – Main idea",
    "Values Formation – Respect and responsibility",
  ];
  for (const [i, name] of moduleNames.entries()) {
    modules.push(
      await prisma.advisoryModule.create({
        data: {
          sectionId: [amethyst.id, amethyst.id, emerald.id, ruby.id, amethyst.id][i]!,
          termId: term1.id,
          kind: "general",
          moduleName: name,
          moduleUrl: `https://drive.google.com/file/d/msat-advisory-module-${i + 1}`,
          description: "Answer the activity sheet and submit through the adviser's link.",
          releaseDate: d("2026-08-18"),
          dueDate: d("2026-08-29"),
          createdBy: adviser.id,
        },
      }),
    );
  }
  const submissionKinds = ["link", "file", "physical", "link", "file"] as const;
  for (const [i, m] of modules.entries()) {
    const l = learnerProfiles[i % learnerProfiles.length]!;
    await prisma.advisoryModuleSubmission.create({
      data: {
        moduleId: m.id,
        studentId: l.userId,
        submissionUrl: submissionKinds[i] === "link" ? `https://docs.google.com/document/d/msat-submission-${i + 1}` : null,
        submissionKind: submissionKinds[i]!,
        fileUrl: submissionKinds[i] === "file" ? `https://fqqhezpdniohylybujhp.supabase.co/storage/v1/object/public/zentra-docs/advisory/submission-${i + 1}.pdf` : null,
        fileName: submissionKinds[i] === "file" ? `advisory-submission-${i + 1}.pdf` : null,
        fileMimeType: submissionKinds[i] === "file" ? "application/pdf" : null,
        fileSize: submissionKinds[i] === "file" ? 245_760 : null,
        submitted: true,
        submittedAt: d("2026-08-27"),
        remarks: submissionKinds[i] === "physical" ? "Passed in person to the adviser." : "Submitted on time.",
        recordedBy: adviser.id,
      },
    });
  }

  // -------------------------------------------------------------------- SF10
  const sf10Spec = [
    { lrn: "136207010001", name: "Ma. Cristina B. Dizon", grade: "G7" as const, desk: "record_keeper" as const },
    { lrn: "136207010002", name: "John Paul R. Maturan", grade: "G7" as const, desk: "record_keeper" as const },
    { lrn: "136207010003", name: "Angela Mae S. Lumactod", grade: "G7" as const, desk: "record_keeper" as const },
    { lrn: "136207020004", name: "Kervin Jay D. Abad", grade: "G8" as const, desk: "record_keeper" as const },
    { lrn: "136207110005", name: "Lovely Grace T. Pineda", grade: "G11" as const, desk: "registrar" as const },
  ];
  const sf10Records: { id: string }[] = [];
  for (const [i, s] of sf10Spec.entries()) {
    const rec = await prisma.sf10Record.create({
      data: {
        lrn: s.lrn,
        learnerName: s.name,
        gradeLevel: s.grade,
        desk: s.desk,
        source: i % 2 === 0 ? "ocr_upload" : "manual",
        status: i === 4 ? "released" : "available",
        uploadedFileUrl: `https://fqqhezpdniohylybujhp.supabase.co/storage/v1/object/public/zentra-docs/sf10/${s.lrn}-SF10.pdf`,
        uploadedAt: d("2026-07-01"),
        ocrExtractedData: { lrn: s.lrn, name: s.name, school: "Mati School of Arts and Trades" },
        verifiedBy: s.desk === "record_keeper" ? recordKeeper.id : registrar.id,
        verifiedAt: d("2026-07-03"),
        validatedBy: s.desk === "record_keeper" ? recordKeeper.id : registrar.id,
        validatedAt: d("2026-07-05"),
        releasedAt: i === 4 ? d("2026-07-08") : null,
        currentVersion: 1,
      },
    });
    sf10Records.push(rec);
    await prisma.sf10RecordVersion.create({
      data: {
        sf10RecordId: rec.id,
        versionNumber: 1,
        dataSnapshot: { lrn: s.lrn, learnerName: s.name, gradeLevel: s.grade, subjects: { "Mathematics 7": 88, "English 7": 90 } },
        changedBy: s.desk === "record_keeper" ? recordKeeper.id : registrar.id,
        changeReason: "Initial upload from the learner's previous school record",
      },
    });
  }

  const accessReasons = [
    "Verify the learner's grades for the Section 7-Amethyst SF10 autofill.",
    "Confirm the SF10 record of a transferee before grading.",
    "Cross-check the learner's previous-school subjects.",
    "Prepare the advisory honor roll.",
    "Validate quarterly grades before releasing the card.",
  ];
  for (const [i, req] of [
    { section: amethyst.id, lrns: ["136207010001", "136207010002"], status: "approved" as const },
    { section: emerald.id, lrns: ["136207010003"], status: "pending" as const },
    { section: ruby.id, lrns: [], status: "pending" as const },
    { section: narra.id, lrns: ["136207020004"], status: "approved" as const },
    { section: molave.id, lrns: [], status: "denied" as const },
  ].entries()) {
    await prisma.adviserSf10AccessRequest.create({
      data: {
        adviserId: adviser.id,
        sectionId: req.section,
        gradeLevel: (i < 3 ? "G7" : "G8") as "G7" | "G8",
        reason: accessReasons[i]!,
        requestedLrns: req.lrns,
        approvedLrns: req.status === "approved" ? req.lrns : [],
        status: req.status,
        decidedBy: req.status === "pending" ? null : recordKeeper.id,
        decidedAt: req.status === "pending" ? null : d("2026-07-10"),
        decisionReason: req.status === "denied" ? "SF10 not yet filed for this section." : null,
      },
    });
  }

  // ------------------------------------------------- risk / reports / flags
  for (const [i, l] of learnerProfiles.entries()) {
    await prisma.riskSnapshot.create({
      data: {
        studentId: l.userId,
        riskLevel: i < 2 ? "High" : i === 2 ? "Moderate" : "Low",
        riskLevelRaw: i < 2 ? "High" : "Moderate",
        riskLevelFinal: i < 2 ? "High" : i === 2 ? "Moderate" : "Low",
        academicFlag: i < 2,
        attendanceFlag: i === 3,
        behavioralFlag: i === 1,
        academicFlagRaw: i < 2,
        attendanceFlagRaw: i === 3,
        behavioralFlagRaw: i === 1,
        riskCount: i < 2 ? 3 : i === 2 ? 2 : 1,
        snapshotDate: d("2026-09-01"),
        termId: term1.id,
      },
    });
  }

  const reportTypes = [
    { reportType: "trends", scope: "school" },
    { reportType: "intervention_success", scope: "grade" },
    { reportType: "heat_map", scope: "section" },
    { reportType: "honor_roll", scope: "grade" },
    { reportType: "trends", scope: "section" },
  ];
  for (const [i, r] of reportTypes.entries()) {
    await prisma.reportSnapshot.create({
      data: {
        reportType: r.reportType,
        scope: r.scope,
        scopeId: r.scope === "section" ? amethyst.id : r.scope === "grade" ? "G7" : null,
        termId: term1.id,
        payload: { generated: "2026-09-15", rows: 5, note: "Sample snapshot generated by the sample-5 seed" },
        generatedAt: d("2026-09-15"),
      },
    });
  }

  const flagReasons = ["wrong_score", "missing_assessment", "transmutation_error", "late_submission", "other"] as const;
  for (const [i, reason] of flagReasons.entries()) {
    const l = learnerProfiles[i]!;
    await prisma.gradeFlag.create({
      data: {
        studentId: l.userId,
        subjectId: subjects[i % 2 === 0 ? "MATH7" : "ENG7"]!.id,
        sectionId: l.sectionId,
        termId: term1.id,
        reason,
        note: "Raised from the learner's grade consultation.",
        status: i < 3 ? "open" : "resolved",
        raisedBy: i % 2 === 0 ? adviser.id : subjectTeacher.id,
        ownerId: adviser.id,
        resolvedBy: i < 3 ? null : subjectTeacher.id,
        resolvedAt: i < 3 ? null : d("2026-09-09"),
        resolutionNote: i < 3 ? null : "Score corrected after re-checking the answer sheet.",
      },
    });
  }

  // ---------------------------------------------------- notifications / audit
  const notifications = [
    { to: guidance.id, type: "referral_created", message: "New referral for Ma. Cristina B. Dizon from the Grade 7 adviser." },
    { to: nurse.id, type: "referral_created", message: "New clinic referral for Kervin Jay D. Abad." },
    { to: admCoord.id, type: "adm_referral", message: "ADM case forwarded for Lovely Grace T. Pineda." },
    { to: adviser.id, type: "session_scheduled", message: "Guidance booked a counseling session for John Paul R. Maturan." },
    { to: principal.id, type: "adm_approval", message: "An ADM case is ready for the principal's signature." },
  ];
  for (const [i, n] of notifications.entries()) {
    await prisma.notification.create({
      data: {
        userId: n.to,
        type: n.type,
        sourceTable: "Referral",
        sourceId: referrals[i % referrals.length]!.id,
        channel: ["web"],
        message: n.message,
        isRead: i > 2,
      },
    });
  }

  const auditSpec = [
    { action: "referral_status_change" as const, table: "Referral" },
    { action: "session_scheduled" as const, table: "CounselingSession" },
    { action: "grade_lock" as const, table: "FinalGrade" },
    { action: "sf10_update" as const, table: "Sf10Record" },
    { action: "account_approval" as const, table: "User" },
  ];
  for (const [i, a] of auditSpec.entries()) {
    await prisma.auditLog.create({
      data: {
        userId: [adviser.id, guidance.id, subjectTeacher.id, recordKeeper.id, registrar.id][i]!,
        actionType: a.action,
        sourceTable: a.table,
        sourceId: referrals[i % referrals.length]!.id,
        reason: "Sample audit trail generated by the sample-5 seed",
        oldValue: { status: "pending" },
        newValue: { status: "in_progress" },
      },
    });
  }

  for (const [i, u] of [adviser, guidance, nurse, registrar, recordKeeper].entries()) {
    await prisma.loginEvent.create({
      data: {
        userId: u.id,
        ip: `112.198.${68 + i}.${20 + i * 7}`,
        kind: i === 4 ? "logout" : "login",
        occurredAt: at(`2026-09-0${i + 1}T00:15:00.000Z`),
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: u.id,
        tokenHash: `sample-refresh-token-hash-${i + 1}-${rt()}`,
        expiresAt: at("2026-12-01T00:00:00.000Z"),
      },
    });
  }

  for (const [i, r] of rosters.entries()) {
    await prisma.adviserArchivedStudent.create({
      data: { teacherId: adviser.id, rosterId: r.id },
    });
    if (i < 2) {
      await prisma.adviserArchivedStudent.create({
        data: { teacherId: adviser.id, studentId: learnerProfiles[i % learnerProfiles.length]!.userId },
      });
    }
  }
  // unarchive one so the archived list is a real, small set
  await prisma.adviserArchivedStudent.deleteMany({ where: { teacherId: adviser.id, rosterId: rosters[0]!.id } });

  // ---------------------------------------------------------------- counts
  const counts: Record<string, number> = {};
  for (const [name, model] of Object.entries({
    User: prisma.user,
    LoginEvent: prisma.loginEvent,
    StudentProfile: prisma.studentProfile,
    ParentProfile: prisma.parentProfile,
    ParentStudentLink: prisma.parentStudentLink,
    StaffProfile: prisma.staffProfile,
    SchoolYear: prisma.schoolYear,
    Term: prisma.term,
    Section: prisma.section,
    StudentRoster: prisma.studentRoster,
    TermRosterConfirmation: prisma.termRosterConfirmation,
    Subject: prisma.subject,
    TeacherSubjectAssignment: prisma.teacherSubjectAssignment,
    ScheduleConfig: prisma.scheduleConfig,
    SectionTimetableEntry: prisma.sectionTimetableEntry,
    TeacherName: prisma.teacherName,
    TeacherTermGrant: prisma.teacherTermGrant,
    AdviserArchivedStudent: prisma.adviserArchivedStudent,
    GradeComponent: prisma.gradeComponent,
    Assessment: prisma.assessment,
    StudentGrade: prisma.studentGrade,
    FinalGrade: prisma.finalGrade,
    GradeFlag: prisma.gradeFlag,
    AttendanceRecord: prisma.attendanceRecord,
    AttendanceRecordLegacy: prisma.attendanceRecordLegacy,
    AnecdotalRecord: prisma.anecdotalRecord,
    AnecdotalFolder: prisma.anecdotalFolder,
    AnecdotalRecordFollowup: prisma.anecdotalRecordFollowup,
    Referral: prisma.referral,
    CounselingSession: prisma.counselingSession,
    ClinicSessionAttachment: prisma.clinicSessionAttachment,
    Intervention: prisma.intervention,
    HealthRecord: prisma.healthRecord,
    HomeVisitationRecord: prisma.homeVisitationRecord,
    AdmLearnerProfile: prisma.admLearnerProfile,
    AdmParentMeeting: prisma.admParentMeeting,
    AdmMeetingInvitee: prisma.admMeetingInvitee,
    AdmMeetingAttachment: prisma.admMeetingAttachment,
    AdmModule: prisma.admModule,
    AdmDevice: prisma.admDevice,
    AdmForm: prisma.admForm,
    AdvisoryModule: prisma.advisoryModule,
    AdvisoryModuleSubmission: prisma.advisoryModuleSubmission,
    Sf10Record: prisma.sf10Record,
    Sf10RecordVersion: prisma.sf10RecordVersion,
    AuditLog: prisma.auditLog,
    RiskSnapshot: prisma.riskSnapshot,
    ReportSnapshot: prisma.reportSnapshot,
    AdviserSf10AccessRequest: prisma.adviserSf10AccessRequest,
    Notification: prisma.notification,
    RefreshToken: prisma.refreshToken,
  } as Record<string, { count: () => Promise<number> }>)) {
    counts[name] = await model.count();
  }

  const thin = Object.entries(counts).filter(([, n]) => n < 5);
  console.log("Sample seed complete in", Math.round((Date.now() - t0) / 1000), "s");
  console.table(counts);
  if (thin.length > 0) {
    console.warn("Tables under 5 rows:", thin.map(([n, c]) => `${n}=${c}`).join(", "));
  } else {
    console.log("Every table has at least 5 rows.");
  }
  console.log(`
Logins
  admin@zentra.test / Admin2025!
  student@zentra.test / Student2025!   parent@zentra.test / Parent2025!
  every staff role @zentra.test / Zentra2025!
  demo learners: cristina.dizon@student.zentra.test / Student2025! (5 of them)
  demo parents:  mother.dizon@parent.zentra.test / Parent2025! (5 of them)`);
}

function rt() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * The Supabase pooler occasionally drops a session mid-run (`P1017`). The seed
 * wipes first, so replaying the whole run is safe — just retry on transient
 * connection failures instead of leaving a half-seeded database behind.
 */
async function withConnectionRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  const transient = new Set(["P1017", "P1001", "P1011", "P2024"]);
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const code = (e as { code?: string }).code ?? "";
      if (!transient.has(code)) throw e;
      console.warn(`transient ${code} — retrying seed (${i + 1}/${tries})`);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

withConnectionRetry(main)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
