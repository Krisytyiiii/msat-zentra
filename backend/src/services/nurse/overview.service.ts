import { prisma } from "../../lib/prisma.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedLearnerRows,
} from "../../lib/learnerVisibility.js";

/**
 * Clinic command overview.
 *
 * The desk used to build its whole dashboard from the first page of the
 * referral queue (15 rows, attachments and all), so every KPI and chart was
 * computed from whatever 15 cases happened to load — wrong, and heavy on both
 * the pooler and the browser. This service reads the *scope* once with a
 * narrow projection (status + session statuses, no attachments, no identity),
 * computes every aggregate over the whole term server-side, then fetches the
 * identity fields for just the handful of rows the page actually lists
 * (5 latest + 8 longest-waiting). One round trip from the client.
 */

const DAY_MS = 86_400_000;
const TREND_DAYS = 14;
const LATEST_LIMIT = 3;
const NEEDS_REVIEW_LIMIT = 8;

export interface NurseBreakdownRow {
  key: string;
  label: string;
  count: number;
}

export interface NurseTrendPoint {
  date: string;
  adm: number;
  clinic: number;
}

interface Bucket {
  key: string;
  label: string;
}

/** Same bucket rules as the desk's `deriveActionStatus` / `chartBucketFor`. */
function dismissalBucket(
  status: string,
  dismissedByRole?: string | null,
): Bucket | null {
  if (status !== "dismissed" && status !== "rejected") return null;
  const withdrawn =
    dismissedByRole === "adviser" || dismissedByRole === "subject_teacher";
  return withdrawn
    ? { key: "cancelled", label: "Cancelled" }
    : { key: "rejected", label: "Rejected" };
}

function chartBucketFor(
  type: string,
  status: string,
  sessions: { status: string }[],
  dismissedByRole?: string | null,
): Bucket {
  const hasScheduled = sessions.some((s) => s.status === "scheduled");
  const hasCompleted = sessions.some((s) => s.status === "completed");

  if (type === "ADM" && status === "in_progress") {
    return { key: "endorsed", label: "Endorsed" };
  }
  const dismissal = dismissalBucket(status, dismissedByRole);
  if (dismissal) return dismissal;
  if (status === "resolved") return { key: "done", label: "Done" };
  if (status === "follow_up") return { key: "followup", label: "Follow-up" };
  if (hasScheduled) return { key: "booked", label: "Booked session" };
  if (hasCompleted) return { key: "done", label: "Done" };
  if (sessions.length > 0) return { key: "booked", label: "Booked session" };
  return { key: "needs_review", label: "Needs review" };
}

function breakdown(rows: ScopeRow[], dismissed: Map<string, string>): NurseBreakdownRow[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const type = r.consultReviewer ? "ADM" : "Clinic";
    const bucket = chartBucketFor(
      type,
      r.status,
      r.counselingSessions,
      dismissed.get(r.id),
    );
    const existing = counts.get(bucket.key);
    if (existing) existing.count += 1;
    else counts.set(bucket.key, { label: bucket.label, count: 1 });
  }
  return [...counts.entries()]
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

interface ScopeRow {
  id: string;
  status: string;
  escalatedTo: string | null;
  consultReviewer: string | null;
  anecdotalRecord: { observationDatetime: Date | null } | null;
  counselingSessions: { status: string }[];
}

export async function getNurseOverview(ctx: { termId: string | null }) {
  const scopeClauses: Record<string, unknown>[] = [
    {
      OR: [
        { referredToRole: "nurse" },
        { status: "escalated", escalatedTo: "nurse" },
        { referredToRole: "adm_coordinator", consultReviewer: "nurse" },
      ],
    },
  ];
  if (ctx.termId) scopeClauses.push({ termId: ctx.termId });
  const archivedClause = excludeArchivedLearnerRows(
    await archivedAdvisoryLearnerIds(),
  );
  if (Object.keys(archivedClause).length > 0) scopeClauses.push(archivedClause);

  const where =
    scopeClauses.length === 1 ? scopeClauses[0] : { AND: scopeClauses };

  // Narrow projection: no identity, no attachments, no notes — this is only
  // ever read to count and bucket, so the scan stays a few small columns.
  const rows = await prisma.referral.findMany({
    where,
    select: {
      id: true,
      status: true,
      escalatedTo: true,
      consultReviewer: true,
      anecdotalRecord: { select: { observationDatetime: true } },
      counselingSessions: { select: { status: true } },
    },
  }) as ScopeRow[];

  const ids = rows.map((r) => r.id);

  // Referred time (earliest audit row, falling back to the anecdote) and who
  // dismissed a case — both shape the buckets, so both are needed even for
  // the aggregate pass.
  const [firstLogs, dismissalLogs] = await Promise.all([
    ids.length
      ? prisma.auditLog.groupBy({
          by: ["sourceId"],
          where: { sourceTable: "referrals", sourceId: { in: ids } },
          _min: { createdAt: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.auditLog.findMany({
          where: {
            sourceTable: "referrals",
            sourceId: { in: ids },
            actionType: "referral_dismissed",
          },
          select: { sourceId: true, user: { select: { role: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const referredAtMs = new Map<string, number>();
  for (const log of firstLogs) {
    if (log._min.createdAt) {
      referredAtMs.set(log.sourceId, log._min.createdAt.getTime());
    }
  }
  const dismissedByRole = new Map<string, string>();
  for (const log of dismissalLogs) {
    if (!dismissedByRole.has(log.sourceId)) {
      dismissedByRole.set(log.sourceId, String(log.user?.role ?? ""));
    }
  }

  const referredOf = (row: ScopeRow): number => {
    const logged = referredAtMs.get(row.id);
    if (logged !== undefined) return logged;
    return row.anecdotalRecord?.observationDatetime?.getTime() ?? 0;
  };

  const kpis = {
    needsReview: rows.filter((r) => r.status === "pending").length,
    bookedSession: rows.filter((r) =>
      r.counselingSessions.some((s) => s.status === "scheduled"),
    ).length,
    endorsedToAdm: rows.filter(
      (r) => r.consultReviewer && r.status === "in_progress",
    ).length,
    followUp: rows.filter((r) => r.status === "follow_up").length,
    doneSession: rows.filter((r) =>
      r.counselingSessions.some((s) => s.status === "completed"),
    ).length,
    total: rows.length,
  };

  const statusBreakdown = breakdown(rows, dismissedByRole);
  const clinicStatusBreakdown = breakdown(
    rows.filter((r) => !r.consultReviewer),
    dismissedByRole,
  );
  const admStatusBreakdown = breakdown(
    rows.filter((r) => r.consultReviewer),
    dismissedByRole,
  );

  const dailyTrend: NurseTrendPoint[] = [];
  const trendIndex = new Map<string, number>();
  const now = Date.now();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    if (trendIndex.has(date)) continue;
    trendIndex.set(date, dailyTrend.length);
    dailyTrend.push({ date, adm: 0, clinic: 0 });
  }
  for (const row of rows) {
    const ms = referredOf(row);
    if (!ms) continue;
    const idx = trendIndex.get(new Date(ms).toISOString().slice(0, 10));
    if (idx === undefined) continue;
    if (row.consultReviewer) dailyTrend[idx].adm += 1;
    else dailyTrend[idx].clinic += 1;
  }

  const latestIds = [...rows]
    .sort((a, b) => referredOf(b) - referredOf(a))
    .slice(0, LATEST_LIMIT)
    .map((r) => r.id);
  const needsIds = rows
    .filter(
      (r) =>
        r.status === "pending" ||
        (r.status === "escalated" && r.escalatedTo === "nurse"),
    )
    .sort((a, b) => referredOf(a) - referredOf(b))
    .slice(0, NEEDS_REVIEW_LIMIT)
    .map((r) => r.id);

  const detailIds = [...new Set([...latestIds, ...needsIds])];
  const detailed = detailIds.length
    ? await prisma.referral.findMany({
        where: { id: { in: detailIds } },
        select: {
          id: true,
          status: true,
          escalatedTo: true,
          consultReviewer: true,
          reason: true,
          referralFormReady: true,
          followUpDate: true,
          intakeNotes: true,
          notes: true,
          escalationReason: true,
          anecdotalRecord: {
            select: {
              id: true,
              observationDatetime: true,
              category: true,
              descriptionOfIncident: true,
              descriptionOfLocation: true,
              classPerformance: true,
              attendanceSummary: true,
              notesRecommendationsActions: true,
            },
          },
          student: {
            select: {
              userId: true,
              lrn: true,
              gradeLevel: true,
              section: { select: { name: true } },
            },
          },
          roster: {
            select: {
              id: true,
              fullName: true,
              lrn: true,
              mascot: true,
              gradeLevel: true,
              section: { select: { name: true } },
            },
          },
          counselingSessions: {
            orderBy: { scheduledAt: "asc" },
            select: {
              id: true,
              sessionType: true,
              scheduledAt: true,
              venue: true,
              status: true,
              sessionNotes: true,
              outcome: true,
              cancelReason: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      })
    : [];

  const byId = new Map(
    detailed.map((row) => [
      row.id,
      {
        ...row,
        referredAt: (() => {
          const ms =
            referredAtMs.get(row.id) ??
            row.anecdotalRecord?.observationDatetime?.getTime() ??
            null;
          return ms ? new Date(ms).toISOString() : null;
        })(),
        dismissedByRole: dismissedByRole.get(row.id) ?? null,
      },
    ]),
  );
  const pick = (id: string) => byId.get(id) ?? null;

  return {
    kpis,
    latestReferrals: latestIds.map(pick).filter(Boolean),
    needsReview: needsIds.map(pick).filter(Boolean),
    statusBreakdown,
    clinicStatusBreakdown,
    admStatusBreakdown,
    dailyTrend,
  };
}
