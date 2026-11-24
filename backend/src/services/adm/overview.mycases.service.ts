import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { ADM_STAGE_FLOW } from "../adm.js";
import { buildCaseTimeline } from "../../modules/referrals/timeline.js";
import type { AdmContext } from "./adm.types.js";

export interface MyCasesQuery {
  q: string;
  page: number;
  pageSize: number;
  highlight: string;
  hasPaginationParams: boolean;
}

export async function getMyCases(ctx: AdmContext, query: MyCasesQuery) {
  const { q, page, pageSize, highlight, hasPaginationParams } = query;
  const teacherId = ctx.userId;
  const sections = await prisma.section.findMany({
    where: { adviserId: teacherId },
    select: { id: true },
  });
  if (sections.length === 0 && ctx.role === "adviser") {
    throw new AppError(404, "NOT_ADVISER", "No advisory section assigned");
  }
  const sectionIds = sections.map((s) => s.id);

  const scopeTermId = ctx.termId;
  // Classes are shared by every term of a school year, so the advisory desk
  // shows every ADM case filed this school year rather than only the selected
  // term's. The case keeps its own term for the "shared" label.
  const scopeYearId =
    ctx.schoolYearId ??
    (scopeTermId
      ? (
          await prisma.term.findUnique({
            where: { id: scopeTermId },
            select: { schoolYearId: true },
          })
        )?.schoolYearId ?? null
      : null);
  // Every ADM referral filed for the adviser's own advisees, regardless of who
  // filed it (adviser, guidance, nurse, coordinator). This is the same source
  // the referrals desk lists, so the two desks can never disagree — including
  // cases whose learner has no account yet (roster-only), which can never have
  // an AdmLearnerProfile, and referrals guidance has not opened a case file for.
  const referralWhere: Prisma.ReferralWhereInput = {
    referredToRole: "adm_coordinator",
    ...(scopeYearId
      ? { term: { schoolYearId: scopeYearId } }
      : scopeTermId
        ? { termId: scopeTermId }
        : {}),
    ...(sectionIds.length > 0
      ? {
          OR: [
            { student: { sectionId: { in: sectionIds } } },
            { roster: { sectionId: { in: sectionIds } } },
          ],
        }
      : {}),
  };
  // No advisory section → no advisees. A subject-teacher account must not see
  // the whole school's cases just because it has no advisory scope.
  if (sectionIds.length === 0) {
    if (!hasPaginationParams) return [];
    return {
      data: [],
      rows: [],
      cases: [],
      total: 0,
      unfilteredTotal: 0,
      summary: {
        total: 0,
        filtered: 0,
        approved: 0,
        monitoring: 0,
        closed: 0,
        modulesSubmitted: 0,
        modulesTotal: 0,
        devicesOut: 0,
      },
      stageCounts: {},
      page: 1,
      totalPages: 1,
      limit: pageSize,
      pageSize,
    };
  }

  const referrals = await prisma.referral.findMany({
    where: referralWhere,
    select: {
      id: true,
      status: true,
      consultReviewer: true,
      termId: true,
      term: { select: { termNumber: true } },
      student: {
        select: {
          userId: true,
          lrn: true,
          gradeLevel: true,
          photoUrl: true,
          mascot: true,
          user: { select: { fullName: true } },
          section: { select: { id: true, name: true } },
        },
      },
      roster: {
        select: {
          id: true,
          lrn: true,
          fullName: true,
          gradeLevel: true,
          mascot: true,
          section: { select: { id: true, name: true } },
        },
      },
      homeVisitations: { select: { id: true } },
      admProfiles: {
        select: {
          id: true,
          stage: true,
          eligibilityStatus: true,
          approvedBy: true,
          approvedAt: true,
          createdAt: true,
          parentMeetings: { select: { attended: true, meetingDatetime: true } },
          modules: { select: { id: true, submitted: true, submissionDate: true } },
          devices: { select: { id: true, returnedDate: true } },
          forms: { select: { formType: true, status: true, uploadedAt: true } },
        },
      },
    },
    // Newest filed first — the desk reads top-down.
    orderBy: { anecdotalRecord: { observationDatetime: "desc" } },
  });

  const stageLabel = new Map(ADM_STAGE_FLOW.map((s) => [s.stage, s.label]));

  // Module progress must match the case workspace, which counts the case's own
  // AdmModule rows *and* the section-wide ADM modules released from the Modules
  // desk (kind: "adm") for that case's term. Reading only the case rows here is
  // what made the list say "2/4" while the detail said "3/6".
  const caseSectionIds = [
    ...new Set(
      referrals
        .map((r) => r.student?.section?.id ?? r.roster?.section?.id ?? null)
        .filter((v): v is string => !!v)
    ),
  ];
  const caseTermIds = [
    ...new Set(referrals.map((r) => r.termId).filter((v): v is string => !!v)),
  ];
  const caseStudentIds = [
    ...new Set(referrals.map((r) => r.student?.userId).filter((v): v is string => !!v)),
  ];
  const sectionModules =
    caseSectionIds.length && caseTermIds.length
      ? await prisma.advisoryModule.findMany({
          where: {
            sectionId: { in: caseSectionIds },
            kind: "adm",
            termId: { in: caseTermIds },
          },
          select: { id: true, sectionId: true, termId: true },
        })
      : [];
  const sectionSubmissions =
    sectionModules.length && caseStudentIds.length
      ? await prisma.advisoryModuleSubmission.findMany({
          where: {
            moduleId: { in: sectionModules.map((m) => m.id) },
            studentId: { in: caseStudentIds },
            submitted: true,
          },
          select: { moduleId: true, studentId: true, submittedAt: true },
        })
      : [];
  const sectionByModule = new Map(sectionModules.map((m) => [m.id, m]));
  const sectionModuleCount = new Map<string, number>();
  for (const m of sectionModules) {
    const key = `${m.sectionId}:${m.termId}`;
    sectionModuleCount.set(key, (sectionModuleCount.get(key) ?? 0) + 1);
  }
  const sectionSubmittedCount = new Map<string, number>();
  const sectionSubmittedAt = new Map<string, string>();
  for (const s of sectionSubmissions) {
    const mod = sectionByModule.get(s.moduleId);
    if (!mod || !s.studentId) continue;
    const key = `${s.studentId}:${mod.sectionId}:${mod.termId}`;
    sectionSubmittedCount.set(key, (sectionSubmittedCount.get(key) ?? 0) + 1);
    if (s.submittedAt) {
      const at = (s.submittedAt as Date).toISOString();
      const prev = sectionSubmittedAt.get(key);
      if (!prev || at > prev) sectionSubmittedAt.set(key, at);
    }
  }

  const referralIds = referrals.map((r) => r.id);
  const timelines = await buildCaseTimeline(referralIds);

  const approverIds = [
    ...new Set(
      referrals
        .map((r) => r.admProfiles[0]?.approvedBy ?? null)
        .filter((v): v is string => !!v)
    ),
  ];
  const approverRoles = new Map<string, string>();
  if (approverIds.length > 0) {
    const approvers = await prisma.user.findMany({
      where: { id: { in: approverIds } },
      select: { id: true, role: true },
    });
    for (const a of approvers) approverRoles.set(a.id, String(a.role));
  }
  const merged = referrals.map((r) => {
      const profile = r.admProfiles[0] ?? null;
      const meetings = profile?.parentMeetings ?? [];
      const modules = profile?.modules ?? [];
      const forms = profile?.forms ?? [];
      const devices = profile?.devices ?? [];
      const timeline = timelines.get(r.id) ?? [];
      const dismissed = r.status === "dismissed";
      const stage = profile?.stage ?? "consultation";
      if (profile) {
        timeline.push({
          label: `Moved to the ${stageLabel.get(profile.stage) ?? profile.stage} stage.`,
          detail: null,
          date: profile.createdAt ? profile.createdAt.toISOString().slice(0, 10) : "",
          at: profile.createdAt ? profile.createdAt.toISOString() : "",
          action: "adm_stage",
          byRole: "adm_coordinator",
          source: "case",
          stage: profile.stage,
        });
        if (profile.approvedBy && profile.approvedAt) {
          timeline.push({
            label: "The principal signed the approval.",
            detail: null,
            date: profile.approvedAt.toISOString().slice(0, 10),
            at: profile.approvedAt.toISOString(),
            action: "adm_approved",
            byRole: approverRoles.get(profile.approvedBy) ?? "principal",
            source: "case",
          });
        }
      }
      timeline.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      // Referral carries no createdAt — the filed moment is the oldest entry on
      // its timeline, exactly what the referrals desk shows.
      const referredAt = timeline[0]?.at ?? null;
      const submittedModules = modules.filter((m) => m.submitted);
      const caseSectionId = r.student?.section?.id ?? r.roster?.section?.id ?? null;
      const sectionTotal =
        caseSectionId && r.termId
          ? (sectionModuleCount.get(`${caseSectionId}:${r.termId}`) ?? 0)
          : 0;
      const sectionSubmitted =
        caseSectionId && r.termId && r.student?.userId
          ? (sectionSubmittedCount.get(
              `${r.student.userId}:${caseSectionId}:${r.termId}`
            ) ?? 0)
          : 0;
      const lastModuleTimes = submittedModules
        .map((m) => (m.submissionDate ? (m.submissionDate as Date).toISOString() : null))
        .filter((v): v is string => !!v);
      const sectionLastAt =
        caseSectionId && r.termId && r.student?.userId
          ? sectionSubmittedAt.get(`${r.student.userId}:${caseSectionId}:${r.termId}`)
          : undefined;
      if (sectionLastAt) lastModuleTimes.push(sectionLastAt);
      const cert = forms.find(
        (f) => f.formType === "CERTIFICATION" && f.status === "verified" && f.uploadedAt
      );
      return {
        // The monitoring workspace is keyed by the case file; a referral with
        // no case file yet uses its own id and is tracked on the referrals desk.
        id: profile?.id ?? r.id,
        hasCase: Boolean(profile),
        studentId: r.student?.userId ?? r.roster?.id ?? "",
        studentName:
          r.student?.user.fullName ?? r.roster?.fullName ?? "Learner",
        lrn: r.student?.lrn ?? r.roster?.lrn ?? "",
        mascot: r.student?.mascot ?? r.roster?.mascot ?? null,
        gradeLevel: r.student?.gradeLevel ?? r.roster?.gradeLevel ?? "G7",
        section: r.student?.section?.name ?? r.roster?.section?.name ?? "",
        photoUrl: r.student?.photoUrl ?? null,
        referralId: r.id,
        referralStatus: r.status,
        consultReviewer: r.consultReviewer ?? null,
        stage,
        stageLabel: dismissed
          ? "Cancelled"
          : profile
            ? (stageLabel.get(profile.stage) ?? profile.stage)
            : "Awaiting case file",
        termNumber: r.term.termNumber,
        referredAt,
        eligibilityStatus: profile?.eligibilityStatus ?? "pending",
        approved: !!profile?.approvedBy,
        approvedAt: profile?.approvedAt ? profile.approvedAt.toISOString() : null,
        datePrepared: profile?.createdAt ? profile.createdAt.toISOString().slice(0, 10) : null,
        meetingAttended: meetings.length > 0 ? meetings.some((m) => m.attended) : null,
        hasHomeVisit: r.homeVisitations.length > 0,
        modulesSubmitted: submittedModules.length + sectionSubmitted,
        modulesTotal: modules.length + sectionTotal,
        lastModuleAt:
          lastModuleTimes.length > 0 ? lastModuleTimes.sort().slice(-1)[0] : null,
        devicesIssued: devices.length,
        devicesReturned: devices.filter((d) => d.returnedDate !== null).length,
        certificationIssued: forms.some(
          (f) => f.formType === "CERTIFICATION" && f.status === "verified"
        ),
        certificationAt: cert?.uploadedAt
          ? (cert.uploadedAt as Date).toISOString()
          : null,
        lastMeetingAt:
          meetings.length > 0 && meetings[0].meetingDatetime
            ? (meetings[0].meetingDatetime as Date).toISOString()
            : null,
        timeline,
      };
    });

  if (!hasPaginationParams) {
    return merged;
  }

  const unfilteredTotal = merged.length;

  /* Overview aggregates over every case in scope, not just the page: the
     adviser's report panel reads them for its stat tiles and pipeline split. */
  const stageCounts: Record<string, number> = {};
  let approved = 0;
  let monitoring = 0;
  let closed = 0;
  let modulesSubmitted = 0;
  let modulesTotal = 0;
  let devicesOut = 0;
  for (const c of merged) {
    stageCounts[c.stage] = (stageCounts[c.stage] ?? 0) + 1;
    if (c.approved) approved += 1;
    if (c.stage === "enrollment_monitoring") monitoring += 1;
    if (c.stage === "completion" || c.referralStatus === "resolved" || c.referralStatus === "dismissed")
      closed += 1;
    modulesSubmitted += c.modulesSubmitted;
    modulesTotal += c.modulesTotal;
    devicesOut += Math.max(0, c.devicesIssued - c.devicesReturned);
  }
  const summary = {
    total: unfilteredTotal,
    filtered: 0,
    approved,
    monitoring,
    closed,
    modulesSubmitted,
    modulesTotal,
    devicesOut,
  };

  const filtered = q
    ? merged.filter((c) => {
        const hay = [c.studentName, c.lrn, c.section, c.stageLabel, c.referralStatus]
          .filter((v) => typeof v === "string")
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : merged;
  const total = filtered.length;
  summary.filtered = total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  let safePage = Math.min(page, totalPages);
  if (highlight) {
    const idx = filtered.findIndex((c) => {
      const row = c as unknown as { id?: unknown; referralId?: unknown };
      return row.id === highlight || row.referralId === highlight;
    });
    if (idx >= 0) safePage = Math.floor(idx / pageSize) + 1;
  }
  const start = (safePage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  return {
    data: rows,
    rows,
    cases: rows,
    /* Newest cases in scope (any status), for the overview's recent list —
       the page itself may be filtered or paged away from the newest rows. */
    recent: merged.slice(0, 3),
    total,
    unfilteredTotal,
    summary,
    stageCounts,
    page: safePage,
    totalPages,
    limit: pageSize,
    pageSize,
  };
}
