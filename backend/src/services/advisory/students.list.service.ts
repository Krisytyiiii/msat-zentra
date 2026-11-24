import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { isArchivedAdvisoryLearner } from "../../lib/learnerVisibility.js";
import { attendanceTotalFor, computeRiskFactors, levelFromFlags, sectionAttendanceTotals } from "../risk.js";
import { learnerSubjectAverageAttendance, subjectAverageAttendance, termHasStarted } from "../attendance.js";
import { sectionHeadcounts } from "../enrollment.js";
import { admExemptStudentIds, isAdmExempt } from "../adm/attendancePolicy.js";
import { adviserSectionsOr404 } from "../../modules/teacher/advisory.repository.js";
import type { AdvisoryContext } from "./advisory.types.js";

export async function getStudents(ctx: AdvisoryContext) {
  const teacherId = ctx.userId;
  const termId = ctx.termId;
  const sections = await adviserSectionsOr404(teacherId, ctx.schoolYearId);
  if (!termId) {
    return { advisorySections: sections, termId: null, students: [] };
  }

  const sectionIds = sections.map((s) => s.id);
  const [counts, advisees, rosterEntries, assignSubjects, entrySubjects, subjectAvgs, sectionTotals, term, archived] =
    await Promise.all([
      prisma.studentProfile.groupBy({
        by: ["sectionId"],
        where: { sectionId: { in: sectionIds } },
        _count: { _all: true },
      }),
      prisma.studentProfile.findMany({
        where: { sectionId: { in: sectionIds } },
        include: {
          user: { select: { fullName: true } },
          section: { select: { id: true, name: true } },
          finalGrades: {
            where: { termId },
            select: {
              computedAverage: true,
              transmutedGrade: true,
              subject: { select: { name: true, code: true } },
            },
          },
          attendanceRecords: { where: { termId }, select: { status: true } },
          anecdotalRecords: {
            where: { termId, deletedAt: null },
            select: { confidentialityLevel: true, category: true },
          },
          gradeFlags: { where: { termId }, select: { status: true } },
        },
        orderBy: { user: { fullName: "asc" } },
      }),
      prisma.studentRoster.findMany({
        where: { sectionId: { in: sectionIds } },
        select: {
          id: true,
          lrn: true,
          fullName: true,
          mascot: true,
          sectionId: true,
          learnerType: true,
          createdAt: true,
          section: { select: { name: true } },
        },
        orderBy: { fullName: "asc" },
      }),
      prisma.teacherSubjectAssignment.findMany({
        where: { sectionId: { in: sectionIds }, termId },
        select: { subject: { select: { name: true, code: true } } },
        distinct: ["subjectId"],
      }),
      prisma.sectionTimetableEntry.findMany({
        where: { sectionId: { in: sectionIds }, termId },
        select: { subject: { select: { name: true, code: true } } },
        distinct: ["subjectId"],
      }),
      subjectAverageAttendance(sectionIds, termId),
      sectionAttendanceTotals(sectionIds, termId),
      prisma.term.findUnique({
        where: { id: termId },
        select: { startDate: true },
      }),
      // Adviser-scoped soft delete: hidden learners keep every record and can
      // be restored from the same page.
      prisma.adviserArchivedStudent.findMany({
        where: { teacherId },
        select: { studentId: true, rosterId: true },
      }),
    ]);
  const archivedStudentIds = new Set(
    archived.map((a) => a.studentId).filter((id): id is string => !!id),
  );
  const archivedRosterIds = new Set(
    archived.map((a) => a.rosterId).filter((id): id is string => !!id),
  );
  const visibleAdvisees = advisees.filter((s) => !archivedStudentIds.has(s.userId));
  const visibleRosterEntries = rosterEntries.filter((r) => !archivedRosterIds.has(r.id));
  const registeredLrns = new Set(visibleAdvisees.map((s) => s.lrn));
  const rosterOnly = visibleRosterEntries.filter((r) => !registeredLrns.has(r.lrn));
  const rosterIds = rosterOnly.map((r) => r.id);
  const profileIds = visibleAdvisees.map((s) => s.userId);

  const [rosterFinals, rosterAttendance, rosterAnecdotal, rawRows, enrolledBySection] =
    await Promise.all([
    rosterIds.length > 0
      ? prisma.finalGrade.findMany({
          where: { rosterId: { in: rosterIds }, termId },
          select: {
            rosterId: true,
            computedAverage: true,
            transmutedGrade: true,
            subject: { select: { name: true, code: true } },
          },
        })
      : Promise.resolve([]),
    rosterIds.length > 0
      ? prisma.attendanceRecord.findMany({
          where: { rosterId: { in: rosterIds }, termId },
          select: { rosterId: true, status: true },
        })
      : Promise.resolve([]),
    rosterIds.length > 0
      ? prisma.anecdotalRecord.findMany({
          where: { rosterId: { in: rosterIds }, termId, deletedAt: null },
          select: { rosterId: true, confidentialityLevel: true },
        })
      : Promise.resolve([]),
    termId
      ? prisma.studentGrade.findMany({
          where: {
            assessment: { gradeComponent: { termId } },
            OR: [
              ...(profileIds.length > 0 ? [{ studentId: { in: profileIds } }] : []),
              ...(rosterIds.length > 0 ? [{ rosterId: { in: rosterIds } }] : []),
            ],
          },
          select: {
            studentId: true,
            rosterId: true,
            percentageScore: true,
            assessment: { select: { gradeComponent: { select: { subjectId: true } } } },
          },
        })
      : Promise.resolve([]),
    sectionHeadcounts(sectionIds, counts),
  ]);

  // Signed ADM cases: seat time is not their risk signal (module work is not
  // attendance evidence either — the factor is simply suppressed).
  const admExempt = await admExemptStudentIds(termId);

  const finalsByRoster = new Map<string, typeof rosterFinals>();
  for (const f of rosterFinals) {
    const arr = finalsByRoster.get(f.rosterId as string) ?? [];
    arr.push(f);
    finalsByRoster.set(f.rosterId as string, arr);
  }
  const attendanceByRoster = new Map<string, { status: string }[]>();
  for (const r of rosterAttendance) {
    const arr = attendanceByRoster.get(r.rosterId as string) ?? [];
    arr.push({ status: r.status });
    attendanceByRoster.set(r.rosterId as string, arr);
  }
  const anecdotalByRoster = new Map<string, { confidentialityLevel: string }[]>();
  for (const r of rosterAnecdotal) {
    const arr = anecdotalByRoster.get(r.rosterId as string) ?? [];
    arr.push({ confidentialityLevel: r.confidentialityLevel });
    anecdotalByRoster.set(r.rosterId as string, arr);
  }
  const rawBySubject = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const row of rawRows) {
    const key = row.studentId ?? `roster:${row.rosterId}`;
    const subjectId = row.assessment.gradeComponent.subjectId;
    if (!rawBySubject.has(key)) rawBySubject.set(key, new Map());
    const perSubject = rawBySubject.get(key)!;
    const cell = perSubject.get(subjectId) ?? { sum: 0, count: 0 };
    cell.sum += row.percentageScore;
    cell.count += 1;
    perSubject.set(subjectId, cell);
  }
  const rawAveragesFor = (key: string): number[] =>
    Array.from((rawBySubject.get(key) ?? new Map()).values()).map(
      (cell) => cell.sum / cell.count,
    );

  const liveGradesByKey = new Map<string, { subjectId: string; average: number }[]>();
  for (const [key, perSubject] of rawBySubject) {
    const arr: { subjectId: string; average: number }[] = [];
    for (const [subjectId, cell] of perSubject) {
      if (cell.count > 0) {
        arr.push({
          subjectId,
          average: Math.round((cell.sum / cell.count) * 10) / 10,
        });
      }
    }
    if (arr.length > 0) liveGradesByKey.set(key, arr);
  }
  const liveSubjectIds = [
    ...new Set([...liveGradesByKey.values()].flatMap((a) => a.map((g) => g.subjectId))),
  ];
  const liveSubjectById = new Map(
    (
      liveSubjectIds.length > 0
        ? await prisma.subject.findMany({
            where: { id: { in: liveSubjectIds } },
            select: { id: true, name: true, code: true },
          })
        : []
    ).map((s) => [s.id, s]),
  );
  const liveGradesFor = (
    key: string,
  ): { subject: string; code: string; average: number }[] =>
    (liveGradesByKey.get(key) ?? [])
      .map((g) => {
        const meta = liveSubjectById.get(g.subjectId);
        if (!meta) return null;
        return { subject: meta.name, code: meta.code, average: g.average };
      })
      .filter(
        (g): g is { subject: string; code: string; average: number } =>
          g !== null,
      )
      .sort((a, b) => a.subject.localeCompare(b.subject));

  const toActiveFlags = (flags: { academicFlag: boolean; attendanceFlag: boolean; behavioralFlag: boolean }) => {
    const active: ("academic" | "attendance" | "behavioral")[] = [];
    if (flags.academicFlag) active.push("academic");
    if (flags.attendanceFlag) active.push("attendance");
    if (flags.behavioralFlag) active.push("behavioral");
    return active;
  };

  // The engine rates attendance on the term subject-average (per-subject
  // present %, averaged) — the same figure the attendance column renders. A
  // learner without subject marks yet keeps the section-meetup fallback
  // instead of having an empty record set read as 0%.
  const attendanceRateFor = (key: string): number | null => {
    const subjAvg = subjectAvgs.get(key);
    return subjAvg && subjAvg.hasSubjectData ? subjAvg.average : null;
  };

  // A term that has not started yet is outside its scope period: staged or
  // seeded finals/attendance/anecdotes are not this term's records yet. Keep
  // the learner identity but report no metrics or grades.
  const started = termHasStarted(term?.startDate);

  // Helper to compute general average from final grades (same logic as getStudentAcademic)
  const computeGeneralAverage = (finalGrades: { computedAverage: number | null }[]) => {
    const graded = finalGrades.filter((f) => f.computedAverage !== null);
    if (graded.length === 0) return null;
    return graded.reduce((sum, f) => sum + (f.computedAverage ?? 0), 0) / graded.length;
  };

  const students = [
    ...visibleAdvisees.map((s) => {
      const enrolled = enrolledBySection.get(s.sectionId!) ?? 0;
      const factors = computeRiskFactors({
        finalGrades: s.finalGrades,
        rawAverages: rawAveragesFor(s.userId),
        attendance: s.attendanceRecords,
        attendanceRate: attendanceRateFor(s.userId),
        attendanceTotal: sectionTotals.get(s.sectionId ?? ""),
        anecdotalCount: s.anecdotalRecords.length,
        enrolled,
        attendanceExempt: admExempt.has(s.userId),
      });
      const activeFlags = toActiveFlags(factors);
      const present = s.attendanceRecords.filter((r) => r.status === "present").length;
      const total = Math.max(sectionTotals.get(s.sectionId ?? "") ?? 0, s.attendanceRecords.length);
      const openFlags = s.gradeFlags.filter((g) => g.status !== "resolved").length;
      const academicGrade = started ? computeGeneralAverage(s.finalGrades) : null;
      return {
        studentId: s.userId,
        name: s.user.fullName,
        lrn: s.lrn,
        mascot: s.mascot ?? null,
        birthdate: s.birthdate,
        gender: s.gender,
        section: s.section?.name ?? "",
        riskLevel: started ? levelFromFlags(factors) : "Low",
        flags: started ? activeFlags : [],
        attendanceRate: started ? (total === 0 ? 1 : present / total) : 0,
        anecdotalCount: started ? s.anecdotalRecords.length : 0,
        confidentialityTiers: started
          ? Array.from(new Set(s.anecdotalRecords.map((a) => a.confidentialityLevel)))
          : [],
        hasOpenFlag: started && openFlags > 0,
        openFlagCount: started ? openFlags : 0,
        hasAccount: true,
        learnerType: "regular" as const,
        admExempt: admExempt.has(s.userId),
        academicGrade,
        grades: started
          ? s.finalGrades.map((f) => ({
              subject: f.subject.name,
              code: f.subject.code,
              computedAverage: f.computedAverage,
              transmutedGrade: f.transmutedGrade,
            }))
          : [],
        liveGrades: started ? liveGradesFor(s.userId) : [],
      };
    }),
    ...rosterOnly.map((r) => {
      const key = `roster:${r.id}`;
      const finals = finalsByRoster.get(r.id) ?? [];
      const att = attendanceByRoster.get(r.id) ?? [];
      const anec = anecdotalByRoster.get(r.id) ?? [];
      const enrolled = enrolledBySection.get(r.sectionId) ?? 0;
      const attTotal = attendanceTotalFor(sectionTotals, r.sectionId, r.id);
      const factors = computeRiskFactors({
        finalGrades: finals,
        rawAverages: rawAveragesFor(key),
        attendance: att,
        attendanceRate: attendanceRateFor(key),
        attendanceTotal: attTotal,
        anecdotalCount: anec.length,
        enrolled,
      });
      const activeFlags = toActiveFlags(factors);
      const present = att.filter((a) => a.status === "present").length;
      const ratedTotal = Math.max(attTotal ?? 0, att.length);
      const academicGrade = started ? computeGeneralAverage(finals) : null;
      return {
        studentId: key,
        name: r.fullName,
        lrn: r.lrn,
        mascot: r.mascot ?? null,
        birthdate: null,
        gender: null,
        section: r.section.name,
        riskLevel: started ? levelFromFlags(factors) : "Low",
        flags: started ? activeFlags : [],
        attendanceRate: started ? (ratedTotal === 0 ? 1 : present / ratedTotal) : 0,
        anecdotalCount: started ? anec.length : 0,
        confidentialityTiers: started
          ? Array.from(new Set(anec.map((a) => a.confidentialityLevel)))
          : [],
        hasOpenFlag: false,
        openFlagCount: 0,
        hasAccount: false,
        learnerType: r.learnerType,
        admExempt: false,
        academicGrade,
        grades: started
          ? finals.map((f) => ({
              subject: f.subject.name,
              code: f.subject.code,
              computedAverage: f.computedAverage,
              transmutedGrade: f.transmutedGrade,
            }))
          : [],
        liveGrades: started ? liveGradesFor(key) : [],
      };
    }),
  ];

  return {
    advisorySections: sections,
    termId,
    students,
    subjects: [...new Map(
      [...assignSubjects, ...entrySubjects].map((s) => [s.subject.name, s.subject]),
    ).values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Identity-only advisory roster for boards that render just the learner's name
 * and LRN (the advisory list). It skips every per-learner metric query — final
 * grades, attendance, anecdote, raw scores, section meetups — that `getStudents`
 * needs for its risk/grade columns. The one learner the adviser inspects gets
 * those figures from `getAdvisoryStudentRisk` instead, so the list paints as
 * soon as the identity rows land.
 */
export async function getAdvisoryIdentityList(ctx: AdvisoryContext) {
  const termId = ctx.termId;
  const sections = await adviserSectionsOr404(ctx.userId, ctx.schoolYearId);
  if (!termId) {
    return { advisorySections: sections, termId: null, students: [], subjects: [] };
  }

  const sectionIds = sections.map((s) => s.id);
  const [advisees, rosterEntries, archived] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { sectionId: { in: sectionIds } },
      select: {
        userId: true,
        lrn: true,
        mascot: true,
        birthdate: true,
        gender: true,
        sectionId: true,
        user: { select: { fullName: true } },
        section: { select: { name: true } },
      },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.studentRoster.findMany({
      where: { sectionId: { in: sectionIds } },
      select: {
        id: true,
        lrn: true,
        fullName: true,
        mascot: true,
        sectionId: true,
        learnerType: true,
        section: { select: { name: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    // Adviser-scoped soft delete: hidden learners stay off the board.
    prisma.adviserArchivedStudent.findMany({
      where: { teacherId: ctx.userId },
      select: { studentId: true, rosterId: true },
    }),
  ]);

  const archivedStudentIds = new Set(
    archived.map((a) => a.studentId).filter((id): id is string => !!id),
  );
  const archivedRosterIds = new Set(
    archived.map((a) => a.rosterId).filter((id): id is string => !!id),
  );
  const visibleAdvisees = advisees.filter((s) => !archivedStudentIds.has(s.userId));
  const visibleRosterEntries = rosterEntries.filter((r) => !archivedRosterIds.has(r.id));
  const registeredLrns = new Set(visibleAdvisees.map((s) => s.lrn));
  const rosterOnly = visibleRosterEntries.filter((r) => !registeredLrns.has(r.lrn));

  // The risk/grade fields are intentionally blank: the insight panel loads the
  // selected learner's live figures from its own endpoint.
  const students = [
    ...visibleAdvisees.map((s) => ({
      studentId: s.userId,
      name: s.user.fullName,
      lrn: s.lrn,
      mascot: s.mascot ?? null,
      birthdate: s.birthdate,
      gender: s.gender,
      section: s.section?.name ?? "",
      riskLevel: "Low" as const,
      flags: [] as ("academic" | "attendance" | "behavioral")[],
      attendanceRate: 0,
      anecdotalCount: 0,
      confidentialityTiers: [] as string[],
      hasOpenFlag: false,
      openFlagCount: 0,
      hasAccount: true,
      learnerType: "regular" as const,
      admExempt: false,
      grades: [] as { subject: string; code: string; computedAverage: number | null; transmutedGrade: number | null }[],
      liveGrades: [] as { subject: string; code: string; average: number }[],
    })),
    ...rosterOnly.map((r) => ({
      studentId: `roster:${r.id}`,
      name: r.fullName,
      lrn: r.lrn,
      mascot: r.mascot ?? null,
      birthdate: null,
      gender: null,
      section: r.section.name,
      riskLevel: "Low" as const,
      flags: [] as ("academic" | "attendance" | "behavioral")[],
      attendanceRate: 0,
      anecdotalCount: 0,
      confidentialityTiers: [] as string[],
      hasOpenFlag: false,
      openFlagCount: 0,
      hasAccount: false,
      learnerType: r.learnerType,
      admExempt: false,
      grades: [] as { subject: string; code: string; computedAverage: number | null; transmutedGrade: number | null }[],
      liveGrades: [] as { subject: string; code: string; average: number }[],
    })),
  ];

  return { advisorySections: sections, termId, students, subjects: [] };
}

/**
 * The live risk figures for one advisory learner (risk level, active factors
 * and the attendance rate the insight panel shows). Mirrors the computation in
 * `getStudents` exactly, but scoped to a single learner — so the advisory list
 * never has to recompute the whole section to badge the one row being opened.
 */
export async function getAdvisoryStudentRisk(ctx: AdvisoryContext, rawId: string) {
  const termId = ctx.termId;
  if (!termId) throw new AppError(404, "NO_ACTIVE_TERM", "No active term");

  const isRoster = rawId.startsWith("roster:");
  let sectionId: string;
  let key: string;
  let attendanceWhere: { studentId?: string; rosterId?: string };
  let rosters: { id: string; sectionId: string; learnerType: string; createdAt: Date } | null = null;

  if (isRoster) {
    const rosterId = rawId.slice("roster:".length);
    const entry = await prisma.studentRoster.findUnique({
      where: { id: rosterId },
      select: {
        id: true,
        sectionId: true,
        learnerType: true,
        createdAt: true,
        section: { select: { adviserId: true } },
      },
    });
    if (
      !entry ||
      entry.section.adviserId !== ctx.userId ||
      (await isArchivedAdvisoryLearner({ rosterId: entry.id }))
    ) {
      throw new AppError(404, "STUDENT_NOT_FOUND", "Student not found");
    }
    rosters = entry;
    sectionId = entry.sectionId;
    key = `roster:${entry.id}`;
    attendanceWhere = { rosterId: entry.id };
  } else {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: rawId },
      select: { userId: true, sectionId: true, section: { select: { adviserId: true } } },
    });
    if (
      !profile ||
      profile.section?.adviserId !== ctx.userId ||
      !profile.sectionId ||
      (await isArchivedAdvisoryLearner({ studentId: rawId }))
    ) {
      throw new AppError(404, "STUDENT_NOT_FOUND", "Student not found");
    }
    sectionId = profile.sectionId;
    key = profile.userId;
    attendanceWhere = { studentId: profile.userId };
  }

  const [term, finals, attendance, anecdotalCount, subjectRate, attendanceExempt, rawRows] =
    await Promise.all([
      prisma.term.findUnique({ where: { id: termId }, select: { startDate: true } }),
      isRoster
        ? prisma.finalGrade.findMany({
            where: { rosterId: rosters!.id, termId },
            select: { computedAverage: true, transmutedGrade: true },
          })
        : prisma.finalGrade.findMany({
            where: { studentId: key, termId },
            select: { computedAverage: true, transmutedGrade: true },
          }),
      prisma.attendanceRecord.findMany({
        where: { ...attendanceWhere, termId },
        select: { status: true },
      }),
      prisma.anecdotalRecord.count({
        where: { ...attendanceWhere, termId, deletedAt: null },
      }),
      learnerSubjectAverageAttendance(
        isRoster ? { rosterId: rosters!.id } : { studentId: key },
        sectionId,
        termId,
      ),
      isRoster ? Promise.resolve(false) : isAdmExempt(key, termId),
      prisma.studentGrade.findMany({
        where: {
          ...attendanceWhere,
          assessment: { gradeComponent: { termId } },
        },
        select: {
          percentageScore: true,
          assessment: { select: { gradeComponent: { select: { subjectId: true } } } },
        },
      }),
    ]);

  // Per-subject raw averages — the same input `getStudents` feeds the engine.
  const perSubject = new Map<string, { sum: number; count: number }>();
  for (const row of rawRows) {
    const subjectId = row.assessment.gradeComponent.subjectId;
    const cell = perSubject.get(subjectId) ?? { sum: 0, count: 0 };
    cell.sum += row.percentageScore;
    cell.count += 1;
    perSubject.set(subjectId, cell);
  }
  const rawAverages = [...perSubject.values()].map((cell) => cell.sum / cell.count);

  const [sectionTotals, headcounts] = await Promise.all([
    sectionAttendanceTotals([sectionId], termId),
    sectionHeadcounts([sectionId]),
  ]);
  const enrolled = headcounts.get(sectionId) ?? 0;

  const present = attendance.filter((r) => r.status === "present").length;
  const attendanceTotal = isRoster
    ? attendanceTotalFor(sectionTotals, sectionId, rosters!.id)
    : sectionTotals.get(sectionId);
  const ratedTotal = Math.max(attendanceTotal ?? 0, attendance.length);

  const started = termHasStarted(term?.startDate);
  const factors = computeRiskFactors({
    finalGrades: finals,
    rawAverages,
    attendance,
    attendanceRate: subjectRate && subjectRate.hasSubjectData ? subjectRate.average : null,
    attendanceTotal,
    anecdotalCount,
    enrolled,
    attendanceExempt,
  });

  const flags: ("academic" | "attendance" | "behavioral")[] = [];
  if (factors.academicFlag) flags.push("academic");
  if (factors.attendanceFlag) flags.push("attendance");
  if (factors.behavioralFlag) flags.push("behavioral");

  return {
    riskLevel: started ? levelFromFlags(factors) : "Low",
    flags: started ? flags : [],
    attendanceRate: started ? (ratedTotal === 0 ? 1 : present / ratedTotal) : 0,
  };
}
