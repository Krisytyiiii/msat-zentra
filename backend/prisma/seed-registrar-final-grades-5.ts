import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";
import { DEPED_JHS_WEIGHTS, computeFinalGrade } from "../src/services/grading.js";
import type { ComponentType } from "../src/generated/prisma/client.js";

/**
 * Registrar final-grades demo seed — five complete grade sets for the
 * `/registrar/final-grades` workspace (G11–G12 band).
 *
 * The desk only lists a learner once every subject of their term is locked or
 * adviser-approved, so this seed writes the whole chain instead of bare
 * FinalGrade rows: Users + StudentProfiles (+ one roster-only learner),
 * StudentRoster, Section, Subject, TeacherSubjectAssignment, GradeComponent,
 * Assessment, StudentGrade and the computed FinalGrade (DepEd transmutation).
 *
 * Data lands in the term the admin has configured as active (date-picked from
 * the active school year, today → term 2). Four learners carry a login
 * account (one is roster-only, like a truly enlisted learner); one subject of
 * the last learner stays `locked` so the "Awaiting sign-off" tile is non-zero.
 *
 * Idempotent — users keyed by email/LRN, finals by (learner, subject, term).
 * Any rows an earlier run left in another term are removed, so the desk never
 * shows the same learner twice across terms.
 * Run: npm run prisma:seed:registrar-final-grades-5
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const STAFF_PASSWORD = "Zentra2025!";
const STUDENT_PASSWORD = "Student2025!";

const G11_SECTION = "Grade 11 - STEM (Rizal)";
const G12_SECTION = "Grade 12 - ABM (Bonifacio)";

type LearnerSeed = {
  email: string;
  lrn: string;
  fullName: string;
  gradeLevel: "G11" | "G12";
  birthdate: string;
  gender: string;
  address: string;
  hasAccount: boolean;
  sectionName: string;
  /** Base rating input — assessments jitter around this. */
  base: number;
};

const LEARNERS: LearnerSeed[] = [
  {
    email: "136130000001@students.zentra.test",
    lrn: "136130000001",
    fullName: "Hannah Grace Dizon",
    gradeLevel: "G11",
    birthdate: "2009-03-18T00:00:00.000Z",
    gender: "Female",
    address: "21 Sampaguita St., Brgy. Malandang, Marikina City",
    hasAccount: true,
    sectionName: G11_SECTION,
    base: 93,
  },
  {
    email: "136130000002@students.zentra.test",
    lrn: "136130000002",
    fullName: "Marc Vincent Aquino",
    gradeLevel: "G11",
    birthdate: "2009-08-02T00:00:00.000Z",
    gender: "Male",
    address: "7 Ilang-Ilang St., Brgy. Parang, Marikina City",
    hasAccount: true,
    sectionName: G11_SECTION,
    base: 88,
  },
  {
    email: "136130000003@students.zentra.test",
    lrn: "136130000003",
    fullName: "Sofia Isabelle Ramos",
    gradeLevel: "G11",
    birthdate: "2009-12-11T00:00:00.000Z",
    gender: "Female",
    address: "99 V. Santos St., Brgy. Concepcion Uno, Marikina City",
    hasAccount: false,
    sectionName: G11_SECTION,
    base: 84,
  },
  {
    email: "136130000004@students.zentra.test",
    lrn: "136130000004",
    fullName: "Daniel James Fernandez",
    gradeLevel: "G12",
    birthdate: "2008-06-25T00:00:00.000Z",
    gender: "Male",
    address: "12 Mabolo St., Brgy. Tumana, Marikina City",
    hasAccount: true,
    sectionName: G12_SECTION,
    base: 90,
  },
  {
    email: "136130000005@students.zentra.test",
    lrn: "136130000005",
    fullName: "Camille Joy Navarro",
    gradeLevel: "G12",
    birthdate: "2008-09-07T00:00:00.000Z",
    gender: "Female",
    address: "45 Narra St., Brgy. San Roque, Marikina City",
    hasAccount: true,
    sectionName: G12_SECTION,
    base: 86,
  },
];

type WeightProfile = "LANG" | "MATH";

const SUBJECTS: {
  code: string;
  name: string;
  gradeLevel: "G11" | "G12";
  category: "CORE" | "ELECTIVE";
  weights: WeightProfile;
}[] = [
  { code: "ORALCOMM11", name: "Oral Communication in Context", gradeLevel: "G11", category: "CORE", weights: "LANG" },
  { code: "GENMATH11", name: "General Mathematics", gradeLevel: "G11", category: "CORE", weights: "MATH" },
  { code: "EARTHLIFE11", name: "Earth and Life Science", gradeLevel: "G11", category: "CORE", weights: "MATH" },
  { code: "KOMUNIKASYON11", name: "Komunikasyon at Pananaliksik", gradeLevel: "G11", category: "CORE", weights: "LANG" },
  { code: "PRACRES12", name: "Practical Research 2", gradeLevel: "G12", category: "CORE", weights: "MATH" },
  { code: "ENTREP12", name: "Entrepreneurship", gradeLevel: "G12", category: "CORE", weights: "LANG" },
  { code: "MIL12", name: "Media and Information Literacy", gradeLevel: "G12", category: "CORE", weights: "LANG" },
  { code: "PEH12", name: "Physical Education and Health 2", gradeLevel: "G12", category: "CORE", weights: "LANG" },
];

const COMPONENTS: { type: ComponentType; titles: string[]; max: number }[] = [
  { type: "WRITTEN_WORK", titles: ["Quiz 1", "Quiz 2"], max: 50 },
  { type: "PERFORMANCE_TASK", titles: ["Performance Task 1", "Performance Task 2"], max: 100 },
  { type: "EXAM", titles: ["Midterm Exam", "Final Exam"], max: 100 },
];

const WEIGHTS: Record<WeightProfile, { WRITTEN_WORK: number; PERFORMANCE_TASK: number; EXAM: number }> = {
  LANG: { ...DEPED_JHS_WEIGHTS[0].weights },
  MATH: { ...DEPED_JHS_WEIGHTS[1].weights },
};

function jitter(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function assessmentPct(key: string, base: number): number {
  const pct = base + jitter(key) * 8 - 4; // -4..+4 around the learner base
  return Math.min(100, Math.max(65, Math.round(pct * 10) / 10));
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const registrar = await prisma.user.findFirst({
    where: { role: "registrar", status: "active" },
    orderBy: { email: "asc" },
    select: { id: true, fullName: true },
  });
  if (!registrar) {
    throw new Error("No active registrar account — run `npm run prisma:seed:roles` first.");
  }

  const schoolYear = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!schoolYear) {
    throw new Error("No active school year — run `npm run prisma:seed:roles` first.");
  }

  const terms = await prisma.term.findMany({
    where: { schoolYearId: schoolYear.id },
    orderBy: { termNumber: "asc" },
    select: { id: true, termNumber: true, startDate: true, endDate: true },
  });
  if (terms.length === 0) throw new Error("Active school year has no terms.");
  // The registrar desk follows the admin-configured active term (date-picked,
  // same rule as the backend term scope), so seed into that term — not always
  // term 1, which would land on a term the desk is not working in.
  const now = new Date();
  const term =
    terms.find(
      (t) => t.startDate && t.endDate && now >= t.startDate && now <= t.endDate,
    ) ?? terms[0];

  const staffHash = await argon2.hash(STAFF_PASSWORD);
  const studentHash = await argon2.hash(STUDENT_PASSWORD);

  // ---- Teachers ------------------------------------------------------------
  const adviser = await prisma.user.upsert({
    where: { email: "rowena.bautista@zentra.test" },
    update: { fullName: "Rowena Bautista", role: "adviser", status: "active" },
    create: {
      email: "rowena.bautista@zentra.test",
      fullName: "Rowena Bautista",
      passwordHash: staffHash,
      role: "adviser",
      status: "active",
    },
    select: { id: true, fullName: true },
  });
  await prisma.staffProfile.upsert({
    where: { userId: adviser.id },
    update: { isAdviser: true, handledGradeLevels: ["G11", "G12"] },
    create: {
      userId: adviser.id,
      employeeId: "ADV-G11-001",
      department: "Senior High School",
      isAdviser: true,
      handledGradeLevels: ["G11", "G12"],
    },
  });

  const subjectTeacher = await prisma.user.upsert({
    where: { email: "paolo.reyes@zentra.test" },
    update: { fullName: "Paolo M. Reyes", role: "subject_teacher", status: "active" },
    create: {
      email: "paolo.reyes@zentra.test",
      fullName: "Paolo M. Reyes",
      passwordHash: staffHash,
      role: "subject_teacher",
      status: "active",
    },
    select: { id: true, fullName: true },
  });
  await prisma.staffProfile.upsert({
    where: { userId: subjectTeacher.id },
    update: { handledGradeLevels: ["G11", "G12"] },
    create: {
      userId: subjectTeacher.id,
      employeeId: "TCH-SHS-001",
      department: "Senior High School",
      handledGradeLevels: ["G11", "G12"],
    },
  });

  // ---- Sections ------------------------------------------------------------
  async function ensureSection(name: string, gradeLevel: "G11" | "G12") {
    const existing = await prisma.section.findFirst({
      where: { name, schoolYearId: schoolYear!.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.section.update({
        where: { id: existing.id },
        data: { gradeLevel, adviserId: adviser.id, adviserLabel: adviser.fullName },
      });
      return existing.id;
    }
    const created = await prisma.section.create({
      data: {
        name,
        gradeLevel,
        schoolYearId: schoolYear!.id,
        adviserId: adviser.id,
        adviserLabel: adviser.fullName,
      },
      select: { id: true },
    });
    return created.id;
  }

  const sectionIds: Record<string, string> = {
    [G11_SECTION]: await ensureSection(G11_SECTION, "G11"),
    [G12_SECTION]: await ensureSection(G12_SECTION, "G12"),
  };

  // ---- Learners ------------------------------------------------------------
  const learners: {
    lrn: string;
    fullName: string;
    gradeLevel: "G11" | "G12";
    sectionId: string;
    studentId: string | null;
    rosterId: string;
    base: number;
  }[] = [];

  for (const learner of LEARNERS) {
    const sectionId = sectionIds[learner.sectionName];

    let studentId: string | null = null;
    if (learner.hasAccount) {
      const user = await prisma.user.upsert({
        where: { email: learner.email },
        update: {
          fullName: learner.fullName,
          role: "student",
          status: "active",
          lrn: learner.lrn,
          passwordHash: studentHash,
          approvedBy: registrar.id,
          approvedAt: daysAgo(60),
        },
        create: {
          email: learner.email,
          fullName: learner.fullName,
          passwordHash: studentHash,
          role: "student",
          status: "active",
          lrn: learner.lrn,
          approvedBy: registrar.id,
          approvedAt: daysAgo(60),
        },
        select: { id: true },
      });
      studentId = user.id;

      await prisma.studentProfile.upsert({
        where: { userId: user.id },
        update: {
          lrn: learner.lrn,
          gradeLevel: learner.gradeLevel,
          sectionId,
          gender: learner.gender,
          birthdate: new Date(learner.birthdate),
          address: learner.address,
        },
        create: {
          userId: user.id,
          lrn: learner.lrn,
          gradeLevel: learner.gradeLevel,
          sectionId,
          gender: learner.gender,
          birthdate: new Date(learner.birthdate),
          address: learner.address,
        },
      });
    }

    const roster = await prisma.studentRoster.upsert({
      where: { lrn_schoolYearId: { lrn: learner.lrn, schoolYearId: schoolYear.id } },
      update: {
        fullName: learner.fullName,
        gradeLevel: learner.gradeLevel,
        sectionId,
        enlistedTermId: term.id,
      },
      create: {
        lrn: learner.lrn,
        fullName: learner.fullName,
        gradeLevel: learner.gradeLevel,
        sectionId,
        schoolYearId: schoolYear.id,
        enlistedTermId: term.id,
      },
      select: { id: true },
    });

    learners.push({
      lrn: learner.lrn,
      fullName: learner.fullName,
      gradeLevel: learner.gradeLevel,
      sectionId,
      studentId,
      rosterId: roster.id,
      base: learner.base,
    });
  }

  // ---- Subjects, assignments, gradebook, finals ---------------------------
  const stats = { assignments: 0, components: 0, assessments: 0, scores: 0, finals: 0 };

  for (const subjectSeed of SUBJECTS) {
    const subject = await prisma.subject.upsert({
      where: { code_gradeLevel: { code: subjectSeed.code, gradeLevel: subjectSeed.gradeLevel } },
      update: { name: subjectSeed.name, category: subjectSeed.category },
      create: {
        code: subjectSeed.code,
        name: subjectSeed.name,
        gradeLevel: subjectSeed.gradeLevel,
        category: subjectSeed.category,
      },
      select: { id: true, name: true, code: true },
    });

    // An earlier run against another term must not leave a second grade set on
    // the desk: drop this subject's other-term gradebook (cascades assessments
    // + scores) and its finals for every learner.
    await prisma.gradeComponent.deleteMany({
      where: { subjectId: subject.id, termId: { not: term.id } },
    });
    await prisma.finalGrade.deleteMany({
      where: { subjectId: subject.id, termId: { not: term.id } },
    });

    const classLearners = learners.filter((l) => l.gradeLevel === subjectSeed.gradeLevel);
    if (classLearners.length === 0) continue;

    const weights = WEIGHTS[subjectSeed.weights];
    const teacherId = subjectSeed.gradeLevel === "G11" ? adviser.id : subjectTeacher.id;
    const sectionId = classLearners[0].sectionId;

    // The class assignment the desk reads the teacher name from.
    await prisma.teacherSubjectAssignment.upsert({
      where: {
        teacherId_subjectId_sectionId_termId: {
          teacherId,
          subjectId: subject.id,
          sectionId,
          termId: term.id,
        },
      },
      update: {},
      create: { teacherId, subjectId: subject.id, sectionId, termId: term.id },
    });
    stats.assignments++;

    // ---- Grade components ------------------------------------------------
    const componentIds: { id: string; type: ComponentType }[] = [];
    for (const c of COMPONENTS) {
      const comp = await prisma.gradeComponent.upsert({
        where: {
          subjectId_termId_componentType: {
            subjectId: subject.id,
            termId: term.id,
            componentType: c.type,
          },
        },
        update: { weightPercentage: weights[c.type] },
        create: {
          subjectId: subject.id,
          termId: term.id,
          componentType: c.type,
          weightPercentage: weights[c.type],
        },
        select: { id: true },
      });
      componentIds.push({ id: comp.id, type: c.type });
      stats.components++;
    }

    // ---- Assessments -----------------------------------------------------
    const assessments: { id: string; type: ComponentType; max: number }[] = [];
    let order = 0;
    for (const c of COMPONENTS) {
      const compId = componentIds.find((x) => x.type === c.type)!.id;
      for (const title of c.titles) {
        order += 1;
        const existing = await prisma.assessment.findFirst({
          where: { gradeComponentId: compId, sectionId, title },
          select: { id: true, maxScore: true },
        });
        if (existing) {
          assessments.push({ id: existing.id, type: c.type, max: existing.maxScore });
          continue;
        }
        const base = term.startDate ? new Date(term.startDate) : new Date();
        base.setDate(base.getDate() + order * 6);
        base.setHours(9, 0, 0, 0);
        const created = await prisma.assessment.create({
          data: {
            gradeComponentId: compId,
            sectionId,
            title,
            maxScore: c.max,
            dateGiven: base,
            createdBy: teacherId,
          },
          select: { id: true, maxScore: true },
        });
        assessments.push({ id: created.id, type: c.type, max: created.maxScore });
        stats.assessments++;
      }
    }

    // ---- Scores + finals per learner ------------------------------------
    for (const learner of classLearners) {
      const learnerKey = learner.studentId ?? learner.rosterId;

      const scoreRows = assessments.map((asm) => {
        const pct = assessmentPct(`${learnerKey}::${asm.id}`, learner.base);
        return {
          assessmentId: asm.id,
          studentId: learner.studentId,
          rosterId: learner.studentId ? null : learner.rosterId,
          rawScore: Math.round((pct / 100) * asm.max * 10) / 10,
          percentageScore: pct,
        };
      });

      const existing = await prisma.studentGrade.findMany({
        where: {
          assessmentId: { in: assessments.map((a) => a.id) },
          OR: learner.studentId ? [{ studentId: learner.studentId }] : [{ rosterId: learner.rosterId }],
        },
        select: { assessmentId: true },
      });
      const taken = new Set(existing.map((e) => e.assessmentId));
      const fresh = scoreRows.filter((s) => !taken.has(s.assessmentId));
      if (fresh.length > 0) {
        const res = await prisma.studentGrade.createMany({ data: fresh, skipDuplicates: true });
        stats.scores += res.count;
      }

      // Weighted average → DepEd transmutation.
      const componentAverages = COMPONENTS.map((c) => {
        const rows = scoreRows.filter(
          (s) => assessments.find((a) => a.id === s.assessmentId)!.type === c.type,
        );
        const average =
          rows.length > 0 ? rows.reduce((sum, r) => sum + r.percentageScore, 0) / rows.length : 0;
        return { weightPercentage: weights[c.type], average };
      });
      const final = computeFinalGrade(componentAverages);

      // The last learner's last subject is still waiting for the adviser's
      // sign-off, so the "Awaiting sign-off" tile shows a real number.
      const awaitingSignOff =
        learner.lrn === "136130000005" && subjectSeed.code === "PEH12";

      const data = {
        computedAverage: Math.round(final.computedAverage * 100) / 100,
        transmutedGrade: final.transmutedGrade,
        remarks: final.remarks,
        lockStatus: awaitingSignOff ? ("locked" as const) : ("adviser_approved" as const),
        lockedBy: adviser.id,
        lockedAt: daysAgo(14),
        adviserApprovedBy: awaitingSignOff ? null : adviser.id,
        adviserApprovedAt: awaitingSignOff ? null : daysAgo(11),
        finalizedBy: awaitingSignOff ? null : registrar.id,
        finalizedAt: awaitingSignOff ? null : daysAgo(9),
      };

      const existingFinal = await prisma.finalGrade.findFirst({
        where: {
          subjectId: subject.id,
          termId: term.id,
          OR: [
            ...(learner.studentId ? [{ studentId: learner.studentId }] : []),
            { rosterId: learner.rosterId },
          ],
        },
        select: { id: true },
      });
      if (existingFinal) {
        await prisma.finalGrade.update({ where: { id: existingFinal.id }, data });
      } else {
        await prisma.finalGrade.create({
          data: {
            studentId: learner.studentId,
            rosterId: learner.studentId ? null : learner.rosterId,
            subjectId: subject.id,
            termId: term.id,
            ...data,
          },
        });
      }
      stats.finals++;
    }

    console.log(`  ${subject.code} · ${subject.name} — ${classLearners.length} learner(s)`);
  }

  console.log(
    `done: learners=${learners.length}, assignments=${stats.assignments}, components=${stats.components}, ` +
      `assessments=${stats.assessments}, scores=${stats.scores}, finals=${stats.finals} ` +
      `(${schoolYear.name} · term ${term.termNumber})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
