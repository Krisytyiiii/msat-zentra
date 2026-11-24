import { prisma } from "../../lib/prisma.js";
import { INTERNAL_AGGREGATE_ROW_CAP } from "../../lib/pagination.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedLearnerRows,
} from "../../lib/learnerVisibility.js";

/**
 * Clinic reports dataset.
 *
 * The reports page needs every case on the nurse desk (totals, 12-week trend,
 * category mix, bottlenecks, risk watch) — not one page of the referral queue.
 * Building that client-side from `/api/referrals/?page=1` meant the charts
 * were computed from whichever 16 rows happened to load, and the browser
 * downloaded attachments/full case detail just to count cases.
 *
 * This reads the whole term scope once with a narrow projection (the same
 * columns the desk's row mapper needs — no attachments, no full anecdote
 * narrative, no parent links), plus the two audit lookups that shape the
 * buckets: first log = referred time, latest log = last action, dismissal log
 * = who closed it.
 */

export interface NurseReportReferral {
  id: string;
  status: string;
  /**
   * The desk re-applies `isNurseScope` (it is shared with the queue mapper) to
   * every row it renders, so this has to travel with the payload: a plain
   * clinic case (`referredToRole: "nurse"`, not escalated) was being dropped
   * client-side and the whole reports page fell back to "No referrals".
   */
  referredToRole: string | null;
  escalatedTo: string | null;
  consultReviewer: string | null;
  reason: string | null;
  referralFormReady: boolean;
  followUpDate: string | null;
  referredAt: string | null;
  lastActionAt: string | null;
  dismissedByRole: string | null;
  anecdotalRecord: {
    id: string;
    observationDatetime: string | null;
    category: string | null;
  } | null;
  student: {
    userId: string;
    lrn: string;
    gradeLevel: string | null;
    section: { name: string | null } | null;
  } | null;
  roster: {
    id: string;
    fullName: string | null;
    lrn: string | null;
    gradeLevel: string | null;
    mascot: string | null;
    section: { name: string | null } | null;
  } | null;
  counselingSessions: {
    id: string;
    sessionType: string;
    scheduledAt: string | null;
    status: string;
    createdAt: string | null;
    completedAt: string | null;
  }[];
}

export interface NurseReportsPayload {
  referrals: NurseReportReferral[];
  /** Every learner id the page needs a risk lookup for (profile + roster). */
  studentIds: string[];
}

export async function getNurseReports(ctx: {
  termId: string | null;
}): Promise<NurseReportsPayload> {
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

  const rows = await prisma.referral.findMany({
    where,
    orderBy: { id: "desc" },
    take: INTERNAL_AGGREGATE_ROW_CAP,
    select: {
      id: true,
      status: true,
      referredToRole: true,
      escalatedTo: true,
      consultReviewer: true,
      reason: true,
      referralFormReady: true,
      followUpDate: true,
      anecdotalRecord: {
        select: { id: true, observationDatetime: true, category: true },
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
          gradeLevel: true,
          mascot: true,
          section: { select: { name: true } },
        },
      },
      counselingSessions: {
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          sessionType: true,
          scheduledAt: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  });

  const ids = rows.map((r) => r.id);
  const [firstLogs, latestLogs, dismissalLogs] = await Promise.all([
    ids.length
      ? prisma.auditLog.groupBy({
          by: ["sourceId"],
          where: { sourceTable: "referrals", sourceId: { in: ids } },
          _min: { createdAt: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.auditLog.findMany({
          where: { sourceTable: "referrals", sourceId: { in: ids } },
          select: { sourceId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
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

  const referredAt = new Map<string, Date>();
  for (const log of firstLogs) {
    if (log._min.createdAt) referredAt.set(log.sourceId, log._min.createdAt);
  }
  const lastActionAt = new Map<string, Date>();
  for (const log of latestLogs) {
    if (!lastActionAt.has(log.sourceId)) {
      lastActionAt.set(log.sourceId, log.createdAt);
    }
  }
  const dismissedByRole = new Map<string, string>();
  for (const log of dismissalLogs) {
    if (!dismissedByRole.has(log.sourceId)) {
      dismissedByRole.set(log.sourceId, String(log.user?.role ?? ""));
    }
  }

  const studentIds = new Set<string>();
  const referrals: NurseReportReferral[] = rows.map((r) => {
    const studentId = r.student?.userId ?? r.roster?.id ?? null;
    if (studentId) studentIds.add(studentId);
    const referred =
      referredAt.get(r.id) ?? r.anecdotalRecord?.observationDatetime ?? null;
    const lastAction = lastActionAt.get(r.id) ?? null;
    return {
      id: r.id,
      status: r.status,
      referredToRole: r.referredToRole,
      escalatedTo: r.escalatedTo,
      consultReviewer: r.consultReviewer,
      reason: r.reason,
      referralFormReady: r.referralFormReady,
      followUpDate: r.followUpDate?.toISOString() ?? null,
      referredAt: referred?.toISOString() ?? null,
      lastActionAt: lastAction?.toISOString() ?? null,
      dismissedByRole: dismissedByRole.get(r.id) ?? null,
      anecdotalRecord: r.anecdotalRecord
        ? {
            id: r.anecdotalRecord.id,
            observationDatetime:
              r.anecdotalRecord.observationDatetime?.toISOString() ?? null,
            category: r.anecdotalRecord.category,
          }
        : null,
      student: r.student
        ? {
            userId: r.student.userId,
            lrn: r.student.lrn,
            gradeLevel: r.student.gradeLevel,
            section: r.student.section
              ? { name: r.student.section.name }
              : null,
          }
        : null,
      roster: r.roster
        ? {
            id: r.roster.id,
            fullName: r.roster.fullName,
            lrn: r.roster.lrn,
            gradeLevel: r.roster.gradeLevel,
            mascot: r.roster.mascot,
            section: r.roster.section ? { name: r.roster.section.name } : null,
          }
        : null,
      counselingSessions: r.counselingSessions.map((s) => ({
        id: s.id,
        sessionType: s.sessionType,
        scheduledAt: s.scheduledAt?.toISOString() ?? null,
        status: s.status,
        createdAt: s.createdAt?.toISOString() ?? null,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    };
  });

  return { referrals, studentIds: [...studentIds].sort() };
}
