import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

/**
 * Registrar demo seed (grades 11–12) — every registrar page gets realistic
 * data:
 *
 *   overview        → sections/subjects/roster counts, pending accounts,
 *                     adviser-approved finals, SF10 tiles + attachment feed,
 *                     missing-SF10 feed, request-activity chart.
 *   final-grades    → one G11 and one G12 learner, every subject
 *                     adviser_approved (so the group is viewable).
 *   accounts        → a pending G11 account, a roster-only G11 learner
 *                     (no-account column) and one approval audit row.
 *   adviser-access  → one pending request, one checked/granted request.
 *   sf10            → three files on the registrar desk (attach / available /
 *                     released) with version snapshots.
 *   academics       → G11/G12 subject catalog with enrolled/passed counts.
 *   settings        → the desk account itself (already created by the roles
 *                     seed).
 *
 * Plus a few unread notifications so the bell, sidebar dots and overview
 * "updates" panel have something real to show.
 *
 * Idempotent — users keyed by email, subjects by (code, gradeLevel), roster by
 * (LRN, school year), finals by (learner, subject, term), SF10 by (LRN, desk),
 * requests by adviser+section+reason. Safe to re-run.
 *
 * Run: npm run prisma:seed:registrar-demo
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const STAFF_PASSWORD = "Zentra2025!";
const STUDENT_PASSWORD = "Student2025!";
const PARENT_PASSWORD = "Parent2025!";

const G11_SECTION = "Grade 11 - STEM (Rizal)";
const G12_SECTION = "Grade 12 - ABM (Bonifacio)";

type Learner = {
  email: string;
  lrn: string;
  fullName: string;
  gradeLevel: "G11" | "G12";
  status: "active" | "pending";
  birthdate: string;
  gender: string;
  address: string;
  hasAccount: boolean; // false → roster row only (no login)
  sectionName: string;
};

const LEARNERS: Learner[] = [
  {
    email: "136120279001@students.zentra.test",
    lrn: "136120279001",
    fullName: "Althea Marie Santos",
    gradeLevel: "G11",
    status: "active",
    birthdate: "2009-02-14T00:00:00.000Z",
    gender: "Female",
    address: "18 Mabini St., Brgy. San Roque, Marikina City",
    hasAccount: true,
    sectionName: G11_SECTION,
  },
  {
    email: "136120279002@students.zentra.test",
    lrn: "136120279002",
    fullName: "Joshua Miguel Dela Cruz",
    gradeLevel: "G11",
    status: "active",
    birthdate: "2009-07-03T00:00:00.000Z",
    gender: "Male",
    address: "5 Narra St., Brgy. Tumana, Marikina City",
    hasAccount: false,
    sectionName: G11_SECTION,
  },
  {
    email: "136120279003@students.zentra.test",
    lrn: "136120279003",
    fullName: "Bea Clarisse Villanueva",
    gradeLevel: "G11",
    status: "pending",
    birthdate: "2009-11-22T00:00:00.000Z",
    gender: "Female",
    address: "203 Rizal Ave., Brgy. Malanday, Marikina City",
    hasAccount: true,
    sectionName: G11_SECTION,
  },
  {
    email: "136120279004@students.zentra.test",
    lrn: "136120279004",
    fullName: "Rafael Luis Mendoza",
    gradeLevel: "G12",
    status: "active",
    birthdate: "2008-05-09T00:00:00.000Z",
    gender: "Male",
    address: "64 Katipunan St., Brgy. Concepcion, Marikina City",
    hasAccount: true,
    sectionName: G12_SECTION,
  },
];

const SUBJECTS: {
  code: string;
  name: string;
  gradeLevel: "G11" | "G12";
  category: "CORE" | "APPLIED" | "SPECIALIZED";
  avg: number;
}[] = [
  { code: "ORALCOMM11", name: "Oral Communication in Context", gradeLevel: "G11", category: "CORE", avg: 91 },
  { code: "GENMATH11", name: "General Mathematics", gradeLevel: "G11", category: "CORE", avg: 88 },
  { code: "EARTHLIFE11", name: "Earth and Life Science", gradeLevel: "G11", category: "CORE", avg: 90 },
  { code: "PRACRES12", name: "Practical Research 2", gradeLevel: "G12", category: "CORE", avg: 89 },
  { code: "ENTREP12", name: "Entrepreneurship", gradeLevel: "G12", category: "CORE", avg: 86 },
];

const REQUEST_A_REASON = "Advisory SF10 review for the second-term card (demo seed)";
const REQUEST_B_REASON = "Transfer-out clearance — learner records check (demo seed)";

const SF10_FILES: {
  lrn: string;
  learnerName: string;
  gradeLevel: "G11" | "G12";
  status: "attach" | "available" | "released";
  source: "manual" | "ocr_upload";
}[] = [
  {
    lrn: "136120279001",
    learnerName: "Althea Marie Santos",
    gradeLevel: "G11",
    status: "available",
    source: "ocr_upload",
  },
  {
    lrn: "136120279005",
    learnerName: "Patricia Anne Lim",
    gradeLevel: "G11",
    status: "attach",
    source: "manual",
  },
  {
    lrn: "136120279004",
    learnerName: "Rafael Luis Mendoza",
    gradeLevel: "G12",
    status: "released",
    source: "ocr_upload",
  },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  // ---- Desk accounts -------------------------------------------------------
  const registrar = await prisma.user.findFirst({
    where: { role: "registrar", status: "active" },
    orderBy: { email: "asc" },
    select: { id: true, fullName: true, email: true },
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
    select: { id: true, termNumber: true },
  });
  if (terms.length === 0) throw new Error("Active school year has no terms.");
  const term = terms[0];

  const staffHash = await argon2.hash(STAFF_PASSWORD);
  const studentHash = await argon2.hash(STUDENT_PASSWORD);

  // ---- Teachers (adviser for G11, subject teacher for both) ---------------
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
  async function ensureSection(name: string, gradeLevel: "G11" | "G12", adviserId: string) {
    const existing = await prisma.section.findFirst({
      where: { name, schoolYearId: schoolYear!.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.section.update({
        where: { id: existing.id },
        data: { gradeLevel, adviserId, adviserLabel: adviser.fullName },
      });
      return existing.id;
    }
    const created = await prisma.section.create({
      data: {
        name,
        gradeLevel,
        schoolYearId: schoolYear!.id,
        adviserId,
        adviserLabel: adviser.fullName,
      },
      select: { id: true },
    });
    return created.id;
  }

  const sectionIds = {
    [G11_SECTION]: await ensureSection(G11_SECTION, "G11", adviser.id),
    [G12_SECTION]: await ensureSection(G12_SECTION, "G12", adviser.id),
  } as Record<string, string>;

  // ---- Learners + roster ---------------------------------------------------
  const learnerUserIds = new Map<string, string>();
  for (const learner of LEARNERS) {
    const sectionId = sectionIds[learner.sectionName];

    if (!learner.hasAccount) {
      await prisma.studentRoster.upsert({
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
      });
      continue;
    }

    const user = await prisma.user.upsert({
      where: { email: learner.email },
      update: {
        fullName: learner.fullName,
        role: "student",
        status: learner.status,
        lrn: learner.lrn,
        passwordHash: studentHash,
        approvedBy: learner.status === "active" ? registrar.id : null,
        approvedAt: learner.status === "active" ? daysAgo(45) : null,
      },
      create: {
        email: learner.email,
        fullName: learner.fullName,
        passwordHash: studentHash,
        role: "student",
        status: learner.status,
        lrn: learner.lrn,
        approvedBy: learner.status === "active" ? registrar.id : null,
        approvedAt: learner.status === "active" ? daysAgo(45) : null,
      },
      select: { id: true },
    });
    learnerUserIds.set(learner.lrn, user.id);

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

    await prisma.studentRoster.upsert({
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
    });
  }

  // Parent linked to the first G11 learner (so the pending row shows one).
  const parent = await prisma.user.upsert({
    where: { email: "maria.santos@zentra.test" },
    update: { fullName: "Maria Elena Santos", role: "parent", status: "active" },
    create: {
      email: "maria.santos@zentra.test",
      fullName: "Maria Elena Santos",
      passwordHash: await argon2.hash(PARENT_PASSWORD),
      role: "parent",
      status: "active",
    },
    select: { id: true },
  });
  await prisma.parentProfile.upsert({
    where: { userId: parent.id },
    update: { occupation: "Public school teacher" },
    create: { userId: parent.id, occupation: "Public school teacher" },
  });
  const altheaId = learnerUserIds.get("136120279001");
  if (altheaId) {
    await prisma.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId: parent.id, studentId: altheaId } },
      update: { relationship: "Mother", approvedBy: registrar.id },
      create: {
        parentId: parent.id,
        studentId: altheaId,
        relationship: "Mother",
        approvedBy: registrar.id,
      },
    });
  }

  // ---- Subjects + finals + teacher assignments -----------------------------
  const subjectIds = new Map<string, string>();
  for (const subject of SUBJECTS) {
    const row = await prisma.subject.upsert({
      where: { code_gradeLevel: { code: subject.code, gradeLevel: subject.gradeLevel } },
      update: { name: subject.name, category: subject.category },
      create: {
        code: subject.code,
        name: subject.name,
        gradeLevel: subject.gradeLevel,
        category: subject.category,
      },
      select: { id: true },
    });
    subjectIds.set(subject.code, row.id);

    const learner = LEARNERS.find(
      (l) => l.gradeLevel === subject.gradeLevel && l.status === "active" && l.hasAccount
    );
    if (!learner) continue;
    const studentId = learnerUserIds.get(learner.lrn);
    if (!studentId) continue;

    await prisma.finalGrade.upsert({
      where: {
        studentId_subjectId_termId: {
          studentId,
          subjectId: row.id,
          termId: term.id,
        },
      },
      update: {
        computedAverage: subject.avg + 0.4,
        transmutedGrade: subject.avg,
        remarks: subject.avg >= 75 ? "Passed" : "Failed",
        lockStatus: "adviser_approved",
        lockedBy: adviser.id,
        lockedAt: daysAgo(12),
        adviserApprovedBy: adviser.id,
        adviserApprovedAt: daysAgo(10),
        finalizedBy: registrar.id,
        finalizedAt: daysAgo(8),
      },
      create: {
        studentId,
        subjectId: row.id,
        termId: term.id,
        computedAverage: subject.avg + 0.4,
        transmutedGrade: subject.avg,
        remarks: subject.avg >= 75 ? "Passed" : "Failed",
        lockStatus: "adviser_approved",
        lockedBy: adviser.id,
        lockedAt: daysAgo(12),
        adviserApprovedBy: adviser.id,
        adviserApprovedAt: daysAgo(10),
        finalizedBy: registrar.id,
        finalizedAt: daysAgo(8),
      },
    });

    const sectionId = sectionIds[learner.sectionName];
    const teacherId = subject.gradeLevel === "G11" ? adviser.id : subjectTeacher.id;
    await prisma.teacherSubjectAssignment.upsert({
      where: {
        teacherId_subjectId_sectionId_termId: {
          teacherId,
          subjectId: row.id,
          sectionId,
          termId: term.id,
        },
      },
      update: {},
      create: {
        teacherId,
        subjectId: row.id,
        sectionId,
        termId: term.id,
      },
    });
  }

  // ---- Adviser SF10 access requests ---------------------------------------
  async function ensureRequest(reason: string, data: {
    status: "pending" | "approved";
    requestedLrns: string[];
    approvedLrns?: string[];
    approvedLrnAt?: Record<string, string>;
    checked?: boolean;
  }) {
    const sectionId = sectionIds[G11_SECTION];
    const existing = await prisma.adviserSf10AccessRequest.findFirst({
      where: { adviserId: adviser.id, sectionId, reason },
      select: { id: true },
    });
    const now = new Date();
    const payload = {
      gradeLevel: "G11" as const,
      status: data.status,
      requestedLrns: data.requestedLrns,
      requestedAt: daysAgo(2),
      checkedAt: data.checked ? daysAgo(1) : null,
      checkedBy: data.checked ? registrar.id : null,
      checkSummary: data.checked
        ? {
            total: data.requestedLrns.length,
            has: data.approvedLrns?.length ?? 0,
            missing: data.requestedLrns.length - (data.approvedLrns?.length ?? 0),
            at: daysAgo(1).toISOString(),
          }
        : undefined,
      approvedLrns: data.approvedLrns ?? [],
      approvedLrnAt: data.approvedLrnAt ?? undefined,
      reportedMissingLrns: [] as string[],
      reportedLrnAt: undefined,
      decidedAt: data.status === "approved" ? daysAgo(1) : null,
      decidedBy: data.status === "approved" ? registrar.id : null,
      decisionReason: data.status === "approved" ? "Granted for advisory reporting." : null,
    };
    if (existing) {
      await prisma.adviserSf10AccessRequest.update({ where: { id: existing.id }, data: payload });
      return existing.id;
    }
    const created = await prisma.adviserSf10AccessRequest.create({
      data: { adviserId: adviser.id, sectionId, reason, ...payload },
      select: { id: true },
    });
    return created.id;
  }

  const pendingRequestId = await ensureRequest(REQUEST_A_REASON, {
    status: "pending",
    requestedLrns: ["136120279001", "136120279002", "136120279003"],
  });
  const nowIso = new Date().toISOString();
  const decidedRequestId = await ensureRequest(REQUEST_B_REASON, {
    status: "approved",
    requestedLrns: ["136120279001", "136120279002"],
    approvedLrns: ["136120279001"],
    approvedLrnAt: { "136120279001": nowIso },
    checked: true,
  });

  // ---- SF10 records (LRN-keyed, registrar desk) ---------------------------
  const registrarName = registrar.fullName;
  async function ensureSf10(file: (typeof SF10_FILES)[number]) {
    const reason =
      file.status === "attach"
        ? "Uploaded via registrar desk"
        : file.status === "available"
          ? "Verified against submitted form"
          : "Released to requesting school";
    const record = await prisma.sf10Record.upsert({
      where: { lrn_desk: { lrn: file.lrn, desk: "registrar" } },
      update: {
        learnerName: file.learnerName,
        gradeLevel: file.gradeLevel,
        source: file.source,
        status: file.status,
        uploadedFileUrl: `https://example.test/sf10/${file.lrn}.pdf`,
        uploadedAt: daysAgo(20),
        verifiedBy: registrar.id,
        verifiedAt: daysAgo(18),
        validatedBy: file.status === "attach" ? null : registrar.id,
        validatedAt: file.status === "attach" ? null : daysAgo(15),
        releasedAt: file.status === "released" ? daysAgo(9) : null,
        currentVersion: 1,
      },
      create: {
        lrn: file.lrn,
        learnerName: file.learnerName,
        gradeLevel: file.gradeLevel,
        desk: "registrar",
        source: file.source,
        status: file.status,
        uploadedFileUrl: `https://example.test/sf10/${file.lrn}.pdf`,
        uploadedAt: daysAgo(20),
        verifiedBy: registrar.id,
        verifiedAt: daysAgo(18),
        validatedBy: file.status === "attach" ? null : registrar.id,
        validatedAt: file.status === "attach" ? null : daysAgo(15),
        releasedAt: file.status === "released" ? daysAgo(9) : null,
        currentVersion: 1,
      },
      select: { id: true },
    });

    await prisma.sf10RecordVersion.deleteMany({ where: { sf10RecordId: record.id } });
    await prisma.sf10RecordVersion.create({
      data: {
        sf10RecordId: record.id,
        versionNumber: 1,
        changedBy: registrar.id,
        changeReason: reason,
        changedAt: daysAgo(18),
        dataSnapshot: {
          lrn: file.lrn,
          learnerName: file.learnerName,
          gradeLevel: file.gradeLevel === "G11" ? "Grade 11" : "Grade 12",
          schoolYear: schoolYear.name,
          section:
            file.learnerName === "Patricia Anne Lim"
              ? "Grade 11 - STEM (Rizal)"
              : file.gradeLevel === "G11"
                ? G11_SECTION
                : G12_SECTION,
          generalAverage: file.gradeLevel === "G11" ? 90 : 89,
          subjects:
            file.gradeLevel === "G11"
              ? SUBJECTS.filter((s) => s.gradeLevel === "G11").map((s) => ({
                  subject: s.name,
                  q1: s.avg,
                  q2: s.avg - 1,
                  q3: s.avg,
                  q4: null,
                  rating: s.avg,
                  remarks: "Passed",
                }))
              : SUBJECTS.filter((s) => s.gradeLevel === "G12").map((s) => ({
                  subject: s.name,
                  q1: s.avg,
                  q2: s.avg + 1,
                  q3: s.avg,
                  q4: null,
                  rating: s.avg,
                  remarks: "Passed",
                })),
        },
      },
    });
    return record.id;
  }
  for (const file of SF10_FILES) await ensureSf10(file);

  // ---- Account-approval audit row (accounts page history) -----------------
  const rafaelId = learnerUserIds.get("136120279004");
  if (rafaelId) {
    const existingAudit = await prisma.auditLog.findFirst({
      where: {
        actionType: "account_approval",
        sourceTable: "users",
        sourceId: rafaelId,
      },
      select: { id: true },
    });
    if (!existingAudit) {
      await prisma.auditLog.create({
        data: {
          userId: registrar.id,
          actionType: "account_approval",
          sourceTable: "users",
          sourceId: rafaelId,
          reason: "Account activated after LRN verification",
          oldValue: { status: "pending" },
          newValue: { status: "active" },
          createdAt: daysAgo(44),
        },
      });
    }
  }

  // ---- Notifications (bell + overview updates + sidebar dots) -------------
  type SeedNotification = {
    type: string;
    sourceTable: string;
    sourceId: string;
    message: string;
    createdAt: Date;
  };
  const notifications: SeedNotification[] = [
    {
      type: "sf10_access_requested",
      sourceTable: "adviser_sf10_access_requests",
      sourceId: pendingRequestId,
      message: `SF10 access requested: Adviser ${adviser.fullName} - ${G11_SECTION} (3 advisees) - ${REQUEST_A_REASON}`,
      createdAt: daysAgo(2),
    },
    {
      type: "finals_ready",
      sourceTable: "final_grades",
      sourceId: subjectIds.get("GENMATH11") ?? "genmath11",
      message: `Final grades for ${G11_SECTION} are ready for registrar review.`,
      createdAt: daysAgo(10),
    },
    {
      type: "account_pending",
      sourceTable: "users",
      sourceId: learnerUserIds.get("136120279003") ?? "bea-villanueva",
      message:
        "New student sign-up: Bea Clarisse Villanueva (LRN 136120279003, Grade 11) - awaiting approval.",
      createdAt: daysAgo(3),
    },
    {
      type: "sf10_needs_validation",
      sourceTable: "sf10_records",
      sourceId: "136120279001",
      message: "SF10 for Althea Marie Santos (LRN 136120279001) passed verification - validate to make it available.",
      createdAt: daysAgo(18),
    },
    {
      type: "sf10_access_decision",
      sourceTable: "adviser_sf10_access_requests",
      sourceId: decidedRequestId,
      message: `You approved SF10 access for ${adviser.fullName} - ${G11_SECTION} (1 advisee).`,
      createdAt: daysAgo(1),
    },
  ];
  for (const n of notifications) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: registrar.id,
        type: n.type,
        sourceTable: n.sourceTable,
        sourceId: n.sourceId,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.notification.update({
        where: { id: existing.id },
        data: { message: n.message, isRead: false },
      });
    } else {
      await prisma.notification.create({
        data: {
          userId: registrar.id,
          type: n.type,
          sourceTable: n.sourceTable,
          sourceId: n.sourceId,
          message: n.message,
          channel: ["web", "mobile", "email"],
          isRead: false,
          createdAt: n.createdAt,
        },
      });
    }
  }

  console.log(`Registrar demo data ready for ${registrar.fullName} <${registrar.email}>`);
  console.log(`  Sections : ${G11_SECTION}, ${G12_SECTION}`);
  console.log(`  Learners : ${LEARNERS.length} (1 pending account, 1 roster-only)`);
  console.log(`  Subjects : ${SUBJECTS.length} · finals adviser-approved for term ${term.termNumber}`);
  console.log(`  SF10     : ${SF10_FILES.length} files (attach / available / released)`);
  console.log(`  Requests : 1 pending + 1 approved · ${notifications.length} unread notifications`);
  console.log(`\nRefresh /registrar/* — every page now has at least one row.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
