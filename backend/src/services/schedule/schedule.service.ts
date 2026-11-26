import { randomInt } from "crypto";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { fanoutNotification, fanoutToRole } from "../../lib/notify.js";
import { invalidateTermScopeCache } from "../../lib/termScope.js";
import { activeScheduleConfigForYear, activeScheduleConfigForTerm } from "../../lib/schedule-config.js";
import type { ScopedContext } from "../../lib/request-context.js";
import {
  SCHEDULE_CONFIG_DEFAULTS,
  resolveWorkloadCaps,
  toScheduleConfig,
} from "../../modules/teacher/teacher.labels.js";
import { mintUniqueAdviserCode } from "../../modules/academics/academics-shared.js";

/**
 * Timetable configuration is owned by the administrator desk. These services
 * used to live under `services/teacher/*` and were gated on a Master Teacher
 * seat; the seat model is retired, so every function here takes a plain
 * request context and covers grades 7–12.
 */
export type ScheduleContext = ScopedContext;

export interface ScheduleQueryOpts {
  summary?: boolean;
  sectionId?: string;
  gradeLevel?: string;
}

export interface ScheduleConfigInput {
  startTime: string;
  periodMins: number;
  lunch: { afterPeriod: number; mins: number };
  morningRecess: { enabled: boolean; afterPeriod: number; mins: number };
  afternoonRecess: { enabled: boolean; afterPeriod: number; mins: number };
}

export interface WriteEntryInput {
  sectionId: string;
  subjectId: string;
  teacherNameId: string;
  day: number;
  period: number;
}

const ALL_GRADES = ["G7", "G8", "G9", "G10", "G11", "G12"] as const;

/**
 * Every row that points at a section. A section with any of them is locked
 * from deletion — the desk shows the same counts the delete guard checks.
 */
const SECTION_LINK_COUNTS = {
  students: true,
  rosterEntries: true,
  attendanceRecords: true,
  anecdotalRecords: true,
  teacherAssignments: true,
  gradeFlags: true,
  timetableEntries: true,
  assessments: true,
  advisoryModules: true,
  sf10AccessRequests: true,
} as const;

/** Every row that points at a term — a school year inherits their totals. */
const TERM_LINK_COUNTS = {
  gradeComponents: true,
  finalGrades: true,
  attendanceRecords: true,
  anecdotalRecords: true,
  referrals: true,
  interventions: true,
  healthRecords: true,
  homeVisitations: true,
  admProfiles: true,
  riskSnapshots: true,
  reportSnapshots: true,
  teacherAssignments: true,
  gradeFlags: true,
  timetableEntries: true,
  termGrants: true,
  rosterEnlistments: true,
  rosterConfirmations: true,
  advisoryModules: true,
} as const;

interface SectionLinks {
  learners: number;
  records: number;
}

function sectionLinksOf(counts: Record<keyof typeof SECTION_LINK_COUNTS, number>): SectionLinks {
  return {
    learners: counts.students + counts.rosterEntries,
    records:
      counts.attendanceRecords +
      counts.anecdotalRecords +
      counts.teacherAssignments +
      counts.gradeFlags +
      counts.timetableEntries +
      counts.assessments +
      counts.advisoryModules +
      counts.sf10AccessRequests,
  };
}

function sectionLockSuffix(links: SectionLinks): string {
  const parts: string[] = [];
  if (links.learners > 0) parts.push(`${links.learners} learner${links.learners === 1 ? "" : "s"}`);
  if (links.records > 0) parts.push(`${links.records} record${links.records === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

interface SchoolYearLinks {
  sections: number;
  learners: number;
  records: number;
}

function termLinkTotal(counts: Record<keyof typeof TERM_LINK_COUNTS, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

function requireTermId(ctx: ScheduleContext) {
  if (!ctx.termId) {
    throw new AppError(400, "NO_ACTIVE_TERM", "No active term selected");
  }
  return ctx.termId;
}

async function requireSchoolYearId(ctx: ScheduleContext) {
  if (ctx.schoolYearId) return ctx.schoolYearId;
  if (ctx.termId) {
    const term = await prisma.term.findUnique({
      where: { id: ctx.termId },
      select: { schoolYearId: true },
    });
    if (term) return term.schoolYearId;
  }
  throw new AppError(400, "NO_ACTIVE_TERM", "No active term selected");
}

/** Audit + notify the section's teachers and the principal desk. */
async function announce(
  ctx: ScheduleContext,
  reason: string,
  sectionId?: string | null,
) {
  try {
    const termId = ctx.termId;
    const section = sectionId
      ? await prisma.section.findUnique({
          where: { id: sectionId },
          select: { name: true, adviserId: true },
        })
      : null;
    const label = section?.name ?? "the timetable";
    const message = `${reason} (${label}).`;
    const ids = new Set<string>();
    if (sectionId && termId) {
      const [assignments, timetableTeachers] = await Promise.all([
        prisma.teacherSubjectAssignment.findMany({ where: { sectionId, termId }, select: { teacherId: true } }),
        prisma.sectionTimetableEntry.findMany({
          where: { sectionId, termId },
          select: { teacherName: { select: { userId: true } } },
        }),
      ]);
      for (const a of assignments) ids.add(a.teacherId);
      for (const t of timetableTeachers) {
        const uid = t.teacherName?.userId;
        if (uid) ids.add(uid);
      }
      if (section?.adviserId) ids.add(section.adviserId);
    }
    ids.delete(ctx.userId);
    await Promise.all(
      [...ids].map((userId) =>
        fanoutNotification({
          userId,
          sourceTable: "section_timetable_entries",
          action: "schedule_update",
          sourceId: sectionId ?? termId ?? undefined,
          message,
        }),
      ),
    );
    void fanoutToRole("principal", {
      sourceTable: "section_timetable_entries",
      action: "schedule_update",
      sourceId: sectionId ?? termId ?? undefined,
      excludeUserId: ctx.userId,
      message,
    });
  } catch {
    /* notification fanout never blocks a schedule write */
  }
}

/** Resolve a section and (optionally) assert the subject belongs to its grade. */
async function resolveTarget(sectionId: string, subjectId: string | null) {
  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) {
    throw new AppError(404, "SECTION_NOT_FOUND", "Section not found");
  }
  if (!ALL_GRADES.includes(section.gradeLevel as (typeof ALL_GRADES)[number])) {
    throw new AppError(403, "GRADE_BAND_NOT_ALLOWED", "Timetables are only available for grades 7–12");
  }
  if (subjectId) {
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new AppError(404, "SUBJECT_NOT_FOUND", "Subject not found");
    }
    if (subject.gradeLevel !== section.gradeLevel) {
      throw new AppError(403, "GRADE_MISMATCH", "The subject must belong to the section's grade level");
    }
  }
  return section;
}

/** Drop assignment rows no timetable slot supports any more. */
async function cleanupOrphanAssignments(termId: string, pairs: { sectionId: string; subjectId: string }[]) {
  if (pairs.length === 0) return;
  const remaining = await prisma.sectionTimetableEntry.groupBy({
    by: ["sectionId", "subjectId"],
    where: { termId, OR: pairs.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId })) },
    _count: { _all: true },
  });
  const stillUsed = new Set(remaining.map((r) => `${r.sectionId}::${r.subjectId}`));
  const orphaned = pairs.filter((p) => !stillUsed.has(`${p.sectionId}::${p.subjectId}`));
  if (orphaned.length === 0) return;
  await prisma.teacherSubjectAssignment.deleteMany({
    where: { termId, OR: orphaned.map((p) => ({ sectionId: p.sectionId, subjectId: p.subjectId })) },
  });
}

/**
 * Publishing writes `APPROVED` (the status teacher desks read) and owns the
 * `TeacherSubjectAssignment` rows: a slot whose catalog name is linked to a
 * login becomes that login's class, never the administrator's.
 */
async function syncPublishedAssignments(sectionId: string, termId: string) {
  const entries = await prisma.sectionTimetableEntry.findMany({
    where: { sectionId, termId, status: "APPROVED", teacherName: { isNot: null } },
    select: { subjectId: true, teacherName: { select: { userId: true } } },
    distinct: ["subjectId", "teacherNameId"],
  });
  for (const entry of entries) {
    const teacherId = entry.teacherName?.userId;
    if (!teacherId) continue;
    const exists = await prisma.teacherSubjectAssignment.findFirst({
      where: { teacherId, subjectId: entry.subjectId, sectionId, termId },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.teacherSubjectAssignment.create({
      data: { teacherId, subjectId: entry.subjectId, sectionId, termId },
    });
  }
}

export async function getSchedule(ctx: ScheduleContext, opts?: ScheduleQueryOpts) {
  const termId = ctx.termId;
  const yearId = ctx.schoolYearId;
  const gradeLevels = opts?.gradeLevel && ALL_GRADES.includes(opts.gradeLevel as never)
    ? [opts.gradeLevel as (typeof ALL_GRADES)[number]]
    : [...ALL_GRADES];
  const sections = await prisma.section.findMany({
    where: {
      gradeLevel: { in: gradeLevels },
      // Always one school year — the desk's scoped year when it steers one,
      // otherwise the active year. Without this fallback an unresolved scope
      // (no active year yet) listed every year's sections at once, so a new
      // school year appeared to still hold the previous year's sections.
      schoolYear: yearId ? { id: yearId } : { isActive: true },
      ...(opts?.sectionId ? { id: opts.sectionId } : {}),
    },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
    ...(opts?.summary
      ? {
          select: {
            id: true,
            name: true,
            gradeLevel: true,
            adviserId: true,
            adviserCode: true,
            adviser: { select: { fullName: true } },
            timetableEntries: {
              where: termId ? { termId } : undefined,
              select: { status: true, reviewNote: true },
            },
            _count: { select: SECTION_LINK_COUNTS },
          },
        }
      : {
          include: {
            adviser: { select: { fullName: true } },
            teacherAssignments: {
              where: termId ? { termId } : undefined,
              include: {
                subject: { select: { id: true, name: true, code: true, gradeLevel: true, category: true } },
                teacher: { select: { fullName: true } },
              },
            },
            timetableEntries: {
              where: termId ? { termId } : undefined,
              select: {
                subjectId: true,
                teacherNameId: true,
                day: true,
                period: true,
                status: true,
                reviewNote: true,
                subject: { select: { id: true, name: true, code: true } },
                teacherName: { select: { id: true, name: true } },
              },
            },
            _count: { select: SECTION_LINK_COUNTS },
          },
        }),
  });
  return {
    sections: sections.map((row) => {
      const links = sectionLinksOf(row._count);
      return { ...row, links, locked: links.learners + links.records > 0 };
    }),
  };
}

export async function listScheduleSubjects(_ctx: ScheduleContext) {
  const rows = await prisma.subject.findMany({
    where: { gradeLevel: { in: [...ALL_GRADES] } },
    select: {
      id: true,
      name: true,
      code: true,
      gradeLevel: true,
      category: true,
      _count: {
        select: {
          timetableEntries: true,
          assignments: true,
          gradeComponents: true,
          finalGrades: true,
          gradeFlags: true,
          attendanceRecords: true,
        },
      },
    },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
  });
  return {
    subjects: rows.map(({ _count, ...subject }) => {
      const gradebook =
        _count.gradeComponents +
        _count.finalGrades +
        _count.gradeFlags +
        _count.attendanceRecords;
      const links = {
        timetableEntries: _count.timetableEntries,
        assignments: _count.assignments,
        gradebook,
      };
      return {
        ...subject,
        links,
        // The desk locks (and the API refuses to delete) any subject that a
        // record already points at, so a catalog row can never orphan history.
        locked: links.timetableEntries + links.assignments + gradebook > 0,
      };
    }),
  };
}

export async function listScheduleTeachers() {
  const rows = await prisma.teacherName.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      userId: true,
      user: { select: { fullName: true } },
      _count: { select: { entries: true, termGrants: true } },
    },
  });
  return {
    teachers: rows.map((t) => {
      const links = {
        timetableEntries: t._count.entries,
        termGrants: t._count.termGrants,
      };
      return {
        id: t.id,
        name: t.name,
        code: t.code,
        linked: !!t.userId,
        linkedName: t.user?.fullName ?? null,
        links,
        // A name used in a timetable, tied to a teacher login, or carrying term
        // grants is locked — the desk and the API both refuse to delete it.
        locked: !!t.userId || links.timetableEntries + links.termGrants > 0,
      };
    }),
  };
}

export async function getScheduleConfig(ctx: ScheduleContext) {
  const schoolYearId = await requireSchoolYearId(ctx);
  const [active, presets] = await Promise.all([
    activeScheduleConfigForYear(schoolYearId),
    prisma.scheduleConfig.findMany({
      where: { schoolYearId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
  ]);
  return {
    schoolYearId,
    config: active ? toScheduleConfig(active) : SCHEDULE_CONFIG_DEFAULTS,
    activeId: active?.id ?? null,
    presets: presets.map(presetOf),
  };
}

export interface ScheduleConfigPresetInput extends ScheduleConfigInput {
  name: string;
  activate?: boolean;
}

function presetOf(row: {
  id: string;
  name: string;
  isActive: boolean;
} & Parameters<typeof toScheduleConfig>[0]) {
  return { id: row.id, name: row.name, isActive: row.isActive, ...toScheduleConfig(row) };
}

function configScalars(body: ScheduleConfigInput) {
  return {
    startTime: body.startTime,
    periodMins: body.periodMins,
    lunchAfter: body.lunch.afterPeriod,
    lunchMins: body.lunch.mins,
    recessAmOn: body.morningRecess.enabled,
    recessAmAfter: body.morningRecess.afterPeriod,
    recessAmMins: body.morningRecess.mins,
    recessPmOn: body.afternoonRecess.enabled,
    recessPmAfter: body.afternoonRecess.afterPeriod,
    recessPmMins: body.afternoonRecess.mins,
  };
}

/** Add a named day-shape preset to the current school year. */
export async function createScheduleConfigPreset(
  ctx: ScheduleContext,
  body: ScheduleConfigPresetInput,
) {
  const schoolYearId = await requireSchoolYearId(ctx);
  const name = body.name.trim();
  if (!name) {
    throw new AppError(400, "PRESET_NAME_REQUIRED", "Give this configuration a name");
  }
  const activate = body.activate !== false;
  const row = await prisma.$transaction(async (tx) => {
    if (activate) {
      await tx.scheduleConfig.updateMany({ where: { schoolYearId }, data: { isActive: false } });
    }
    return tx.scheduleConfig.create({
      data: { schoolYearId, name, isActive: activate, ...configScalars(body) },
    });
  });
  await writeAudit({
    userId: ctx.userId,
    actionType: "create",
    sourceTable: "schedule_configs",
    sourceId: row.id,
    reason: `Administrator added the school-day configuration "${name}"`,
  });
  await announce(ctx, `The school-day configuration "${name}" was added`, null);
  return { preset: presetOf(row) };
}

export async function updateScheduleConfigPreset(
  ctx: ScheduleContext,
  presetId: string,
  body: Partial<ScheduleConfigPresetInput>,
) {
  const schoolYearId = await requireSchoolYearId(ctx);
  const existing = await prisma.scheduleConfig.findFirst({
    where: { id: presetId, schoolYearId },
  });
  if (!existing) {
    throw new AppError(404, "PRESET_NOT_FOUND", "That configuration no longer exists");
  }
  const name = body.name?.trim();
  if (body.name !== undefined && !name) {
    throw new AppError(400, "PRESET_NAME_REQUIRED", "Give this configuration a name");
  }
  const activate = body.activate === true;
  const row = await prisma.$transaction(async (tx) => {
    if (activate) {
      await tx.scheduleConfig.updateMany({
        where: { schoolYearId, id: { not: presetId } },
        data: { isActive: false },
      });
    }
    return tx.scheduleConfig.update({
      where: { id: presetId },
      data: {
        ...(name ? { name } : {}),
        ...(activate ? { isActive: true } : {}),
        ...(body.startTime !== undefined ? configScalars(body as ScheduleConfigInput) : {}),
      },
    });
  });
  await writeAudit({
    userId: ctx.userId,
    actionType: "update",
    sourceTable: "schedule_configs",
    sourceId: row.id,
    reason: `Administrator updated the school-day configuration "${row.name}"`,
  });
  await announce(ctx, `The school-day configuration "${row.name}" was updated`, null);
  return { preset: presetOf(row) };
}

/** Make one preset the year's live shape. */
export async function activateScheduleConfigPreset(ctx: ScheduleContext, presetId: string) {
  const schoolYearId = await requireSchoolYearId(ctx);
  const existing = await prisma.scheduleConfig.findFirst({
    where: { id: presetId, schoolYearId },
  });
  if (!existing) {
    throw new AppError(404, "PRESET_NOT_FOUND", "That configuration no longer exists");
  }
  const row = await prisma.$transaction(async (tx) => {
    await tx.scheduleConfig.updateMany({
      where: { schoolYearId, id: { not: presetId } },
      data: { isActive: false },
    });
    return tx.scheduleConfig.update({ where: { id: presetId }, data: { isActive: true } });
  });
  await writeAudit({
    userId: ctx.userId,
    actionType: "update",
    sourceTable: "schedule_configs",
    sourceId: row.id,
    reason: `Administrator set the school-day configuration "${row.name}" as active`,
  });
  await announce(ctx, `The school-day configuration "${row.name}" is now in use`, null);
  return { preset: presetOf(row) };
}

export async function deleteScheduleConfigPreset(ctx: ScheduleContext, presetId: string) {
  const schoolYearId = await requireSchoolYearId(ctx);
  const existing = await prisma.scheduleConfig.findFirst({
    where: { id: presetId, schoolYearId },
  });
  if (!existing) {
    throw new AppError(404, "PRESET_NOT_FOUND", "That configuration no longer exists");
  }
  if (existing.isActive) {
    throw new AppError(
      409,
      "PRESET_ACTIVE",
      "This configuration is in use. Switch to another one before deleting it.",
    );
  }
  const count = await prisma.scheduleConfig.count({ where: { schoolYearId } });
  if (count <= 1) {
    throw new AppError(409, "PRESET_LAST", "Keep at least one school-day configuration");
  }
  await prisma.scheduleConfig.delete({ where: { id: presetId } });
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "schedule_configs",
    sourceId: presetId,
    reason: `Administrator deleted the school-day configuration "${existing.name}"`,
  });
  await announce(ctx, `The school-day configuration "${existing.name}" was deleted`, null);
  return { ok: true };
}


export interface ScheduleConflict {
  teacherNameId: string;
  teacherName: string;
  day: number;
  period: number;
  sections: Array<{ sectionId: string; sectionName: string; subjectName: string }>;
}

export async function getScheduleConflicts(
  ctx: ScheduleContext,
  caps?: { maxDailyPeriods?: unknown; maxWeeklyPeriods?: unknown },
) {
  const termId = requireTermId(ctx);
  const entries = await prisma.sectionTimetableEntry.findMany({
    where: { termId, teacherNameId: { not: null } },
    select: {
      teacherNameId: true,
      day: true,
      period: true,
      sectionId: true,
      section: { select: { name: true } },
      subject: { select: { name: true, category: true } },
      teacherName: { select: { name: true } },
    },
  });
  const byKey = new Map<string, ScheduleConflict>();
  for (const e of entries) {
    if (!e.teacherNameId) continue;
    const key = `${e.teacherNameId}:${e.day}:${e.period}`;
    const slot = byKey.get(key) ?? {
      teacherNameId: e.teacherNameId,
      teacherName: e.teacherName?.name ?? "Teacher",
      day: e.day,
      period: e.period,
      sections: [],
    };
    slot.sections.push({
      sectionId: e.sectionId,
      sectionName: e.section?.name ?? "Section",
      subjectName: e.subject?.name ?? "Subject",
    });
    byKey.set(key, slot);
  }
  const conflicts = [...byKey.values()].filter((c) => {
    const ids = new Set(c.sections.map((s) => s.sectionId));
    return ids.size > 1;
  });

  const configRow = await activeScheduleConfigForTerm(termId);
  const config = configRow ? toScheduleConfig(configRow) : SCHEDULE_CONFIG_DEFAULTS;
  const capsResolved = resolveWorkloadCaps(caps);
  const perTeacherDay = new Map<string, number>();
  const perTeacherWeek = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    if (!e.teacherNameId) continue;
    const dayKey = `${e.teacherNameId}:${e.day}`;
    perTeacherDay.set(dayKey, (perTeacherDay.get(dayKey) ?? 0) + 1);
    const week = perTeacherWeek.get(e.teacherNameId) ?? {
      name: e.teacherName?.name ?? "Teacher",
      count: 0,
    };
    week.count += 1;
    perTeacherWeek.set(e.teacherNameId, week);
  }
  const workload = {
    maxDailyPeriods: capsResolved.maxDailyPeriods,
    maxWeeklyPeriods: capsResolved.maxWeeklyPeriods,
    overDaily: [...perTeacherDay.entries()]
      .filter(([, n]) => n > capsResolved.maxDailyPeriods)
      .map(([key, count]) => {
        const [teacherNameId, day] = key.split(":");
        return { teacherNameId, day: Number(day), count };
      }),
    overWeekly: [...perTeacherWeek.entries()]
      .filter(([, w]) => w.count > capsResolved.maxWeeklyPeriods)
      .map(([teacherNameId, w]) => ({ teacherNameId, teacherName: w.name, count: w.count })),
  };
  return { conflicts, workload, config };
}

/**
 * Legacy PATCH /config: update the year's active preset in place (creating a
 * "Default" one when the year has none). Preset management uses the
 * `/configs` routes.
 */
export async function updateScheduleConfig(ctx: ScheduleContext, body: ScheduleConfigInput) {
  const schoolYearId = await requireSchoolYearId(ctx);
  const active = await activeScheduleConfigForYear(schoolYearId);
  const row = active
    ? await prisma.scheduleConfig.update({
        where: { id: active.id },
        data: configScalars(body),
      })
    : await prisma.scheduleConfig.create({
        data: { schoolYearId, name: "Default", isActive: true, ...configScalars(body) },
      });
  await writeAudit({
    userId: ctx.userId,
    actionType: "update",
    sourceTable: "schedule_configs",
    sourceId: row.id,
    reason: "Administrator updated the school-day schedule shape",
  });
  await announce(ctx, "The school-day schedule shape was updated", null);
  return { config: toScheduleConfig(row), preset: presetOf(row) };
}

export async function createTeacherName(ctx: ScheduleContext, fullName: string) {
  const name = fullName.trim();
  const existing = await prisma.teacherName.findUnique({ where: { name } });
  if (existing) {
    throw new AppError(409, "TEACHER_EXISTS", "This name is already listed");
  }
  const parts = name.split(/\s+/).filter(Boolean);
  const initials =
    `${parts[0]?.[0] ?? "T"}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "")}`
      .toUpperCase()
      .replace(/[^A-Z]/g, "") || "T";
  let code = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${initials}-${100 + randomInt(900)}`;
    const clash = await prisma.teacherName.findUnique({ where: { code: candidate } });
    if (!clash) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    throw new AppError(500, "CODE_MINT_FAILED", "Could not mint a unique code, try again");
  }
  const teacher = await prisma.teacherName.create({
    data: { name, code },
    select: { id: true, name: true, code: true },
  });
  await writeAudit({
    userId: ctx.userId,
    actionType: "create",
    sourceTable: "teacher_names",
    sourceId: teacher.id,
    reason: `Administrator listed teacher name ${teacher.name}`,
  });
  return teacher;
}

export async function clearTeacherNames(ctx: ScheduleContext) {
  const termId = requireTermId(ctx);
  const pairs = await prisma.sectionTimetableEntry.findMany({
    where: { termId, teacherNameId: { not: null } },
    select: { subjectId: true, sectionId: true },
    distinct: ["subjectId", "sectionId"],
  });
  const removed = await prisma.teacherName.deleteMany({});
  await cleanupOrphanAssignments(termId, pairs);
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "teacher_names",
    sourceId: ctx.userId,
    reason: `Administrator cleared the teacher-name list (${removed.count} names)`,
  });
  return { deleted: removed.count };
}

export async function deleteTeacherName(ctx: ScheduleContext, teacherNameId: string) {
  const row = await prisma.teacherName.findUnique({
    where: { id: teacherNameId },
    select: {
      id: true,
      name: true,
      code: true,
      userId: true,
      _count: { select: { entries: true, termGrants: true } },
    },
  });
  if (!row) {
    throw new AppError(404, "TEACHER_NOT_FOUND", "Teacher name not found");
  }
  // Never delete a name that already carries data: timetable slots, term
  // grants or a linked login. The catalog marks the same rows as locked.
  const parts: string[] = [];
  if (row._count.entries > 0) {
    parts.push(`${row._count.entries} timetable slot${row._count.entries === 1 ? "" : "s"}`);
  }
  if (row._count.termGrants > 0) {
    parts.push(`${row._count.termGrants} term grant${row._count.termGrants === 1 ? "" : "s"}`);
  }
  if (row.userId) parts.push("a linked teacher account");
  if (parts.length > 0) {
    throw new AppError(
      409,
      "TEACHER_HAS_RECORDS",
      `${row.name} (${row.code ?? "no code"}) is used by ${parts.join(", ")} and cannot be deleted`,
    );
  }
  await prisma.teacherName.delete({ where: { id: teacherNameId } });
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "teacher_names",
    sourceId: row.id,
    reason: `Administrator deleted teacher name ${row.name}`,
  });
  return { deleted: true, teacher: { id: row.id, name: row.name, code: row.code } };
}

export interface CreateSubjectInput {
  name: string;
  /** Optional — the desk mints one from the name when it is omitted. */
  code?: string;
  gradeLevel: "G7" | "G8" | "G9" | "G10" | "G11" | "G12";
  category: "CORE" | "ELECTIVE";
}

export interface CreateSectionInput {
  name: string;
  gradeLevel: "G7" | "G8" | "G9" | "G10" | "G11" | "G12";
  /** School year the workspace is steering; defaults to the request scope. */
  schoolYearId?: string;
  /** Selected term, recorded on the audit trail (sections are year-scoped). */
  termId?: string;
}

/**
 * Sections are created by the administrator desk (school-year scoped). The
 * registry desks keep their banded create endpoints for enrollment, but the
 * schedule workspace must be able to seed a section before it can be timetabled.
 */
export async function createSection(ctx: ScheduleContext, input: CreateSectionInput) {
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, "MISSING_NAME", "Section name is required");
  }
  const schoolYearId = input.schoolYearId ?? ctx.schoolYearId;
  if (!schoolYearId) {
    throw new AppError(400, "NO_ACTIVE_SCHOOL_YEAR", "No active school year selected");
  }
  const schoolYear = await prisma.schoolYear.findUnique({
    where: { id: schoolYearId },
    select: { id: true, name: true },
  });
  if (!schoolYear) {
    throw new AppError(404, "SCHOOL_YEAR_NOT_FOUND", "School year not found");
  }
  let termNumber: number | null = null;
  if (input.termId) {
    const term = await prisma.term.findUnique({
      where: { id: input.termId },
      select: { schoolYearId: true, termNumber: true },
    });
    if (!term || term.schoolYearId !== schoolYearId) {
      throw new AppError(400, "TERM_MISMATCH", "The selected term does not belong to that school year");
    }
    termNumber = term.termNumber;
  }
  const duplicate = await prisma.section.findFirst({
    where: { name, gradeLevel: input.gradeLevel, schoolYearId },
    select: { id: true },
  });
  if (duplicate) {
    throw new AppError(
      409,
      "DUPLICATE_SECTION",
      `Section "${name}" already exists for ${input.gradeLevel} this school year`,
    );
  }
  // The advisory code is the access key for whoever will advise this section:
  // a newly created section is unassigned, so the administrator hands the code
  // to the adviser, who claims the seat with it (one code per section).
  const adviserCode = await mintUniqueAdviserCode();
  const section = await prisma.section.create({
    data: {
      name,
      gradeLevel: input.gradeLevel,
      schoolYearId,
      adviserId: null,
      adviserCode,
    },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      schoolYearId: true,
      adviserCode: true,
    },
  });
  await writeAudit({
    userId: ctx.userId,
    actionType: "create",
    sourceTable: "sections",
    sourceId: section.id,
    reason: `Administrator created section ${section.name} for ${schoolYear.name}${
      termNumber ? ` · Term ${termNumber}` : ""
    }`,
  });
  return section;
}

/**
 * Subject codes are minted by the system, matching the catalog convention
 * (`Mathematics 7` → `MATH7`, `Araling Panlipunan 7` → `AP7`): the meaningful
 * part of the name, the grade number, then a counter only when that code is
 * already taken for the grade.
 */
export function subjectCodeBase(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const words = cleaned
    .split(" ")
    .filter((word) => word && !/^(GRADE|G)$/.test(word));
  // A trailing grade number belongs to the code suffix, not the base name.
  while (words.length > 1 && /^\d{1,2}$/.test(words[words.length - 1] ?? "")) words.pop();
  if (words.length === 0) return "SUBJ";
  if (words.length === 1) return (words[0] ?? "SUBJ").slice(0, 4) || "SUBJ";
  return (
    words
      .map((word) => word[0])
      .join("")
      .slice(0, 4) || "SUBJ"
  );
}

export async function mintSubjectCode(
  name: string,
  gradeLevel: CreateSubjectInput["gradeLevel"],
): Promise<string> {
  const base = subjectCodeBase(name);
  const gradeNumber = gradeLevel.replace(/^G/, "");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${base}${gradeNumber}${attempt === 0 ? "" : `-${attempt + 1}`}`;
    const clash = await prisma.subject.findUnique({
      where: { code_gradeLevel: { code: candidate, gradeLevel } },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new AppError(500, "CODE_MINT_FAILED", "Could not mint a subject code, try again");
}

export async function createSubject(ctx: ScheduleContext, input: CreateSubjectInput) {
  const { name, gradeLevel, category } = input;
  const normalizedCode = input.code?.trim()
    ? input.code.trim().toUpperCase()
    : await mintSubjectCode(name, gradeLevel);
  const existing = await prisma.subject.findUnique({
    where: { code_gradeLevel: { code: normalizedCode, gradeLevel } },
  });
  if (existing) {
    throw new AppError(409, "SUBJECT_EXISTS", "This subject code already exists for the grade");
  }
  const subject = await prisma.subject.create({
    data: { name: name.trim(), code: normalizedCode, gradeLevel, category },
    select: { id: true, name: true, code: true, gradeLevel: true, category: true },
  });
  await writeAudit({
    userId: ctx.userId,
    actionType: "create",
    sourceTable: "subjects",
    sourceId: subject.id,
    reason: `Administrator created subject ${subject.name}`,
  });
  return subject;
}

export interface UpdateSubjectInput {
  name?: string;
  category?: "CORE" | "ELECTIVE";
}

/**
 * Rename / re-categorise a catalog subject. The minted code stays put — it is
 * the subject's identity on published grids and gradebook rows, so renaming
 * never rewrites linked records.
 */
export async function updateSubject(
  ctx: ScheduleContext,
  subjectId: string,
  input: UpdateSubjectInput,
) {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true, code: true },
  });
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", "Subject not found");
  }
  const name = input.name?.trim();
  if (input.name !== undefined && !name) {
    throw new AppError(400, "MISSING_NAME", "Subject name is required");
  }
  const updated = await prisma.subject.update({
    where: { id: subjectId },
    data: {
      ...(name ? { name } : {}),
      ...(input.category ? { category: input.category } : {}),
    },
    select: { id: true, name: true, code: true, gradeLevel: true, category: true },
  });
  await writeAudit({
    userId: ctx.userId,
    actionType: "update",
    sourceTable: "subjects",
    sourceId: updated.id,
    reason: `Administrator updated subject ${updated.name}`,
  });
  return updated;
}

export async function deleteSubject(ctx: ScheduleContext, subjectId: string) {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true, code: true, gradeLevel: true },
  });
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", "Subject not found");
  }
  // Never silently wipe linked records — block when the subject is referenced
  // by a timetable, an assignment or grading history (gradebook, flags,
  // attendance). The catalog marks the same rows as locked.
  const [
    gradeComponents,
    finalGrades,
    gradeFlags,
    attendanceRecords,
    timetableEntries,
    assignments,
  ] = await Promise.all([
    prisma.gradeComponent.count({ where: { subjectId } }),
    prisma.finalGrade.count({ where: { subjectId } }),
    prisma.gradeFlag.count({ where: { subjectId } }),
    prisma.attendanceRecord.count({ where: { subjectId } }),
    prisma.sectionTimetableEntry.count({ where: { subjectId } }),
    prisma.teacherSubjectAssignment.count({ where: { subjectId } }),
  ]);
  if (timetableEntries + assignments > 0) {
    throw new AppError(
      409,
      "SUBJECT_LOCKED",
      `${subject.name} (${subject.code}) is used in ${timetableEntries + assignments} timetable record${
        timetableEntries + assignments === 1 ? "" : "s"
      } and cannot be deleted`,
    );
  }
  if (gradeComponents + finalGrades + gradeFlags + attendanceRecords > 0) {
    throw new AppError(
      409,
      "SUBJECT_IN_USE",
      `${subject.name} (${subject.code}) already has gradebook records and cannot be deleted`,
    );
  }
  await prisma.subject.delete({ where: { id: subjectId } });
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "subjects",
    sourceId: subject.id,
    reason: `Administrator deleted subject ${subject.name}`,
  });
  return { deleted: true, subject };
}

/**
 * Remove a section the desk created. Same lock rule as the catalog: any learner
 * or record hanging off it blocks the delete, so nothing is ever silently
 * cascaded away.
 */
export async function deleteSection(ctx: ScheduleContext, sectionId: string) {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, name: true, _count: { select: SECTION_LINK_COUNTS } },
  });
  if (!section) {
    throw new AppError(404, "SECTION_NOT_FOUND", "Section not found");
  }
  const links = sectionLinksOf(section._count);
  if (links.learners + links.records > 0) {
    throw new AppError(
      409,
      "SECTION_HAS_RECORDS",
      `Cannot delete "${section.name}" — it still has ${sectionLockSuffix(links)}`,
    );
  }
  await prisma.section.delete({ where: { id: sectionId } });
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "sections",
    sourceId: section.id,
    reason: `Administrator deleted section ${section.name}`,
  });
  return { deleted: true, id: section.id, name: section.name };
}

/** One school year row with everything the lock check counts. */
const SCHOOL_YEAR_LOCK_SELECT = {
  id: true,
  name: true,
  isActive: true,
  startDate: true,
  endDate: true,
  _count: { select: { sections: true, rosterEntries: true } },
  terms: {
    orderBy: { termNumber: "asc" as const },
    select: {
      id: true,
      termNumber: true,
      startDate: true,
      endDate: true,
      _count: { select: TERM_LINK_COUNTS },
    },
  },
} as const;

type SchoolYearLockRow = {
  id: string;
  name: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  _count: { sections: number; rosterEntries: number };
  terms: Array<{
    id: string;
    termNumber: number;
    startDate: Date | null;
    endDate: Date | null;
    _count: Record<keyof typeof TERM_LINK_COUNTS, number>;
  }>;
};

function schoolYearLinksOf(row: SchoolYearLockRow): SchoolYearLinks {
  return {
    sections: row._count.sections,
    learners: row._count.rosterEntries,
    records: row.terms.reduce((sum, term) => sum + termLinkTotal(term._count), 0),
  };
}

function schoolYearLockSuffix(links: SchoolYearLinks): string {
  const parts: string[] = [];
  if (links.sections > 0)
    parts.push(`${links.sections} section${links.sections === 1 ? "" : "s"}`);
  if (links.learners > 0)
    parts.push(`${links.learners} learner${links.learners === 1 ? "" : "s"}`);
  if (links.records > 0) parts.push(`${links.records} record${links.records === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

/**
 * School years with their delete lock: the year in use, or any year that
 * already owns sections / roster entries / term records, cannot be deleted.
 */
export async function listScheduleSchoolYears() {
  const rows = (await prisma.schoolYear.findMany({
    select: SCHOOL_YEAR_LOCK_SELECT,
    orderBy: { startDate: "desc" },
  })) as SchoolYearLockRow[];
  return {
    schoolYears: rows.map((row) => {
      const links = schoolYearLinksOf(row);
      const locked = row.isActive || links.sections + links.learners + links.records > 0;
      return {
        id: row.id,
        name: row.name,
        isActive: row.isActive,
        startDate: row.startDate,
        endDate: row.endDate,
        terms: row.terms.map(({ _count: _ignored, ...term }) => term),
        links,
        locked,
        lockedReason: row.isActive
          ? "In use — the active school year cannot be deleted"
          : links.sections + links.learners + links.records > 0
            ? `Locked — used by ${schoolYearLockSuffix(links)}`
            : null,
      };
    }),
  };
}

/**
 * Delete an empty school year (its undated terms cascade). Blocked while the
 * year is active or anything already points at it or its terms.
 */
export async function deleteSchoolYear(ctx: ScheduleContext, schoolYearId: string) {
  const row = (await prisma.schoolYear.findUnique({
    where: { id: schoolYearId },
    select: SCHOOL_YEAR_LOCK_SELECT,
  })) as SchoolYearLockRow | null;
  if (!row) {
    throw new AppError(404, "SCHOOL_YEAR_NOT_FOUND", "School year not found");
  }
  if (row.isActive) {
    throw new AppError(
      409,
      "SCHOOL_YEAR_ACTIVE",
      `${row.name} is the active school year and cannot be deleted`,
    );
  }
  const links = schoolYearLinksOf(row);
  if (links.sections + links.learners + links.records > 0) {
    throw new AppError(
      409,
      "SCHOOL_YEAR_HAS_RECORDS",
      `Cannot delete ${row.name} — it still has ${schoolYearLockSuffix(links)}`,
    );
  }
  await prisma.schoolYear.delete({ where: { id: schoolYearId } });
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "school_years",
    sourceId: row.id,
    reason: `Administrator deleted school year ${row.name}`,
  });
  // The list of resolvable school years just changed.
  invalidateTermScopeCache();
  return { deleted: true, id: row.id, name: row.name };
}

export async function writeEntry(ctx: ScheduleContext, input: WriteEntryInput) {
  const termId = requireTermId(ctx);
  const { sectionId, subjectId, teacherNameId, day, period } = input;
  await resolveTarget(sectionId, subjectId);
  const teacherName = await prisma.teacherName.findUnique({ where: { id: teacherNameId } });
  if (!teacherName) {
    throw new AppError(404, "TEACHER_NOT_FOUND", "Teacher name not found");
  }

  const { entry, status, prevSubjectId, warnings } = await prisma.$transaction(async (tx) => {
    // Warn-allow: a teacher may appear in two sections at the same day/period.
    // We still save, but return a TEACHER_CONFLICT warning for the UI banner.
    // One-subject-one-teacher-per-section stays a hard block below.
    const clash = await tx.sectionTimetableEntry.findFirst({
      where: { termId, day, period, teacherNameId, NOT: { sectionId } },
      include: { section: { select: { name: true } }, subject: { select: { name: true } } },
    });
    const warnings: Array<{
      code: "TEACHER_CONFLICT";
      message: string;
      teacherNameId: string;
      day: number;
      period: number;
      otherSection: string | null;
      otherSubject: string | null;
    }> = [];
    if (clash) {
      warnings.push({
        code: "TEACHER_CONFLICT",
        message: `${teacherName.name} also teaches ${clash.subject.name} in ${clash.section.name} at this time — saved with a conflict warning`,
        teacherNameId,
        day,
        period,
        otherSection: clash.section.name,
        otherSubject: clash.subject.name,
      });
    }

    const siblings = await tx.sectionTimetableEntry.findMany({
      where: { sectionId, termId, subjectId },
      select: {
        day: true,
        period: true,
        teacherNameId: true,
        subject: { select: { name: true } },
        section: { select: { name: true } },
        teacherName: { select: { name: true } },
      },
    });
    const holder = siblings.find(
      (e) => e.teacherNameId && e.teacherNameId !== teacherNameId && !(e.day === day && e.period === period),
    );
    if (holder) {
      throw new AppError(
        409,
        "SUBJECT_TEACHER_SPLIT",
        `${holder.subject?.name ?? "This subject"} in ${holder.section?.name ?? "this section"} is already assigned to ${holder.teacherName?.name ?? "another teacher"} — one subject takes one teacher per section. Clear its slots first to reassign it.`,
      );
    }
    const slot = { sectionId, termId, day, period };
    const existing = await tx.sectionTimetableEntry.findUnique({
      where: { sectionId_termId_day_period: slot },
    });
    let row = existing;
    let code = 200;

    if (!existing) {
      row = await tx.sectionTimetableEntry.create({
        data: { ...slot, subjectId, teacherNameId, status: "DRAFT" },
      });
      code = 201;
    } else if (existing.subjectId !== subjectId || existing.teacherNameId !== teacherNameId) {
      if (existing.status === "APPROVED") {
        throw new AppError(
          409,
          "SCHEDULE_LOCKED",
          "This slot is part of a published timetable — switch the section back to draft to edit it",
        );
      }
      row = await tx.sectionTimetableEntry.update({
        where: { id: existing.id },
        data: {
          subjectId,
          teacherNameId,
          status: "DRAFT",
          submittedBy: null,
          submittedAt: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
        },
      });
    }

    const after = await tx.sectionTimetableEntry.findMany({
      where: { sectionId, termId, subjectId },
      select: { teacherNameId: true },
    });
    const distinct = new Set(after.map((e) => e.teacherNameId).filter(Boolean));
    if (distinct.size > 1) {
      throw new AppError(
        409,
        "SUBJECT_TEACHER_SPLIT",
        "One subject takes one teacher per section — another save just claimed this subject. Reload and retry.",
      );
    }
    return { entry: row, status: code, prevSubjectId: existing?.subjectId ?? null, warnings };
  });

  if (prevSubjectId && prevSubjectId !== subjectId) {
    await cleanupOrphanAssignments(termId, [{ sectionId, subjectId: prevSubjectId }]);
  }
  await writeAudit({
    userId: ctx.userId,
    actionType: status === 201 ? "create" : "update",
    sourceTable: "section_timetable_entries",
    sourceId: entry!.id,
    reason: "Administrator set a timetable slot",
  });
  await announce(ctx, "A timetable slot was set", sectionId);
  return {
    entry: {
      id: entry!.id,
      sectionId,
      subjectId,
      teacherNameId,
      termId,
      day,
      period,
    },
    status,
    warnings,
  };
}

export async function clearEntry(ctx: ScheduleContext, sectionId: string, day: number, period: number) {
  const termId = requireTermId(ctx);
  if (!sectionId || !Number.isInteger(day) || day < 1 || day > 5 || !Number.isInteger(period) || period < 0 || period > 7) {
    throw new AppError(400, "INVALID_SLOT", "sectionId, day (1–5) and period (0–7) are required");
  }
  const entry = await prisma.sectionTimetableEntry.findUnique({
    where: { sectionId_termId_day_period: { sectionId, termId, day, period } },
  });
  if (!entry) {
    throw new AppError(404, "NOT_FOUND", "Timetable slot is already empty");
  }
  if (entry.status === "APPROVED") {
    throw new AppError(
      409,
      "SCHEDULE_LOCKED",
      "This slot is part of a published timetable — switch the section back to draft to edit it",
    );
  }
  await prisma.sectionTimetableEntry.delete({ where: { id: entry.id } });
  await cleanupOrphanAssignments(termId, [{ sectionId, subjectId: entry.subjectId }]);
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "section_timetable_entries",
    sourceId: entry.id,
    reason: "Administrator cleared a timetable slot",
  });
  await announce(ctx, "A timetable slot was cleared", sectionId);
  return { deleted: true };
}

export async function clearSection(ctx: ScheduleContext, sectionId: string) {
  const termId = requireTermId(ctx);
  if (!sectionId) {
    throw new AppError(400, "INVALID_SECTION", "sectionId is required");
  }
  await resolveTarget(sectionId, null);

  const lockedCount = await prisma.sectionTimetableEntry.count({
    where: { sectionId, termId, status: "APPROVED" },
  });
  const subjectIds = await prisma.sectionTimetableEntry.findMany({
    where: { sectionId, termId, status: { not: "APPROVED" } },
    select: { subjectId: true },
    distinct: ["subjectId"],
  });
  const removed = await prisma.sectionTimetableEntry.deleteMany({
    where: { sectionId, termId, status: { not: "APPROVED" } },
  });
  await cleanupOrphanAssignments(
    termId,
    subjectIds.map((s) => ({ sectionId, subjectId: s.subjectId })),
  );
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "section_timetable_entries",
    sourceId: sectionId,
    reason: `Administrator cleared the whole timetable (${removed.count} slots)`,
  });
  await announce(ctx, `Section timetable was cleared (${removed.count} slots)`, sectionId);
  return { deleted: removed.count, skippedApproved: lockedCount };
}

export async function clearAll(ctx: ScheduleContext) {
  const termId = requireTermId(ctx);
  const lockedCount = await prisma.sectionTimetableEntry.count({
    where: { termId, status: "APPROVED" },
  });
  const pairs = await prisma.sectionTimetableEntry.findMany({
    where: { termId, status: { not: "APPROVED" } },
    select: { subjectId: true, sectionId: true },
    distinct: ["subjectId", "sectionId"],
  });
  const removed = await prisma.sectionTimetableEntry.deleteMany({
    where: { termId, status: { not: "APPROVED" } },
  });
  await cleanupOrphanAssignments(termId, pairs);
  await writeAudit({
    userId: ctx.userId,
    actionType: "delete",
    sourceTable: "section_timetable_entries",
    sourceId: termId,
    reason: `Administrator cleared all timetables (${removed.count} slots)`,
  });
  await announce(ctx, `All timetables were cleared workspace-wide (${removed.count} slots)`, null);
  return { deleted: removed.count, skippedApproved: lockedCount };
}

export type PublishStatus = "DRAFT" | "PUBLISHED";

/**
 * Draft ⇄ published. Publishing writes `APPROVED`, the status teacher desks
 * read for class lists, grading and attendance. There is no submit/approve
 * step — the administrator is the owner.
 */
export async function setTimetableStatus(
  ctx: ScheduleContext,
  input: { sectionId?: string; status: PublishStatus },
) {
  const termId = requireTermId(ctx);
  const { sectionId, status } = input;
  if (sectionId) {
    await resolveTarget(sectionId, null);
  }
  const scope = sectionId ? { sectionId, termId } : { termId };

  let changed: number;
  if (status === "PUBLISHED") {
    const updated = await prisma.sectionTimetableEntry.updateMany({
      where: { ...scope, status: { in: ["DRAFT", "SUBMITTED"] } },
      data: {
        status: "APPROVED",
        submittedBy: ctx.userId,
        submittedAt: new Date(),
        reviewedBy: ctx.userId,
        reviewedAt: new Date(),
        reviewNote: null,
      },
    });
    changed = updated.count;
    if (sectionId) {
      await syncPublishedAssignments(sectionId, termId);
    } else {
      const sections = await prisma.sectionTimetableEntry.findMany({
        where: { termId, status: "APPROVED" },
        select: { sectionId: true },
        distinct: ["sectionId"],
      });
      for (const s of sections) await syncPublishedAssignments(s.sectionId, termId);
    }
  } else {
    const updated = await prisma.sectionTimetableEntry.updateMany({
      where: { ...scope, status: { in: ["APPROVED", "SUBMITTED"] } },
      data: {
        status: "DRAFT",
        submittedBy: null,
        submittedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      },
    });
    changed = updated.count;
  }

  if (changed === 0) {
    throw new AppError(
      400,
      status === "PUBLISHED" ? "NOTHING_TO_PUBLISH" : "NOTHING_TO_UNPUBLISH",
      status === "PUBLISHED"
        ? sectionId
          ? "No draft slots to publish for this section"
          : "No draft slots to publish"
        : sectionId
          ? "No published slots to switch back to draft for this section"
          : "No published slots to switch back to draft",
    );
  }

  await writeAudit({
    userId: ctx.userId,
    actionType: "update",
    sourceTable: "section_timetable_entries",
    sourceId: sectionId ?? termId,
    reason:
      status === "PUBLISHED"
        ? `Administrator published ${changed} timetable slots${sectionId ? "" : " workspace-wide"}`
        : `Administrator switched ${changed} timetable slots back to draft${sectionId ? "" : " workspace-wide"}`,
  });
  await announce(
    ctx,
    status === "PUBLISHED"
      ? `Timetable published (${changed} slots)`
      : `Timetable switched back to draft (${changed} slots)`,
    sectionId ?? null,
  );

  return status === "PUBLISHED" ? { published: changed } : { drafted: changed };
}

export interface CreateSchoolYearInput {
  name: string;
  startDate: string;
  endDate: string;
  /** Make this the school-wide active year (exclusive). */
  makeActive?: boolean;
}

/**
 * The workspace can seed the next school year (and its three trimesters) so a
 * future term can be prepared without leaving the timetable desk. Sections are
 * keyed to the year, timetables to its terms.
 */
export async function createSchoolYear(ctx: ScheduleContext, input: CreateSchoolYearInput) {
  const raw = input.name.trim();
  if (!raw) {
    throw new AppError(400, "MISSING_NAME", "School year name is required");
  }
  const cleaned = raw.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const name = /^\d{4}\s*-\s*\d{4}$/.test(cleaned)
    ? `SY ${cleaned.replace(/\s+/g, "")}`
    : cleaned;

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError(400, "INVALID_DATES", "Start and end dates are required");
  }
  if (end <= start) {
    throw new AppError(400, "INVALID_DATE_RANGE", "The end date must be after the start date");
  }

  const duplicate = await prisma.schoolYear.findFirst({ where: { name }, select: { id: true } });
  if (duplicate) {
    throw new AppError(409, "DUPLICATE_SCHOOL_YEAR", `${name} already exists`);
  }

  const makeActive = input.makeActive === true;
  const created = await prisma.$transaction(async (tx) => {
    if (makeActive) {
      await tx.schoolYear.updateMany({ where: { isActive: true }, data: { isActive: false } });
    }
    const year = await tx.schoolYear.create({
      data: { name, startDate: start, endDate: end, isActive: makeActive, createdBy: ctx.userId },
      select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
    });
    await tx.term.createMany({
      data: [1, 2, 3].map((termNumber) => ({ schoolYearId: year.id, termNumber })),
    });
    const terms = await tx.term.findMany({
      where: { schoolYearId: year.id },
      orderBy: { termNumber: "asc" },
      select: { id: true, termNumber: true, startDate: true, endDate: true },
    });
    return { ...year, terms };
  });

  await writeAudit({
    userId: ctx.userId,
    actionType: "create",
    sourceTable: "school_years",
    sourceId: created.id,
    reason: `Administrator created school year ${created.name}${makeActive ? " and set it active" : ""}`,
  });
  // A new year (or its terms) changes the resolvable term scope.
  invalidateTermScopeCache();
  return created;
}

export interface TermDatesInput {
  termId: string;
  startDate: string;
  endDate: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function localTodayKey(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Trimesters are fixed at 1–3 per school year; the administrator only sets
 * their date windows. Dates must sit inside the school year, run strictly in
 * term order (no overlap), and can never be backdated — an already stored past
 * date may be kept as-is but not re-entered as a new one.
 */
export async function updateTermDates(
  ctx: ScheduleContext,
  schoolYearId: string,
  input: TermDatesInput[],
) {
  const year = await prisma.schoolYear.findUnique({
    where: { id: schoolYearId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      terms: { select: { id: true, termNumber: true, startDate: true, endDate: true } },
    },
  });
  if (!year) {
    throw new AppError(404, "SCHOOL_YEAR_NOT_FOUND", "School year not found");
  }
  if (year.terms.length === 0) {
    throw new AppError(400, "NO_TERMS", "This school year has no trimesters to configure");
  }

  const byId = new Map(year.terms.map((t) => [t.id, t]));
  const todayKey = localTodayKey();
  const yearStartKey = dateOnly(year.startDate);
  const yearEndKey = dateOnly(year.endDate);
  const seen = new Set<string>();

  for (const entry of input) {
    const term = byId.get(entry.termId);
    if (!term) {
      throw new AppError(400, "TERM_MISMATCH", "That term does not belong to this school year");
    }
    if (seen.has(entry.termId)) {
      throw new AppError(400, "DUPLICATE_TERM", "A term was submitted twice");
    }
    seen.add(entry.termId);

    if (!DATE_ONLY.test(entry.startDate) || !DATE_ONLY.test(entry.endDate)) {
      throw new AppError(400, "INVALID_DATES", "Term start and end dates are required");
    }
    if (Number.isNaN(new Date(`${entry.startDate}T00:00:00Z`).getTime()) ||
        Number.isNaN(new Date(`${entry.endDate}T00:00:00Z`).getTime())) {
      throw new AppError(400, "INVALID_DATES", "Term start and end dates are not valid dates");
    }
    if (entry.endDate <= entry.startDate) {
      throw new AppError(400, "INVALID_DATE_RANGE", "A term must end after it starts");
    }

    const storedStart = dateOnly(term.startDate);
    const storedEnd = dateOnly(term.endDate);
    if (entry.startDate < todayKey && entry.startDate !== storedStart) {
      throw new AppError(400, "PAST_DATE", "A term cannot start in the past");
    }
    if (entry.endDate < todayKey && entry.endDate !== storedEnd) {
      throw new AppError(400, "PAST_DATE", "A term cannot end in the past");
    }
    if (yearStartKey && entry.startDate < yearStartKey) {
      throw new AppError(400, "OUTSIDE_SCHOOL_YEAR", "A term cannot start before its school year");
    }
    if (yearEndKey && entry.endDate > yearEndKey) {
      throw new AppError(400, "OUTSIDE_SCHOOL_YEAR", "A term cannot end after its school year");
    }
  }

  // Term order must hold wherever two consecutive terms both have dates.
  const merged = year.terms
    .map((t) => {
      const entry = input.find((i) => i.termId === t.id);
      return {
        termId: t.id,
        termNumber: t.termNumber,
        startDate: entry?.startDate ?? dateOnly(t.startDate),
        endDate: entry?.endDate ?? dateOnly(t.endDate),
      };
    })
    .sort((a, b) => a.termNumber - b.termNumber);
  for (let i = 1; i < merged.length; i++) {
    const prev = merged[i - 1];
    const next = merged[i];
    if (prev.endDate && next.startDate && next.startDate < prev.endDate) {
      throw new AppError(
        400,
        "TERM_OVERLAP",
        `Term ${next.termNumber} must not start before Term ${prev.termNumber} ends`,
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (const entry of input) {
      await tx.term.update({
        where: { id: entry.termId },
        data: {
          startDate: new Date(`${entry.startDate}T00:00:00Z`),
          endDate: new Date(`${entry.endDate}T00:00:00Z`),
        },
      });
    }
    await writeAudit(
      {
        userId: ctx.userId,
        actionType: "update",
        sourceTable: "terms",
        sourceId: year.id,
        reason: `Administrator set the trimester dates of ${year.name}`,
      },
      tx,
    );
    return tx.term.findMany({
      where: { schoolYearId: year.id },
      orderBy: { termNumber: "asc" },
      select: { id: true, termNumber: true, startDate: true, endDate: true },
    });
  });

  // Term windows drive the date-picked scope fallback and the current term.
  invalidateTermScopeCache();
  return { schoolYearId: year.id, name: year.name, terms: updated };
}
