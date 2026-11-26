import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { ADM_STAGE_FLOW, type AdmStage } from "../adm.js";
import { GRADE_LABEL } from "../../modules/adm/adm.repository.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedLearnerRows,
} from "../../lib/learnerVisibility.js";

export async function getDashboard(role?: string) {
  const ACTIVE_STAGES: AdmStage[] = [
    "meeting_parents",
    "home_visitation",
    "certification",
    "principal_approval",
  ];

  // Principal boards cover the whole ADM caseload — including cases already
  // signed and under monitoring — while the coordinator board lists only the
  // active pipeline stages.
  const latestReferredWhere: Prisma.AdmLearnerProfileWhereInput =
    role === "principal" ? {} : { stage: { in: ACTIVE_STAGES } };

  // Learners the section adviser soft-deleted are hidden from every desk
  // (and come back on restore), so the ADM dashboard must not count or list
  // their cases, referrals or devices either.
  const archivedLearners = await archivedAdvisoryLearnerIds();
  const excludeArchivedRows = excludeArchivedLearnerRows(archivedLearners);
  const notArchivedProfile: Prisma.AdmLearnerProfileWhereInput =
    archivedLearners.studentIds.length > 0
      ? { studentId: { notIn: archivedLearners.studentIds } }
      : {};

  const [
    stageGroups,
    earlyConsultation,
    pendingSignature,
    signed,
    totalProfiles,
    needsRevision,
    totalReferredProfiles,
    issuedDevices,
    returnedDevices,
    latestProfiles,
    profileDates,
    sectionProfiles,
  ] = await Promise.all([
    prisma.admLearnerProfile.groupBy({
      by: ["stage"],
      where: notArchivedProfile,
      _count: { _all: true },
    }),

    prisma.referral.count({
      where: {
        referredToRole: "adm_coordinator",
        admProfiles: { none: {} },
        NOT: {
          status: "pending",
          consultReviewer: { in: ["nurse", "guidance_counselor"] },
        },
        ...excludeArchivedRows,
      },
    }),

    prisma.admLearnerProfile.count({
      where: {
        ...notArchivedProfile,
        stage: "principal_approval",
        approvedBy: null,
        eligibilityStatus: "eligible",
      },
    }),
    prisma.admLearnerProfile.count({
      where: { ...notArchivedProfile, approvedBy: { not: null } },
    }),
    prisma.admLearnerProfile.count({ where: notArchivedProfile }),
    prisma.admLearnerProfile.count({
      where: {
        ...notArchivedProfile,
        stage: "principal_approval",
        approvedBy: null,
        eligibilityStatus: { not: "eligible" },
      },
    }),
    prisma.admLearnerProfile.count({
      where: { ...notArchivedProfile, stage: { in: ACTIVE_STAGES } },
    }),
    prisma.admDevice.count({
      where: { returnedDate: null, admLearnerProfile: notArchivedProfile },
    }),
    prisma.admDevice.count({
      where: { returnedDate: { not: null }, admLearnerProfile: notArchivedProfile },
    }),
    prisma.admLearnerProfile.findMany({
      where: { ...latestReferredWhere, ...notArchivedProfile },
      include: {
        student: {
          select: {
            lrn: true,
            gradeLevel: true,
            user: { select: { fullName: true } },
          },
        },
        preparedByUser: { select: { fullName: true } },
        forms: { orderBy: { uploadedAt: "desc" }, take: 8 },
      },
      // Principal boards surface the longest-waiting cases first.
      orderBy: role === "principal" ? { createdAt: "asc" } : { id: "desc" },
      take: role === "principal" ? 10 : 5,
    }),

    prisma.admLearnerProfile.findMany({
      where: notArchivedProfile,
      select: { createdAt: true },
    }),

    // Section mix for the "Section distribution" donut. Only real sections
    // that actually hold ADM learners are listed — learners with no section are
    // skipped (they aren't a school section), and each learner counts once even
    // when they have cases filed across several terms.
    prisma.admLearnerProfile.findMany({
      where: notArchivedProfile,
      select: {
        studentId: true,
        student: {
          select: {
            section: { select: { name: true, gradeLevel: true } },
          },
        },
      },
    }),
  ]);

  const countsByStage = new Map(
    stageGroups.map((g) => [g.stage, g._count._all]),
  );
  const stageBreakdown = ADM_STAGE_FLOW.map((s) => ({
    stage: s.stage,
    short: s.label,
    count:
      (countsByStage.get(s.stage) ?? 0) +
      (s.stage === "consultation" ? earlyConsultation : 0),
  }));

  const sectionCounts = new Map<string, number>();
  const sectionGrades = new Map<string, string>();
  const countedStudents = new Set<string>();
  for (const p of sectionProfiles) {
    const section = p.student.section;
    const name = section?.name;
    if (!name || countedStudents.has(p.studentId)) continue;
    countedStudents.add(p.studentId);
    sectionCounts.set(name, (sectionCounts.get(name) ?? 0) + 1);
    const grade = section?.gradeLevel;
    if (grade && !sectionGrades.has(name)) {
      sectionGrades.set(name, GRADE_LABEL[grade] ?? grade);
    }
  }
  const sectionBreakdown = [...sectionCounts.entries()]
    .map(([section, count]) => ({
      section,
      gradeLevel: sectionGrades.get(section) ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.section.localeCompare(b.section));

  const latestReferred = latestProfiles.map((p) => ({
    id: p.id,
    lrn: p.student.lrn,
    student: p.student.user.fullName,
    grade: GRADE_LABEL[p.student.gradeLevel] ?? p.student.gradeLevel,
    stage: p.stage as
      | "meeting_parents"
      | "home_visitation"
      | "certification"
      | "principal_approval",
    eligibilityStatus: p.eligibilityStatus,
    preparedBy: p.preparedByUser.fullName,
    datePrepared: p.createdAt ? p.createdAt.toISOString().slice(0, 10) : null,
    approvedBy: p.approvedBy ? "Principal" : null,
    forms: p.forms.map((f) => ({
      id: f.id,
      formType: f.formType,
      title: f.title,
      status: f.status,
      fileUrl: f.fileUrl ?? null,
      notes: f.notes ?? null,
      uploadedAt: f.uploadedAt ? f.uploadedAt.toISOString() : null,
    })),
  }));

  // ADM cases filed per week over the last 12 weeks (principal analytics).
  const DAY_MS = 86_400_000;
  const TREND_WEEKS = 12;
  const nowMs = Date.now();
  const trend = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const start = new Date(nowMs - ((TREND_WEEKS - 1 - i) * 7 + 6) * DAY_MS);
    const month = String(start.getMonth() + 1).padStart(2, "0");
    const day = String(start.getDate()).padStart(2, "0");
    return {
      week: `${start.getFullYear()}-${month}-${day}`,
      label: `${month}/${day}`,
      count: 0,
    };
  });
  for (const row of profileDates) {
    const t = row.createdAt.getTime();
    const ageWeeks = Math.floor((nowMs - t) / (7 * DAY_MS));
    if (ageWeeks < 0 || ageWeeks >= TREND_WEEKS) continue;
    const idx = trend.length - 1 - ageWeeks;
    if (idx >= 0 && idx < trend.length) trend[idx].count += 1;
  }

  return {
    kpis: { pendingSignature, signed, active: totalProfiles },
    stageBreakdown,
    sectionBreakdown,
    latestReferred,
    trend,

    totalReferred: totalReferredProfiles + earlyConsultation,
    needsRevision,
    deviceSummary: { issued: issuedDevices, returned: returnedDevices },
  };
}
