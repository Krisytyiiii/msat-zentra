import { prisma } from "../../lib/prisma.js";
import { activeScheduleConfigForTerm } from "../../lib/schedule-config.js";
import {
  SCHEDULE_CONFIG_DEFAULTS,
  toScheduleConfig,
} from "../../modules/teacher/teacher.labels.js";
import type { TeacherContext } from "./teacher.types.js";

const classPairSelect = {
  subjectId: true,
  sectionId: true,
  subject: { select: { name: true, code: true } },
  section: { select: { name: true, gradeLevel: true } },
} as const;

/** Statuses a teacher can see: published (APPROVED) grids only. */
const VISIBLE_STATUSES = ["APPROVED", "SUBMITTED"] as const;

/**
 * The teacher's timetable-linked subject/section pairs, deduped. Within one
 * school year the classes are shared by all three terms, so when the selected
 * term has no entries yet the most recent earlier term's pairs stand in —
 * grading and lock-grades must list the same classes as /teacher/classes.
 */
export async function resolveTeacherClassPairs(teacherId: string, termId: string) {
  const read = (t: string) =>
    prisma.sectionTimetableEntry.findMany({
      where: {
        termId: t,
        status: { in: [...VISIBLE_STATUSES] },
        teacherName: { userId: teacherId },
      },
      select: classPairSelect,
      orderBy: [{ section: { name: "asc" } }, { subject: { name: "asc" } }],
    });

  let rows = await read(termId);
  if (rows.length === 0) {
    const current = await prisma.term.findUnique({
      where: { id: termId },
      select: { termNumber: true, schoolYearId: true },
    });
    if (current && current.termNumber > 1) {
      const prior = await prisma.term.findFirst({
        where: {
          schoolYearId: current.schoolYearId,
          termNumber: { lt: current.termNumber },
          timetableEntries: { some: { teacherName: { userId: teacherId } } },
        },
        orderBy: { termNumber: "desc" },
        select: { id: true },
      });
      if (prior) rows = await read(prior.id);
    }
  }
  return [...new Map(rows.map((r) => [`${r.subjectId}|${r.sectionId}`, r])).values()];
}

async function resolveLoadTermId(teacherId: string, termId: string) {
  const own = await prisma.sectionTimetableEntry.count({
    where: { termId, teacherName: { userId: teacherId } },
  });
  if (own > 0) return termId;
  const current = await prisma.term.findUnique({
    where: { id: termId },
    select: { termNumber: true, schoolYearId: true },
  });
  if (!current || current.termNumber <= 1) return termId;
  const prior = await prisma.term.findFirst({
    where: {
      schoolYearId: current.schoolYearId,
      termNumber: { lt: current.termNumber },
      timetableEntries: { some: { teacherName: { userId: teacherId } } },
    },
    orderBy: { termNumber: "desc" },
    select: { id: true },
  });
  return prior?.id ?? termId;
}

/**
 * The teacher's published teaching load as data only — no grid, no editor.
 * Attendance uses the meetup days + shared school-day shape to know when a
 * class is live; the absence sweep reads the same `SectionTimetableEntry` rows
 * server-side. The timetable editor lives on the administrator desk.
 */
export async function getTeacherLoad(ctx: TeacherContext) {
  const termId = ctx.termId;
  const empty = {
    classes: [],
    meetupDays: {} as Record<string, number[]>,
    slots: [],
    config: SCHEDULE_CONFIG_DEFAULTS,
  };
  if (!termId) return empty;

  const loadTermId = await resolveLoadTermId(ctx.userId, termId);
  const [classes, slots, configRow] = await Promise.all([
    resolveTeacherClassPairs(ctx.userId, termId),
    prisma.sectionTimetableEntry.findMany({
      where: {
        termId: loadTermId,
        status: { in: [...VISIBLE_STATUSES] },
        teacherName: { userId: ctx.userId },
      },
      select: {
        day: true,
        period: true,
        status: true,
        subjectId: true,
        sectionId: true,
        subject: { select: { id: true, name: true, code: true } },
        section: { select: { id: true, name: true, gradeLevel: true } },
      },
      orderBy: [{ day: "asc" }, { period: "asc" }],
    }),
    activeScheduleConfigForTerm(loadTermId),
  ]);

  const meetupDays: Record<string, number[]> = {};
  for (const slot of slots) {
    const key = `${slot.subjectId}:${slot.sectionId}`;
    const days = meetupDays[key] ?? [];
    if (!days.includes(slot.day)) days.push(slot.day);
    meetupDays[key] = days;
  }
  for (const key of Object.keys(meetupDays)) {
    meetupDays[key].sort((a, b) => a - b);
  }

  return {
    classes: classes.map((c) => ({
      subjectId: c.subjectId,
      subjectName: c.subject.name,
      subjectCode: c.subject.code,
      sectionId: c.sectionId,
      sectionName: c.section.name,
      gradeLevel: c.section.gradeLevel,
    })),
    meetupDays,
    slots: slots.map((s) => ({
      day: s.day,
      period: s.period,
      status: s.status,
      subject: s.subject,
      section: s.section,
    })),
    config: configRow ? toScheduleConfig(configRow) : SCHEDULE_CONFIG_DEFAULTS,
  };
}
