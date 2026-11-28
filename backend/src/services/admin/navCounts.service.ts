import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

/** One page version: a compact string that changes whenever the page's data does. */
export interface AdminNavEntry {
  id: string;
  /**
   * `count:max(xmin)` of the rows behind the page — Postgres bumps a row's
   * `xmin` on every UPDATE without needing a schema column, so the sidebar dot
   * can tell "this changed" from "nothing happened" without depending on a
   * notification being fanned out.
   */
  v: string;
}

/**
 * One list per administrator sidebar page. Kept in sync with `ROUTE_KEYS` in
 * `frontend/src/services/admin/navCounts.service.ts`.
 */
export interface AdminNavQueues {
  /** Console dashboard: every system queue plus the notification feed. */
  overview: AdminNavEntry[];
  /** Schedule board index (all schedule panels merged). */
  schedule: AdminNavEntry[];
  /** Timetable grid for the selected term. */
  timetable: AdminNavEntry[];
  sections: AdminNavEntry[];
  subjects: AdminNavEntry[];
  teachers: AdminNavEntry[];
  /** School-day config (periods, lunch, recesses). */
  configure: AdminNavEntry[];
  /** School years and their terms. */
  schoolYear: AdminNavEntry[];
  /** Draft timetables waiting to be published. */
  publish: AdminNavEntry[];
  noClassDays: AdminNavEntry[];
  users: AdminNavEntry[];
  pending: AdminNavEntry[];
  audit: AdminNavEntry[];
  /** System-wide notification feed (the console bell). */
  notifications: AdminNavEntry[];
}

function mergeEntries(...groups: AdminNavEntry[][]): AdminNavEntry[] {
  const seen = new Set<string>();
  const merged: AdminNavEntry[] = [];
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
 * Compact per-page versions for the administrator sidebar dots. One roundtrip
 * on purpose: the rail polls this while the console is visible and each extra
 * query is a full pooler round trip. Every branch aggregates to a single row
 * (`COUNT:MAX(xmin)`) instead of one entry per record — the console only needs
 * "this page's data moved", not the exact queue size.
 */
export async function getAdminNavQueues(): Promise<AdminNavQueues> {
  const rows = await prisma.$queryRaw<{ q: string; id: string; v: string }[]>(
    Prisma.sql`
      WITH users AS (
        SELECT 'users'::text AS q, 'users'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "User"
      ),
      pending AS (
        SELECT 'pending'::text AS q, 'pending'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(version)::text, '0') AS v
        FROM (
          SELECT xmin::text::bigint AS version
          FROM "User"
          WHERE status = 'pending'
          UNION ALL
          -- Guardian learner link requests waiting on the same approval desk.
          SELECT xmin::text::bigint AS version
          FROM "ParentStudentLink"
          WHERE "approvedBy" IS NULL
        ) AS pending_rows
      ),
      audit AS (
        SELECT 'audit'::text AS q, 'audit'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "AuditLog"
      ),
      no_class_days AS (
        SELECT 'noClassDays'::text AS q, 'no-class-days'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "NoClassDay"
      ),
      sections AS (
        SELECT 'sections'::text AS q, 'sections'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "Section"
      ),
      subjects AS (
        SELECT 'subjects'::text AS q, 'subjects'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "Subject"
      ),
      teachers AS (
        SELECT 'teachers'::text AS q, 'teachers'::text AS id,
               (SELECT COUNT(*)::text || ':' ||
                       COALESCE(MAX(xmin::text::bigint)::text, '0')
                FROM "TeacherName") || ':' ||
               (SELECT COUNT(*)::text || ':' ||
                       COALESCE(MAX(xmin::text::bigint)::text, '0')
                FROM "TeacherSubjectAssignment") AS v
      ),
      timetable AS (
        SELECT 'timetable'::text AS q, 'timetable'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "SectionTimetableEntry"
      ),
      configure AS (
        SELECT 'configure'::text AS q, 'configure'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "ScheduleConfig"
      ),
      school_year AS (
        SELECT 'schoolYear'::text AS q, 'school-year'::text AS id,
               (SELECT COUNT(*)::text || ':' ||
                       COALESCE(MAX(xmin::text::bigint)::text, '0')
                FROM "SchoolYear") || ':' ||
               (SELECT COUNT(*)::text || ':' ||
                       COALESCE(MAX(xmin::text::bigint)::text, '0')
                FROM "Term") AS v
      ),
      notifications AS (
        SELECT 'notifications'::text AS q, 'notifications'::text AS id,
               COUNT(*)::text || ':' ||
               COALESCE(MAX(xmin::text::bigint)::text, '0') AS v
        FROM "Notification"
      )
      SELECT q, id, v FROM users
      UNION ALL SELECT q, id, v FROM pending
      UNION ALL SELECT q, id, v FROM audit
      UNION ALL SELECT q, id, v FROM no_class_days
      UNION ALL SELECT q, id, v FROM sections
      UNION ALL SELECT q, id, v FROM subjects
      UNION ALL SELECT q, id, v FROM teachers
      UNION ALL SELECT q, id, v FROM timetable
      UNION ALL SELECT q, id, v FROM configure
      UNION ALL SELECT q, id, v FROM school_year
      UNION ALL SELECT q, id, v FROM notifications
    `,
  );

  const queues: AdminNavQueues = {
    overview: [],
    schedule: [],
    timetable: [],
    sections: [],
    subjects: [],
    teachers: [],
    configure: [],
    schoolYear: [],
    publish: [],
    noClassDays: [],
    users: [],
    pending: [],
    audit: [],
    notifications: [],
  };
  for (const row of rows) {
    const key = row.q as keyof AdminNavQueues;
    if (!(key in queues)) continue;
    queues[key].push({ id: row.id, v: row.v });
  }

  const scheduleEntries = mergeEntries(
    queues.sections,
    queues.subjects,
    queues.teachers,
    queues.timetable,
    queues.configure,
    queues.schoolYear,
  );

  return {
    ...queues,
    // The board index renders the same panels the dedicated pages do.
    schedule: scheduleEntries,
    // Publishing watches the draft timetable.
    publish: queues.timetable,
    // Dashboard aggregates every queue it surfaces, plus the bell feed.
    overview: mergeEntries(
      queues.users,
      queues.pending,
      queues.audit,
      queues.noClassDays,
      scheduleEntries,
      queues.notifications,
    ),
  };
}
