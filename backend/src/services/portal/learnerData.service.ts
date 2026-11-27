import { prisma } from "../../lib/prisma.js";
import type { PortalLearner, PortalTerm } from "../../lib/portalAccess.js";
import {
  learnerSectionForTerm,
  learnerSectionForTermId,
} from "../../lib/portalAccess.js";
import { activeScheduleConfigForTerm } from "../../lib/schedule-config.js";
import { isFinalLock } from "../../lib/grades.js";
import {
  computeAttendanceRate,
  learnerSubjectAverageAttendance,
} from "../attendance.rate.service.js";
import { listStudentModules } from "../student/modules.service.js";
import {
  SCHEDULE_CONFIG_DEFAULTS,
  toScheduleConfig,
} from "../../modules/teacher/teacher.labels.js";
import type { ModuleStatus } from "../../modules/teacher/advisory-modules.schemas.js";

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Learner summary for the portal header (own record only). */
export async function getLearnerMe(studentId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      userId: true,
      lrn: true,
      gradeLevel: true,
      mascot: true,
      photoUrl: true,
      birthdate: true,
      gender: true,
      address: true,
      user: { select: { fullName: true, email: true, contactNumber: true } },
      section: {
        select: {
          id: true,
          name: true,
          adviser: { select: { fullName: true } },
        },
      },
    },
  });
}

export async function getLearnerGrades(studentId: string, term: PortalTerm) {
  const rows = await prisma.finalGrade.findMany({
    where: { studentId, termId: term.id },
    orderBy: { subject: { name: "asc" } },
    select: {
      id: true,
      computedAverage: true,
      transmutedGrade: true,
      remarks: true,
      lockStatus: true,
      finalizedAt: true,
      adviserApprovedAt: true,
      subject: { select: { id: true, name: true, code: true } },
    },
  });
  return {
    term,
    grades: rows.map((g) => ({
      id: g.id,
      subjectId: g.subject.id,
      subjectName: g.subject.name,
      subjectCode: g.subject.code,
      computedAverage: g.computedAverage,
      transmutedGrade: g.transmutedGrade,
      remarks: g.remarks,
      lockStatus: g.lockStatus,
      // Only a locked final is official; unlocked rows are still in progress.
      isFinal: isFinalLock(g.lockStatus),
      finalizedAt: iso(g.finalizedAt),
      adviserApprovedAt: iso(g.adviserApprovedAt),
    })),
  };
}

export async function getLearnerAttendance(studentId: string, term: PortalTerm) {
  const sectionId = await learnerSectionForTerm(studentId, term);
  const [summary, bySubject, recent, subjectAverage, section] = await Promise.all([
    computeAttendanceRate(studentId, term.id),
    prisma.attendanceRecord.groupBy({
      by: ["subjectId", "status"],
      where: { studentId, termId: term.id, NOT: { subjectId: null } },
      _count: { _all: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { studentId, termId: term.id },
      orderBy: [{ date: "desc" }, { slot: "desc" }],
      take: 30,
      select: {
        id: true,
        date: true,
        status: true,
        session: true,
        subject: { select: { name: true, code: true } },
      },
    }),
    learnerSubjectAverageAttendance({ studentId }, sectionId, term.id),
    sectionId
      ? prisma.section.findUnique({
          where: { id: sectionId },
          select: { id: true, name: true, gradeLevel: true },
        })
      : Promise.resolve(null),
  ]);

  const subjectIds = [...new Set(bySubject.map((r) => r.subjectId).filter((v): v is string => !!v))];
  const subjects = subjectIds.length
    ? await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const grouped = new Map<string, { present: number; absent: number; late: number; excused: number; total: number }>();
  for (const row of bySubject) {
    if (!row.subjectId) continue;
    const cell = grouped.get(row.subjectId) ?? { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
    cell[row.status] += row._count._all;
    cell.total += row._count._all;
    grouped.set(row.subjectId, cell);
  }

  // The portal shows the same term presence the adviser boards and the risk
  // engine use (mean of per-subject present rates). Legacy AM/PM sections with
  // no per-subject meetups keep the recorded-rows rate.
  const rate = subjectAverage?.average ?? summary.rate;
  return {
    term,
    sectionId,
    sectionName: section?.name ?? null,
    summary: {
      rate,
      recordedRate: summary.rate,
      // False until the term has a recorded meetup — the UI shows "No marks"
      // instead of a fabricated 100%.
      hasMarks: summary.total > 0,
      present: summary.present,
      absent: summary.absent,
      late: summary.late,
      excused: summary.excused,
      total: summary.total,
      isRisk: rate < 0.8,
    },
    bySubject: [...grouped.entries()].map(([subjectId, c]) => ({
      subjectId,
      subjectName: subjectById.get(subjectId)?.name ?? "Subject",
      subjectCode: subjectById.get(subjectId)?.code ?? "",
      ...c,
      rate: c.total === 0 ? 1 : c.present / c.total,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      status: r.status,
      session: r.session,
      subjectName: r.subject?.name ?? null,
      subjectCode: r.subject?.code ?? null,
    })),
  };
}

export async function getLearnerSchedule(studentId: string, term: PortalTerm) {
  const sectionId = await learnerSectionForTerm(studentId, term);
  if (!sectionId) {
    return {
      term,
      sectionId: null,
      config: SCHEDULE_CONFIG_DEFAULTS,
      slots: [],
      classes: [],
    };
  }
  const [rows, configRow, section] = await Promise.all([
    prisma.sectionTimetableEntry.findMany({
      // Learners only ever see the published grid — drafts and submitted
      // edits stay on the administrator desk until they are released.
      where: { sectionId, termId: term.id, status: "APPROVED" },
      orderBy: [{ day: "asc" }, { period: "asc" }],
      select: {
        id: true,
        day: true,
        period: true,
        status: true,
        subjectId: true,
        subject: { select: { name: true, code: true } },
        teacherName: { select: { name: true } },
      },
    }),
    activeScheduleConfigForTerm(term.id),
    prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, name: true, gradeLevel: true },
    }),
  ]);

  const classes = new Map<
    string,
    {
      subjectId: string;
      subjectName: string;
      subjectCode: string;
      teacherName: string | null;
      days: number[];
      periods: number[];
    }
  >();
  for (const r of rows) {
    const cell = classes.get(r.subjectId) ?? {
      subjectId: r.subjectId,
      subjectName: r.subject.name,
      subjectCode: r.subject.code,
      teacherName: r.teacherName?.name ?? null,
      days: [],
      periods: [],
    };
    if (!cell.days.includes(r.day)) cell.days.push(r.day);
    if (!cell.periods.includes(r.period)) cell.periods.push(r.period);
    classes.set(r.subjectId, cell);
  }

  return {
    term,
    sectionId,
    sectionName: section?.name ?? null,
    config: configRow ? toScheduleConfig(configRow) : SCHEDULE_CONFIG_DEFAULTS,
    slots: rows.map((r) => ({
      id: r.id,
      day: r.day,
      period: r.period,
      status: r.status,
      subjectId: r.subjectId,
      subjectName: r.subject.name,
      subjectCode: r.subject.code,
      teacherName: r.teacherName?.name ?? null,
    })),
    classes: [...classes.values()].map((c) => ({
      ...c,
      days: c.days.sort((a, b) => a - b),
      periods: c.periods.sort((a, b) => a - b),
    })),
  };
}

export async function getLearnerModules(
  studentId: string,
  termId: string,
  query: { page: number; pageSize: number; status?: ModuleStatus },
) {
  const sectionId = await learnerSectionForTermId(studentId, termId);
  return listStudentModules({ userId: studentId, termId, sectionId }, query);
}

export interface PortalSessionRow {
  sessionId: string;
  sourceTable: "referrals" | "interventions" | "adm_profiles";
  track: string;
  sessionType: string;
  scheduledAt: string;
  venue: string;
  status: string;
}

/** Scheduled counseling sessions + ADM parent meetings for the learner. */
export async function getUpcomingSessions(studentId: string): Promise<PortalSessionRow[]> {
  const [sessions, meetings] = await Promise.all([
    prisma.counselingSession.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { gte: new Date() },
        OR: [{ referral: { studentId } }, { intervention: { studentId } }],
      },
      orderBy: { scheduledAt: "asc" },
      take: 20,
      select: {
        id: true,
        sessionType: true,
        scheduledAt: true,
        venue: true,
        status: true,
        referralId: true,
        interventionId: true,
      },
    }),
    prisma.admParentMeeting.findMany({
      where: {
        attended: false,
        meetingDatetime: { gte: new Date() },
        OR: [{ referral: { studentId } }, { admLearnerProfile: { studentId } }],
      },
      orderBy: { meetingDatetime: "asc" },
      take: 20,
      select: { id: true, meetingDatetime: true, venue: true },
    }),
  ]);

  const out: PortalSessionRow[] = sessions.map((s) => ({
    sessionId: s.id,
    sourceTable: s.referralId ? "referrals" : "interventions",
    track: s.referralId ? "Counseling" : "Follow-up",
    sessionType: s.sessionType,
    scheduledAt: s.scheduledAt.toISOString(),
    venue: s.venue ?? "",
    status: s.status,
  }));
  for (const m of meetings) {
    out.push({
      sessionId: m.id,
      sourceTable: "adm_profiles",
      track: "ADM",
      sessionType: "parent_conference",
      scheduledAt: m.meetingDatetime.toISOString(),
      venue: m.venue,
      status: "scheduled",
    });
  }
  return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** Module counts for the portal home snapshot, scoped to the shown term. */
export async function getModuleCounts(studentId: string, termId: string) {
  const sectionId = await learnerSectionForTermId(studentId, termId);
  if (!sectionId) return { all: 0, submitted: 0, pending: 0, overdue: 0 };
  const modules = await prisma.advisoryModule.findMany({
    where: { sectionId, termId },
    select: { id: true, kind: true, dueDate: true },
  });
  if (modules.length === 0) return { all: 0, submitted: 0, pending: 0, overdue: 0 };
  const submissions = await prisma.advisoryModuleSubmission.findMany({
    where: { studentId, moduleId: { in: modules.map((m) => m.id) }, submitted: true },
    select: { moduleId: true },
  });
  const submitted = new Set(submissions.map((s) => s.moduleId));
  let pending = 0;
  let overdue = 0;
  for (const m of modules) {
    if (m.kind !== "adm" || submitted.has(m.id)) continue;
    if (m.dueDate && m.dueDate.getTime() < Date.now()) overdue++;
    else pending++;
  }
  return { all: modules.length, submitted: submitted.size, pending, overdue };
}

export async function getLearnerHome(
  studentId: string,
  learner: PortalLearner,
  term: PortalTerm,
) {
  const [attendance, grades, schedule, sessions, moduleCounts] = await Promise.all([
    getLearnerAttendance(studentId, term),
    getLearnerGrades(studentId, term),
    getLearnerSchedule(studentId, term),
    getUpcomingSessions(studentId),
    getModuleCounts(studentId, term.id),
  ]);

  // JS getDay(): 0=Sun … 6=Sat. Timetable days are 1=Mon … 5=Fri.
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", weekday: "short",
  }).format(new Date());
  const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const todaySlots = schedule.slots.filter((s) => s.day === today);

  // Official average: locked finals only. An unlocked term shows "in progress"
  // instead of a number that may still change.
  const graded = grades.grades.filter(
    (g) => g.isFinal && g.transmutedGrade != null,
  );
  const average =
    graded.length > 0
      ? graded.reduce((sum, g) => sum + g.transmutedGrade!, 0) / graded.length
      : null;

  return {
    learner,
    term,
    todaySlots,
    config: schedule.config,
    attendance: attendance.summary,
    grades: grades.grades,
    average: average == null ? null : Math.round(average * 100) / 100,
    moduleCounts,
    upcomingSessions: sessions.slice(0, 5),
  };
}
