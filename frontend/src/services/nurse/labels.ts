import { formatGrade, formatSection } from "@/lib/utils";
import type {
  NurseBreakdownRow,
  NurseOverviewData,
  NurseQueueRow,
  NurseSessionItem,
  RawReferral,
  RawSession,
} from "./nurse.types";

export const NURSE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  in_progress: "In progress",
  follow_up: "Follow-up",
  info_requested: "Needs info",
  escalated: "Escalated",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const DAY_MS = 86_400_000;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function titleCase(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Dismissed splits into two bucket labels, matching the referral status:
    the filing teacher withdrawing reads "Cancelled", the desk rejecting
    reads "Rejected". */
function dismissalBucket(
  status: string,
  dismissedByRole?: string | null,
): { key: string; label: string } | null {
  if (status !== "dismissed" && status !== "rejected") return null;
  const withdrawn =
    dismissedByRole === "adviser" || dismissedByRole === "subject_teacher";
  return withdrawn
    ? { key: "cancelled", label: "Cancelled" }
    : { key: "rejected", label: "Rejected" };
}

export function deriveActionStatus(
  type: string,
  status: string,
  sessions: { status?: string | null }[],
  dismissedByRole?: string | null,
): { key: string; label: string } {
  const hasScheduled = sessions.some((s) => s.status === "scheduled");
  const hasCompleted = sessions.some((s) => s.status === "completed");
  const isEndorsedCase = type === "ADM" && status === "in_progress";

  if (isEndorsedCase) return { key: "endorsed", label: "Endorsed" };
  const dismissal = dismissalBucket(status, dismissedByRole);
  if (dismissal) return dismissal;
  if (status === "resolved") return { key: "done", label: "Done" };
  if (status === "follow_up") return { key: "followup", label: "Follow-up" };
  if (hasScheduled) return { key: "booked", label: "Booked session" };
  if (hasCompleted) return { key: "done_session", label: "Done session" };
  if (status === "pending") return { key: "needs_review", label: "Needs review" };
  if (status === "escalated") return { key: "escalated", label: "Escalated" };
  return { key: status, label: NURSE_STATUS_LABELS[status] ?? titleCase(status) };
}

export function chartBucketFor(
  type: string,
  status: string,
  sessions: { status?: string | null }[],
  dismissedByRole?: string | null,
): { key: string; label: string } {
  const list = sessions ?? [];
  const hasScheduled = list.some((s) => s.status === "scheduled");
  const hasCompleted = list.some((s) => s.status === "completed");

  if (type === "ADM" && status === "in_progress") return { key: "endorsed", label: "Endorsed" };
  const dismissal = dismissalBucket(status, dismissedByRole);
  if (dismissal) return dismissal;
  if (status === "resolved") return { key: "done", label: "Done" };
  if (status === "follow_up") return { key: "followup", label: "Follow-up" };
  if (hasScheduled) return { key: "booked", label: "Booked session" };
  if (hasCompleted) return { key: "done", label: "Done" };
  if (list.length > 0) return { key: "booked", label: "Booked session" };
  return { key: "needs_review", label: "Needs review" };
}

/** Optimistic cache surgery for the board's "Endorse & forward": drops the
    row from Needs review, flips it to Endorsed in the Latest referrals feed,
    and moves its KPI/breakdown counts so the overview page never needs a
    refetch after the action. */
export function applyAdmEndorsedCase(old: unknown, row: NurseQueueRow): unknown {
  if (!old || typeof old !== "object") return old;
  const data = old as NurseOverviewData;
  if (!Array.isArray(data.needsReview) || !data.kpis) return old;
  if (!data.needsReview.some((r) => r.id === row.id)) return old;
  const fromBucket = chartBucketFor(row.type, row.status, row.sessions, row.dismissedByRole);
  const toBucket = chartBucketFor("ADM", "in_progress", []);
  return {
    ...data,
    needsReview: data.needsReview.filter((r) => r.id !== row.id),
    ...(Array.isArray(data.latestReferrals)
      ? {
          latestReferrals: data.latestReferrals.map((r) =>
            r.id === row.id ? { ...r, status: "in_progress" } : r,
          ),
        }
      : {}),
    kpis: {
      ...data.kpis,
      needsReview: Math.max(0, data.kpis.needsReview - 1),
      endorsedToAdm: data.kpis.endorsedToAdm + 1,
    },
    statusBreakdown: shiftBreakdown(data.statusBreakdown, fromBucket.key, toBucket),
    admStatusBreakdown: shiftBreakdown(data.admStatusBreakdown, fromBucket.key, toBucket),
  };
}

function shiftBreakdown(
  rows: NurseBreakdownRow[],
  fromKey: string,
  to: { key: string; label: string },
): NurseBreakdownRow[] {
  if (!Array.isArray(rows)) return rows;
  const from = rows.find((r) => r.key === fromKey);
  if (!from || from.count < 1) return rows;
  const next: NurseBreakdownRow[] = [];
  for (const r of rows) {
    if (r.key === fromKey) {
      if (r.count > 1) next.push({ ...r, count: r.count - 1 });
    } else if (r.key === to.key) {
      next.push({ ...r, count: r.count + 1 });
    } else {
      next.push(r);
    }
  }
  if (!next.some((r) => r.key === to.key)) {
    next.push({ key: to.key, label: to.label, count: 1 });
  }
  return next.sort((a, b) => b.count - a.count);
}

export function isNurseScope(r: RawReferral): boolean {
  if (r.referredToRole === "nurse") return true;
  if (r.status === "escalated" && r.escalatedTo === "nurse") return true;
  if (r.referredToRole === "adm_coordinator" && r.consultReviewer === "nurse") return true;
  return false;
}

function identityOf(r: RawReferral): {
  student: string;
  lrn: string;
  section: string;
  grade: string;
  mascot: string | null;
} {
  if (r.roster) {
    return {
      student: r.roster.fullName?.trim() || (r.roster.lrn ? `Student ${r.roster.lrn}` : "Unknown student"),
      lrn: r.roster.lrn ?? "—",
      section: formatSection(r.roster.section?.name) || "—",
      grade: formatGrade(r.roster.gradeLevel) || "—",
      mascot: r.roster.mascot ?? null,
    };
  }
  if (r.student) {
    return {
      student: `Student ${r.student.lrn}`,
      lrn: r.student.lrn,
      section: formatSection(r.student.section?.name) || "—",
      grade: formatGrade(r.student.gradeLevel) || "—",
      // Desk rule: mascots come from roster records only — the account's
      // stored mascot is never shown here.
      mascot: null,
    };
  }
  return { student: "Unknown student", lrn: "—", section: "—", grade: "—", mascot: null };
}

export function toSessionItem(s: RawSession): NurseSessionItem {
  return {
    id: s.id,
    sessionType: s.sessionType ?? "individual",
    scheduledAt: s.scheduledAt ?? "",
    date: parseDate(s.scheduledAt)?.toISOString().slice(0, 10) ?? "",
    venue: s.venue ?? "",
    status: s.status ?? "scheduled",
    sessionNotes: s.sessionNotes ?? "",
    outcome: s.outcome ?? "",
    cancelReason: s.cancelReason ?? "",
    cancelledByRole: s.cancelledByRole ?? null,
    createdAt: s.createdAt ?? s.scheduledAt ?? "",
    completedAt: parseDate(s.completedAt)?.toISOString().slice(0, 10) ?? "",
    attachments: (s.attachments ?? []).map((a) => ({
      id: a.id,
      fileUrl: a.fileUrl,
      fileName: a.fileName,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      uploadedAt: a.uploadedAt,
    })),
  };
}

export function toQueueRow(r: RawReferral): NurseQueueRow {
  const identity = identityOf(r);

  const referred = parseDate(r.referredAt) ?? parseDate(r.anecdotalRecord?.observationDatetime);
  const anec = r.anecdotalRecord ?? null;
  const observed = parseDate(anec?.observationDatetime);
  const sessions = (r.counselingSessions ?? []).map(toSessionItem);
  return {
    id: r.id,
    ...identity,
    type: r.consultReviewer ? "ADM" : "Clinic",
    consultReviewer: r.consultReviewer ?? null,
    referralReady: r.referralFormReady === true,
    category: anec?.category ? titleCase(anec.category) : "—",
    reason: r.reason?.trim() ? r.reason.trim().slice(0, 140) : "No reason recorded",
    status: r.status ?? "pending",
    date: referred ? referred.toISOString().slice(0, 10) : "—",
    waitingDays: referred ? Math.max(0, wholeDaysBetween(referred, startOfToday())) : null,
    referredAt: r.referredAt ?? r.anecdotalRecord?.observationDatetime ?? "",
    followUpDate: parseDate(r.followUpDate)?.toISOString().slice(0, 10) ?? "",
    intakeNotes: r.intakeNotes?.trim() ?? "",
    notes: r.notes?.trim() ?? "",
    escalationReason: r.escalationReason?.trim() ?? "",
    sessions,
    completedSessions: sessions.filter((s) => s.status === "completed").length,
    lastActionAt: r.lastActionAt ?? "",
    lastActionType: r.lastActionType ?? "",
    dismissedByRole: r.dismissedByRole ?? "",
    anecdotalId: anec?.id ?? null,
    anecdotal: anec
      ? {
          observedAt: observed ? observed.toISOString().slice(0, 10) : "—",
          category: anec.category ? titleCase(anec.category) : "—",
          location: anec.descriptionOfLocation?.trim() || "—",
          incident: anec.descriptionOfIncident?.trim() || "—",
          classPerformance: anec.classPerformance?.trim() || "—",
          attendanceSummary: anec.attendanceSummary?.trim() || "—",
          notes: anec.notesRecommendationsActions?.trim() || "—",
        }
      : null,
  };
}
