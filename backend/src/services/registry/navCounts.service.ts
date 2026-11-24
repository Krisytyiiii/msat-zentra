import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import {
  GRADE_BAND_7_10,
  GRADE_BAND_11_12,
} from "../../modules/registry/registry.repository.js";

/** One desk row: the record id plus a version that changes on every update. */
export interface RegistryNavEntry {
  id: string;
  /**
   * Postgres tuple version (`xmin`) of the row(s) behind the entry — it bumps
   * on every UPDATE without a schema column, so the sidebar dot can tell "this
   * changed" from "nothing happened" and never depends on a notification being
   * fanned out.
   */
  v: string;
}

/**
 * One list per registry sidebar page. Kept in sync with `ROUTE_KEYS` in
 * `frontend/src/services/{record-keeper,registrar}/navCounts.service.ts`.
 */
export interface RegistryNavQueues {
  /** Overview: every desk queue plus the desk's unread notifications. */
  overview: RegistryNavEntry[];
  /** Final grades filed for this desk's band, one entry per section. */
  finalGrades: RegistryNavEntry[];
  /** Adviser SF10 access requests filed for this desk's band. */
  adviserAccess: RegistryNavEntry[];
  /** SF10 files filed on this desk. */
  sf10: RegistryNavEntry[];
  /** Subject catalog for this desk's band. */
  subjects: RegistryNavEntry[];
}

/** The two registry desks that share this service (banded G7–10 / G11–12). */
export type RegistryDesk = "record_keeper" | "registrar";

const DESK_SCOPE: Record<
  RegistryDesk,
  { grades: readonly string[] }
> = {
  record_keeper: { grades: GRADE_BAND_7_10 },
  registrar: { grades: GRADE_BAND_11_12 },
};

function mergeEntries(...groups: RegistryNavEntry[][]): RegistryNavEntry[] {
  const seen = new Set<string>();
  const merged: RegistryNavEntry[] = [];
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
 * Compact queue entries for a registry desk's sidebar badges. One roundtrip on
 * purpose: the rail polls this on a short interval, and every extra query costs
 * a full pooler roundtrip. Scope mirrors the pages that render each queue, so a
 * dot only lights for data this desk can actually open.
 */
export async function getRegistryNavQueues(
  userId: string,
  desk: RegistryDesk,
): Promise<RegistryNavQueues> {
  const { grades } = DESK_SCOPE[desk];
  // Both lists come from the trusted band constants above; inlining them keeps
  // the enum comparisons (`GradeLevel`, `Sf10Desk`) typed exactly as the schema
  // declares them instead of comparing an enum column to a text parameter.
  const gradeList = Prisma.raw(grades.map((g) => `'${g}'`).join(", "));
  const deskLiteral = Prisma.raw(`'${desk}'`);

  const rows = await prisma.$queryRaw<{ q: string; id: string; v: string }[]>(
    Prisma.sql`
      WITH access AS (
        SELECT r.id,
               r.xmin::text || ':' ||
               COALESCE(array_length(r."approvedLrns", 1), 0)::text || ':' ||
               COALESCE(array_length(r."reportedMissingLrns", 1), 0)::text AS v
        FROM "AdviserSf10AccessRequest" r
        WHERE r."gradeLevel" IN (${gradeList})
      ),
      sf10 AS (
        SELECT 'lrn:' || r.lrn AS id,
               r.xmin::text || ':' || COUNT(v.id)::text || ':' ||
               COALESCE(MAX(v.xmin::text::bigint)::text, '0') AS v
        FROM "Sf10Record" r
        LEFT JOIN "Sf10RecordVersion" v ON v."sf10RecordId" = r.id
        WHERE r.desk = ${deskLiteral}
        GROUP BY r.id, r.lrn, r.xmin
      ),
      finals AS (
        SELECT 'section:' || COALESCE(p."sectionId", ro."sectionId", 'none') AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(f.xmin::text::bigint)::text, '0') AS v
        FROM "FinalGrade" f
        LEFT JOIN "StudentProfile" p ON p."userId" = f."studentId"
        LEFT JOIN "StudentRoster" ro ON ro.id = f."rosterId"
        WHERE p."gradeLevel" IN (${gradeList})
           OR ro."gradeLevel" IN (${gradeList})
        GROUP BY 1
      ),
      subjects AS (
        SELECT s.id, s.xmin::text AS v
        FROM "Subject" s
        WHERE s."gradeLevel" IN (${gradeList})
      ),
      notifications AS (
        SELECT id, xmin::text AS v
        FROM "Notification"
        WHERE "userId" = ${userId} AND "isRead" = false
      )
      SELECT 'overview'::text AS q, id, v FROM access
      UNION ALL SELECT 'overview', id, v FROM sf10
      UNION ALL SELECT 'overview', id, v FROM finals
      UNION ALL SELECT 'overview', id, v FROM subjects
      UNION ALL SELECT 'overview', id, v FROM notifications
      UNION ALL SELECT 'finalGrades', id, v FROM finals
      UNION ALL SELECT 'adviserAccess', id, v FROM access
      UNION ALL SELECT 'sf10', id, v FROM sf10
      UNION ALL SELECT 'subjects', id, v FROM subjects
    `,
  );

  const queues: RegistryNavQueues = {
    overview: [],
    finalGrades: [],
    adviserAccess: [],
    sf10: [],
    subjects: [],
  };
  for (const row of rows) {
    const key = row.q as keyof RegistryNavQueues;
    if (!(key in queues)) continue;
    queues[key].push({ id: row.id, v: row.v });
  }

  return {
    ...queues,
    overview: mergeEntries(queues.overview),
    finalGrades: mergeEntries(queues.finalGrades),
    adviserAccess: mergeEntries(queues.adviserAccess),
    sf10: mergeEntries(queues.sf10),
    subjects: mergeEntries(queues.subjects),
  };
}

/** Record-keeper (G7–10) desk queues. */
export function getRecordKeeperNavQueues(userId: string): Promise<RegistryNavQueues> {
  return getRegistryNavQueues(userId, "record_keeper");
}

/** Registrar (G11–12) desk queues. */
export function getRegistrarNavQueues(userId: string): Promise<RegistryNavQueues> {
  return getRegistryNavQueues(userId, "registrar");
}
