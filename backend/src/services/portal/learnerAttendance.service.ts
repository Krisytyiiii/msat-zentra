import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { learnerSectionForTerm, type PortalTerm } from "../../lib/portalAccess.js";
import { phTodayKey } from "../attendance.js";
import {
  blocksPeriod,
  dateKeyOf,
  noClassContextForTerm,
} from "../noClass.js";

export type AttendanceHeatState =
  | "present"
  | "absent"
  | "late"
  | "excused"
  | "missing"
  | "upcoming"
  | "no-class"
  | "none";

const STATUS_PRIORITY: Record<string, number> = {
  absent: 4,
  late: 3,
  present: 2,
  excused: 1,
};

function aggregateStatus(statuses: string[]): AttendanceHeatState {
  let best: string | null = null;
  let bestRank = 0;
  for (const status of statuses) {
    const rank = STATUS_PRIORITY[status] ?? 0;
    if (rank > bestRank) {
      best = status;
      bestRank = rank;
    }
  }
  return (best as AttendanceHeatState | null) ?? "missing";
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * One subject's attendance record for the signed-in learner: summary counts,
 * the dated log, and a term heatmap of scheduled meetups.
 *
 * Heatmap states per scheduled school day:
 * - the recorded status when a row exists (absent beats late beats present),
 * - `no-class` when the administrator cancelled that period,
 * - `upcoming` for future dates,
 * - `missing` for a past scheduled day with no mark,
 * - `none` for days the subject does not meet.
 */
export async function getLearnerSubjectAttendance(
  studentId: string,
  subjectId: string,
  term: PortalTerm,
) {
  const sectionId = await learnerSectionForTerm(studentId, term);

  const [subject, section, entries, rows, profile] = await Promise.all([
    prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, code: true, category: true },
    }),
    sectionId
      ? prisma.section.findUnique({
          where: { id: sectionId },
          select: { id: true, name: true, gradeLevel: true },
        })
      : Promise.resolve(null),
    sectionId
      ? prisma.sectionTimetableEntry.findMany({
          where: { sectionId, subjectId, termId: term.id },
          select: { day: true, period: true },
        })
      : Promise.resolve([]),
    prisma.attendanceRecord.findMany({
      where: { studentId, subjectId, termId: term.id },
      orderBy: [{ date: "desc" }, { slot: "desc" }],
      select: { id: true, date: true, slot: true, session: true, status: true },
    }),
    prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { lrn: true },
    }),
  ]);

  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", "That subject is not part of your class load");
  }
  // A learner may open a class that has a grid slot or recorded marks; nothing
  // else belongs to their load.
  if (entries.length === 0 && rows.length === 0) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", "That subject is not part of your class load");
  }

  const counts = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status as keyof typeof counts] += 1;
    }
    counts.total += 1;
  }

  const days = new Set(entries.map((entry) => entry.day));
  const periods = [...new Set(entries.map((entry) => entry.period))];
  // Legacy sheets without a published grid still know their weekdays from the
  // recorded rows.
  if (days.size === 0) {
    for (const row of rows) {
      days.add(new Date(dateKeyOf(row.date) + "T00:00:00Z").getUTCDay());
    }
  }
  if (periods.length === 0) periods.push(0);

  const rowsByDay = new Map<string, string[]>();
  for (const row of rows) {
    const key = dateKeyOf(row.date);
    const list = rowsByDay.get(key) ?? [];
    list.push(row.status);
    rowsByDay.set(key, list);
  }

  const todayKey = phTodayKey();
  // Days before the learner's roster row existed are not their meetups: a
  // mid-year enrolee must not see a wall of "missing" squares for the weeks
  // before they joined.
  const roster = profile
    ? await prisma.studentRoster.findUnique({
        where: {
          lrn_schoolYearId: { lrn: profile.lrn, schoolYearId: term.schoolYearId },
        },
        select: { createdAt: true },
      })
    : null;
  const enrolledKey = roster ? dateKeyOf(roster.createdAt) : null;
  const startKey = term.startDate?.slice(0, 10) ?? null;
  const endKey = term.endDate?.slice(0, 10) ?? null;
  let heatmapDays: { date: string; state: AttendanceHeatState }[] = [];
  if (sectionId && startKey && endKey && startKey <= endKey) {
    const { map, config } = await noClassContextForTerm(term.id);
    const cursor = new Date(`${startKey}T00:00:00Z`);
    const end = new Date(`${endKey}T00:00:00Z`);
    // Backstop: never render more than a year even if the term is misconfigured.
    for (let guard = 0; cursor <= end && guard < 370; guard += 1) {
      const key = dayKey(cursor);
      const weekday = cursor.getUTCDay();
      const recorded = rowsByDay.get(key);
      let state: AttendanceHeatState;
      if (recorded && recorded.length > 0) {
        state = aggregateStatus(recorded);
      } else if (enrolledKey && key < enrolledKey) {
        state = "none";
      } else if (!days.has(weekday)) {
        state = "none";
      } else if (
        periods.some((period) => blocksPeriod(map.get(key), config, period))
      ) {
        state = "no-class";
      } else if (key > todayKey) {
        state = "upcoming";
      } else {
        state = "missing";
      }
      heatmapDays.push({ date: key, state });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    heatmapDays = [...rowsByDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, statuses]) => ({ date, state: aggregateStatus(statuses) }));
  }

  return {
    subject: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      category: subject.category,
    },
    section: section
      ? { id: section.id, name: section.name, gradeLevel: section.gradeLevel }
      : null,
    term,
    summary: {
      ...counts,
      hasMarks: counts.total > 0,
      rate: counts.total === 0 ? 0 : counts.present / counts.total,
      isRisk: counts.total > 0 && counts.present / counts.total < 0.8,
    },
    log: rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString(),
      slot: row.slot,
      session: row.session,
      status: row.status,
    })),
    heatmap: {
      startDate: startKey,
      endDate: endKey,
      today: todayKey,
      days: heatmapDays,
    },
  };
}
