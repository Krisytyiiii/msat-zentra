import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedLearnerRows,
} from "../../lib/learnerVisibility.js";
import { ADM_STAGE_FLOW } from "../adm.js";
import { isReferralEffectivelyDone } from "./openReferral.js";
import { TIMELINE_DESK_LABELS, buildCaseTimeline } from "../../modules/referrals/timeline.js";
import type { ReferralContext } from "./referral.types.js";

export interface MineQuery {
  hasPaginationParams: boolean;
  page: number;
  pageSize: number;
  q: string;
  highlight: string;
  /** "" = every case; otherwise the case type tab the desk is on. */
  type?: "" | "adm" | "other";
}

export async function listMine(ctx: ReferralContext, query: MineQuery) {
  const { hasPaginationParams, page, pageSize, q, highlight } = query;
  const typeFilter = query.type ?? "";
  const teacherId = ctx.userId;
  const sections = await prisma.section.findMany({
    where: { adviserId: teacherId },
    select: { id: true, name: true, gradeLevel: true },
  });
  if (sections.length === 0 && ctx.role === "adviser") {
    throw new AppError(404, "NOT_ADVISER", "No advisory section assigned");
  }
  const sectionIds = sections.map((s) => s.id);

  const scopeTermId = ctx.termId;
  /* The adviser's own referrals board must also honour learners the adviser
     removed from the advisory list (same archive the roster reads use). */
  const archivedLearners = await archivedAdvisoryLearnerIds();
  const archivedClause = excludeArchivedLearnerRows(archivedLearners);
  const referralWhere = {
    referredBy: teacherId,
    ...(scopeTermId ? { termId: scopeTermId } : {}),
    ...(sectionIds.length > 0
      ? {
          OR: [
            { student: { sectionId: { in: sectionIds } } },
            { roster: { sectionId: { in: sectionIds } } },
          ],
        }
      : {}),
    ...(Object.keys(archivedClause).length > 0 ? archivedClause : {}),
  };
  const referrals = await prisma.referral.findMany({
    where: referralWhere,
    include: {
      student: {
        select: {
          lrn: true,
          mascot: true,
          user: { select: { fullName: true } },
          section: { select: { name: true } },
        },
      },
      roster: {
        select: {
          lrn: true,
          fullName: true,
          mascot: true,
          section: { select: { name: true } },
        },
      },
      anecdotalRecord: {
        select: {
          id: true,
          observationDatetime: true,
          category: true,
          confidentialityLevel: true,
          descriptionOfIncident: true,
          notesRecommendationsActions: true,
        },
      },

      homeVisitations: { select: { id: true } },
      // Completed clinic/counseling sessions mark the case done on the nurse
      // and guidance boards (derived), so the adviser's list must agree for
      // older rows whose referral status was left at in_progress. The
      // scheduledAt/venue fields feed the "session booked" pill the adviser
      // sees on ADM cases.
      counselingSessions: {
        select: {
          status: true,
          completedAt: true,
          scheduledAt: true,
          sessionType: true,
          venue: true,
        },
        orderBy: { scheduledAt: "asc" },
      },
      admProfiles: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          stage: true,
          eligibilityStatus: true,
          approvedBy: true,
          approvedAt: true,
          createdAt: true,
          parentMeetings: {
            orderBy: { meetingDatetime: "desc" },
            take: 5,
            select: { attended: true, meetingDatetime: true },
          },
          modules: { select: { submitted: true, submissionDate: true } },
          devices: { select: { returnedDate: true } },
          forms: { select: { formType: true, status: true, uploadedAt: true } },
        },
      },
    },
    orderBy: { id: "desc" },
  });

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

  // Who dismissed each referral (latest referral_dismissed audit actor):
  // teacher roles mean withdrawn by the filer, anything else means the
  // receiving desk rejected it. Same derivation as the desk queues.
  const dismissedByRole = new Map<string, string>();
  if (referralIds.length > 0) {
    const dismissalLogs = await prisma.auditLog.findMany({
      where: {
        sourceTable: "referrals",
        sourceId: { in: referralIds },
        actionType: "referral_dismissed",
      },
      select: { sourceId: true, user: { select: { role: true } } },
      orderBy: { createdAt: "desc" },
    });
    for (const log of dismissalLogs) {
      if (!dismissedByRole.has(log.sourceId)) {
        dismissedByRole.set(log.sourceId, String(log.user?.role ?? ""));
      }
    }
  }

  const admLabelByStage = new Map(ADM_STAGE_FLOW.map((s) => [s.stage, s.label]));

  const formatted = referrals.map((r) => {
    const isAdm = r.referredToRole === "adm_coordinator";
    const profile = r.admProfiles[0] ?? null;
    const meetings = profile?.parentMeetings ?? [];
    const hasParentMeeting = meetings.length > 0;
    const meetingAttended = meetings.length > 0 ? meetings.some((m) => m.attended) : null;
    const hasHomeVisit = r.homeVisitations.length > 0;

    const admStage = isAdm ? (profile?.stage ?? "consultation") : null;

    const timeline = timelines.get(r.id) ?? [];
    const referredAt =
      timeline[0]?.at ?? new Date().toISOString();
    // The nurse and guidance boards derive "Done" from a completed session
    // even when the referral row still says in_progress. Mirror that here so
    // the adviser sees the same state instead of a stale "In progress".
    const latestCompletedAt = r.counselingSessions
      .filter((s) => s.status === "completed" && s.completedAt)
      .map((s) => (s.completedAt as Date).getTime())
      .sort((a, b) => b - a)[0];
    const displayStatus =
      r.status !== "resolved" &&
      r.status !== "dismissed" &&
      isReferralEffectivelyDone({
        id: r.id,
        status: r.status,
        referredToRole: r.referredToRole,
        counselingSessions: r.counselingSessions,
        admProfiles: r.admProfiles,
      })
        ? "resolved"
        : r.status;
    /* Booked-but-not-yet-held session (guidance/nurse schedules it on the
       referral). Every track surfaces it to the adviser so they know the slot
       without opening the case: earliest scheduled one wins. */
    const bookedSession =
      r.counselingSessions.find((s) => s.status === "scheduled") ?? null;
    if (timeline.length === 0) {
      timeline.push({
        label: `Submitted to the ${TIMELINE_DESK_LABELS[r.referredToRole] ?? "receiving desk"}.`,
        detail: null,
        date: referredAt.slice(0, 10),
        at: referredAt,
        action: "referral_submitted",
        byRole: null,
        source: "case",
      });
    }
    if (profile) {
      timeline.push({
        label: `Moved to the ${admLabelByStage.get(profile.stage) ?? profile.stage} stage.`,
        detail: null,
        date: profile.createdAt.toISOString().slice(0, 10),
        at: profile.createdAt.toISOString(),
        action: "adm_stage",
        byRole: "adm_coordinator",
        source: "case",
        stage: profile.stage,
      });
    }
    if (profile?.approvedBy && profile.approvedAt) {
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

    return {
      id: r.id,
      studentName: r.student?.user.fullName ?? r.roster?.fullName ?? "",
      lrn: r.student?.lrn ?? r.roster?.lrn ?? "",
      mascot: r.student?.mascot ?? r.roster?.mascot ?? null,
      section: r.student?.section?.name ?? r.roster?.section?.name ?? "",
      targetRole: r.referredToRole,
      referredBy: r.referredBy,
      reason: r.reason,
      status: displayStatus,
      dismissedByRole: dismissedByRole.get(r.id) ?? null,
      referredAt,
      resolvedAt:
        displayStatus === "resolved"
          ? (r.resolvedAt?.toISOString() ??
            (latestCompletedAt !== undefined
              ? new Date(latestCompletedAt).toISOString()
              : (timeline[timeline.length - 1]?.at ?? new Date().toISOString())))
          : null,
      anecdotalId: r.anecdotalRecordId,
      observationDate: r.anecdotalRecord.observationDatetime.toISOString().slice(0, 10),
      anecdotalExcerpt: r.anecdotalRecord.descriptionOfIncident,
      category: r.anecdotalRecord.category,
      track: isAdm ? "adm" : "general",

      admReceiver: isAdm ? (r.consultReviewer ?? "adm_coordinator") : null,
      consultReviewer: r.consultReviewer ?? null,
      hasParentMeeting,
      meetingAttended,
      hasHomeVisit,
      admStage,
      admStageLabel: admStage ? (admLabelByStage.get(admStage) ?? admStage) : null,
      admEligibility: profile?.eligibilityStatus ?? null,
      admApproved: !!profile?.approvedBy,
      admApprovedAt: profile?.approvedAt ? profile.approvedAt.toISOString() : null,

      modulesSubmitted: (profile?.modules ?? []).filter((m) => m.submitted).length,
      modulesTotal: (profile?.modules ?? []).length,
      lastModuleAt: (() => {
        const dates = (profile?.modules ?? [])
          .filter((m) => m.submitted && m.submissionDate)
          .map((m) => (m.submissionDate as Date).toISOString());
        return dates.length > 0 ? dates.sort().slice(-1)[0] : null;
      })(),
      devicesReturned: (profile?.devices ?? []).filter((d) => d.returnedDate !== null).length,
      bookedSession:
        bookedSession && displayStatus !== "dismissed"
          ? {
              scheduledAt: bookedSession.scheduledAt.toISOString(),
              sessionType: bookedSession.sessionType,
              venue: bookedSession.venue ?? null,
            }
          : null,
      certificationAt: (() => {
        const cert = (profile?.forms ?? []).find(
          (f) => f.formType === "CERTIFICATION" && f.status === "verified" && f.uploadedAt
        );
        return cert?.uploadedAt ? (cert.uploadedAt as Date).toISOString() : null;
      })(),
      lastMeetingAt:
        meetings.length > 0 && meetings[0].meetingDatetime
          ? (meetings[0].meetingDatetime as Date).toISOString()
          : null,
      timeline,
      notes: r.notes,
      escalationReason: r.escalationReason,
      followUpDate: r.followUpDate,
      escalatedTo: r.escalatedTo,
    };
  });

  /* Newest referral first. `Referral` carries no createdAt column — the filing
     moment the board shows (`referredAt`) is derived from the case's first
     audit entry, so sort the built rows here, before the in-memory paging. */
  formatted.sort((a, b) =>
    a.referredAt === b.referredAt ? 0 : a.referredAt < b.referredAt ? 1 : -1
  );

  if (!hasPaginationParams) {
    return formatted;
  }
  // Casebook counts are always over the whole term scope (never narrowed by
  // the search box), so the tabs stay stable while the user types.
  const counts = { all: formatted.length, adm: 0, other: 0 };
  for (const r of formatted) {
    if (r.targetRole === "adm_coordinator") counts.adm += 1;
    else counts.other += 1;
  }

  const typeScoped =
    typeFilter === "adm"
      ? formatted.filter((r) => r.targetRole === "adm_coordinator")
      : typeFilter === "other"
        ? formatted.filter((r) => r.targetRole !== "adm_coordinator")
        : formatted;
  const unfilteredTotal = typeScoped.length;
  const filtered = q
    ? typeScoped.filter((r) => {
        const hay = [
          r.studentName,
          r.lrn,
          r.section,
          r.reason,
          r.category,
          r.status,
          r.anecdotalExcerpt,
        ]
          .filter((v) => typeof v === "string")
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : typeScoped;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  let safePage = Math.min(page, totalPages);
  if (highlight) {
    const idx = filtered.findIndex(
      (r) => (r as { id?: unknown }).id === highlight
    );
    if (idx >= 0) safePage = Math.floor(idx / pageSize) + 1;
  }
  const start = (safePage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  return {
    data: rows,
    rows,
    referrals: rows,
    total,
    unfilteredTotal,
    counts,
    summary: { total: unfilteredTotal, filtered: total },
    page: safePage,
    totalPages,
    limit: pageSize,
    pageSize,
  };
}
