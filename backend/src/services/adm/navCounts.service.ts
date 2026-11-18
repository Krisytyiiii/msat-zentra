import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { archivedAdvisoryLearnerIds } from "../../lib/learnerVisibility.js";

/** One queue row: the case id plus a version that changes on update. */
export interface CoordinatorNavEntry {
  id: string;
  /**
   * Postgres tuple version (`xmin`) of the row(s) behind the entry — it bumps
   * on every UPDATE without a schema column, so the sidebar dot can tell
   * "this changed" from "nothing happened" and never depends on a notification
   * being fanned out.
   */
  v: string;
}

/**
 * One list per coordinator sidebar page. Kept in sync with `ROUTE_KEYS` in
 * `frontend/src/services/coordinator/navCounts.service.ts`.
 */
export interface CoordinatorNavQueues {
  /** Overview: the ADM pipeline plus the coordinator's unread notifications. */
  overview: CoordinatorNavEntry[];
  /** ADM Cases: endorsed cases still in the referral stages (intake → approval). */
  referrals: CoordinatorNavEntry[];
  /** Enrolled: principal-signed cases under monitoring / completed. */
  enrolled: CoordinatorNavEntry[];
  /** Certifications: every principal-approved case (paperwork desk). */
  certifications: CoordinatorNavEntry[];
  /** Devices: the issued-device ledger. */
  devices: CoordinatorNavEntry[];
}

export interface CoordinatorNavContext {
  userId: string;
}

function mergeEntries(...groups: CoordinatorNavEntry[][]): CoordinatorNavEntry[] {
  const seen = new Set<string>();
  const merged: CoordinatorNavEntry[] = [];
  for (const group of groups) {
    for (const entry of group) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      merged.push(entry);
    }
  }
  return merged;
}

/**
 * Compact queue entries for the coordinator sidebar dots. One roundtrip on
 * purpose: the rail polls this on a short interval, and every extra query costs
 * a full pooler roundtrip.
 *
 * The scope mirrors what the desk actually reads:
 *  - `listAllReferrals` only shows ADM profiles whose referral was endorsed
 *    (consult reviewer nurse / guidance + referral form ready), and pre-profile
 *    referrals the same desks forwarded but that have no profile yet;
 *  - `listApprovals` shows every principal-approved profile;
 *  - `listDevices` shows the device ledger (archived learners excluded).
 * Archive rows for adviser-removed learners are filtered out like the boards.
 */
export async function getCoordinatorNavQueues(
  ctx: CoordinatorNavContext,
): Promise<CoordinatorNavQueues> {
  const archived = await archivedAdvisoryLearnerIds();
  const archivedProfileSql =
    archived.studentIds.length > 0
      ? Prisma.sql`AND a."studentId" NOT IN (${Prisma.join(archived.studentIds)})`
      : Prisma.empty;
  const archivedReferralSql =
    archived.rosterIds.length > 0 || archived.studentIds.length > 0
      ? Prisma.sql`
          AND (r."studentId" IS NULL${
            archived.studentIds.length > 0
              ? Prisma.sql` OR r."studentId" NOT IN (${Prisma.join(archived.studentIds)})`
              : Prisma.empty
          })
          AND (r."rosterId" IS NULL${
            archived.rosterIds.length > 0
              ? Prisma.sql` OR r."rosterId" NOT IN (${Prisma.join(archived.rosterIds)})`
              : Prisma.empty
          })`
      : Prisma.empty;
  const archivedDeviceSql =
    archived.studentIds.length > 0
      ? Prisma.sql`AND d."admLearnerProfileId" NOT IN (
          SELECT a.id FROM "AdmLearnerProfile" a
          WHERE a."studentId" IN (${Prisma.join(archived.studentIds)})
        )`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<{ q: string; id: string; v: string }[]>(
    Prisma.sql`
      WITH visible AS (
        SELECT a.id, a.stage, a."approvedBy", a.xmin::text AS pv
        FROM "AdmLearnerProfile" a
        JOIN "Referral" r ON r.id = a."referralId"
        WHERE r."consultReviewer" IN ('nurse', 'guidance_counselor')
          AND r."referralFormReady" = true
          ${archivedProfileSql}
      ),
      versions AS (
        SELECT v.id,
               v.stage,
               v."approvedBy",
               v.pv
                 || ':' || COUNT(DISTINCT mt.id)::text
                 || ':' || COALESCE(MAX(mt.xmin::text::bigint)::text, '0')
                 || ':' || COUNT(DISTINCT m.id)::text
                 || ':' || COALESCE(MAX(m.xmin::text::bigint)::text, '0')
                 || ':' || COUNT(DISTINCT f.id)::text
                 || ':' || COALESCE(MAX(f.xmin::text::bigint)::text, '0') AS base,
               COUNT(DISTINCT m.id)::text
                 || ':' || COALESCE(MAX(m.xmin::text::bigint)::text, '0') AS modules
        FROM visible v
        LEFT JOIN "AdmParentMeeting" mt ON mt."admLearnerProfileId" = v.id
        LEFT JOIN "AdmModule" m ON m."admLearnerProfileId" = v.id
        LEFT JOIN "AdmForm" f ON f."admLearnerProfileId" = v.id
        GROUP BY v.id, v.stage, v."approvedBy", v.pv
      ),
      early AS (
        SELECT r.id, r.xmin::text AS v
        FROM "Referral" r
        WHERE r."referredToRole" = 'adm_coordinator'
          AND r."consultReviewer" IN ('nurse', 'guidance_counselor')
          AND r."referralFormReady" = true
          AND r.status <> 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM "AdmLearnerProfile" a WHERE a."referralId" = r.id
          )
          ${archivedReferralSql}
      ),
      notifications AS (
        SELECT id, xmin::text AS v
        FROM "Notification"
        WHERE "userId" = ${ctx.userId} AND "isRead" = false
      ),
      devices AS (
        SELECT d.id, d.xmin::text AS v
        FROM "AdmDevice" d
        WHERE TRUE
          ${archivedDeviceSql}
      )
      SELECT 'overview'::text AS q, id, base AS v FROM versions
      UNION ALL SELECT 'overview', id, v FROM notifications
      UNION ALL
        SELECT 'referrals', id, base
        FROM versions
        WHERE stage NOT IN ('enrollment_monitoring', 'completion')
      UNION ALL SELECT 'referrals', id, v FROM early
      UNION ALL
        SELECT 'enrolled', id, base || ':' || modules
        FROM versions
        WHERE stage IN ('enrollment_monitoring', 'completion')
          AND "approvedBy" IS NOT NULL
      UNION ALL
        SELECT 'certifications', id, base
        FROM versions
        WHERE "approvedBy" IS NOT NULL
      UNION ALL SELECT 'devices', id, v FROM devices
    `,
  );

  const queues: CoordinatorNavQueues = {
    overview: [],
    referrals: [],
    enrolled: [],
    certifications: [],
    devices: [],
  };
  for (const row of rows) {
    const key = row.q as keyof CoordinatorNavQueues;
    if (!(key in queues)) continue;
    queues[key].push({ id: row.id, v: row.v });
  }

  return {
    overview: mergeEntries(queues.overview),
    referrals: mergeEntries(queues.referrals),
    enrolled: mergeEntries(queues.enrolled),
    certifications: mergeEntries(queues.certifications),
    devices: mergeEntries(queues.devices),
  };
}
