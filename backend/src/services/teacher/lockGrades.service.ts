import { prisma } from "../../lib/prisma.js";
import { findTeacherTermGrant } from "../../lib/teacherGrant.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedLearnerRows,
  excludeArchivedProfiles,
  excludeArchivedRosters,
} from "../../lib/learnerVisibility.js";
import { sectionHeadcounts } from "../enrollment.js";
import { GRADE_LABELS } from "../../modules/teacher/teacher.repository.js";
import {
  canBypassSharing,
  resolveGradeOwnerIds,
  sharingMap,
} from "./dataShare.service.js";
import { resolveTeacherClassPairs } from "./timetable.read.service.js";
import type { TeacherContext } from "./teacher.types.js";

export type LockGradesView = "classes" | "advisees";

type LockStatus = "unlocked" | "locked" | "adviser_approved";

export interface LockGradesClassRow {
  id: string;
  subjectId: string;
  subject: string;
  subjectCode: string;
  sectionId: string;
  section: string;
  gradeLevel: string;
  learners: number;
  computed: number;
  ready: number;
  locked: number;
  approved: number;
}

export interface LockGradesSubjectRow {
  subject: string;
  subjectId: string;
  computedAverage: number | null;
  transmutedGrade: number | null;
  remarks: string | null;
  lockStatus: string | null;
  hiddenByTeacher?: boolean;
}

export interface LockGradesAdviseeRow {
  studentId: string;
  name: string;
  lrn: string;
  section: string;
  sectionId: string;
  hasAccount: boolean;
  subjects: LockGradesSubjectRow[];
  summary: {
    subjects: number;
    graded: number;
    locked: number;
    approved: number;
  };
}

function emptyResult(
  view: LockGradesView,
  isAdviser: boolean,
  advisorySections: { id: string; name: string; gradeLevel: string }[],
) {
  return {
    view,
    termId: null,
    isSubjectTeacher: false,
    isAdviser,
    gates: { linked: false, termGrant: false },
    classes: [] as LockGradesClassRow[],
    advisorySections,
    learners: [] as LockGradesAdviseeRow[],
    advisees: [] as LockGradesAdviseeRow[],
  };
}

async function getClassRows(
  termId: string,
  linkedPairs: {
    subjectId: string;
    sectionId: string;
    subject: { name: string; code: string };
    section: { name: string; gradeLevel: string };
  }[],
) {
  const sectionIds = [...new Set(linkedPairs.map((p) => p.sectionId))];
  const subjectIds = [...new Set(linkedPairs.map((p) => p.subjectId))];

  // Grades of learners their adviser removed stay untouched, so they must not
  // inflate `ready`/`locked` here either — otherwise the board keeps offering
  // a lock that the batch route (correctly) refuses to touch.
  const archivedLearners = await archivedAdvisoryLearnerIds();
  const [headcounts, finals, profiles, rosters] = await Promise.all([
    sectionHeadcounts(sectionIds),
    prisma.finalGrade.findMany({
      where: {
        termId,
        subjectId: { in: subjectIds },
        ...excludeArchivedLearnerRows(archivedLearners),
      },
      select: {
        subjectId: true,
        computedAverage: true,
        transmutedGrade: true,
        remarks: true,
        lockStatus: true,
        studentId: true,
        rosterId: true,
        subject: { select: { id: true, name: true } },
        student: {
          select: {
            userId: true,
            lrn: true,
            sectionId: true,
            user: { select: { fullName: true } },
            section: { select: { name: true } },
          },
        },
        roster: {
          select: {
            id: true,
            lrn: true,
            fullName: true,
            sectionId: true,
            section: { select: { name: true } },
          },
        },
      },
    }),
    prisma.studentProfile.findMany({
      where: {
        sectionId: { in: sectionIds },
        ...excludeArchivedProfiles(archivedLearners),
      },
      select: {
        userId: true,
        lrn: true,
        sectionId: true,
        user: { select: { fullName: true } },
        section: { select: { name: true } },
      },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.studentRoster.findMany({
      where: {
        sectionId: { in: sectionIds },
        ...excludeArchivedRosters(archivedLearners),
      },
      select: {
        id: true,
        lrn: true,
        fullName: true,
        sectionId: true,
        section: { select: { name: true } },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const byClass = new Map<
    string,
    { computed: number; ready: number; locked: number; approved: number }
  >();
  for (const f of finals) {
    const sectionId = f.student?.sectionId ?? f.roster?.sectionId ?? null;
    if (!sectionId) continue;
    const key = `${f.subjectId}|${sectionId}`;
    const cell = byClass.get(key) ?? { computed: 0, ready: 0, locked: 0, approved: 0 };
    if (f.computedAverage != null) cell.computed += 1;
    if (f.lockStatus === "locked") cell.locked += 1;
    else if (f.lockStatus === "adviser_approved") cell.approved += 1;
    else if (f.computedAverage != null) cell.ready += 1;
    byClass.set(key, cell);
  }

  const classes = linkedPairs
    .map((p) => {
      const key = `${p.subjectId}|${p.sectionId}`;
      const cell = byClass.get(key) ?? { computed: 0, ready: 0, locked: 0, approved: 0 };
      return {
        id: key,
        subjectId: p.subjectId,
        subject: p.subject.name,
        subjectCode: p.subject.code,
        sectionId: p.sectionId,
        section: p.section.name,
        gradeLevel: GRADE_LABELS[p.section.gradeLevel] ?? p.section.gradeLevel,
        learners: headcounts.get(p.sectionId) ?? 0,
        ...cell,
      } satisfies LockGradesClassRow;
    })
    .sort(
      (a, b) =>
        a.section.localeCompare(b.section) || a.subject.localeCompare(b.subject),
    );

  // --- Learner lock board ------------------------------------------------
  // One row per learner with a card per subject this teacher actually teaches
  // in their section, so the classes desk can list lock statuses the same way
  // the advisory desk does. Only this teacher's own pairs are read, so the
  // data-sharing hide rule (adviser view) does not apply.
  const subjectsBySection = new Map<string, Map<string, string>>();
  for (const pair of linkedPairs) {
    const perSection = subjectsBySection.get(pair.sectionId) ?? new Map<string, string>();
    perSection.set(pair.subjectId, pair.subject.name);
    subjectsBySection.set(pair.sectionId, perSection);
  }

  const finalsByLearner = new Map<
    string,
    Map<string, { subject: string; computedAverage: number | null; transmutedGrade: number | null; remarks: string | null; lockStatus: string | null }>
  >();
  for (const f of finals) {
    const learnerKey = f.studentId ? f.studentId : f.rosterId ? `roster:${f.rosterId}` : null;
    if (!learnerKey) continue;
    const map = finalsByLearner.get(learnerKey) ?? new Map();
    map.set(f.subjectId, {
      subject: f.subject.name,
      computedAverage: f.computedAverage,
      transmutedGrade: f.transmutedGrade,
      remarks: f.remarks,
      lockStatus: f.lockStatus,
    });
    finalsByLearner.set(learnerKey, map);
  }

  const buildLearnerRow = (
    sectionId: string,
    learnerKey: string,
  ): LockGradesAdviseeRow => {
    const finalsForLearner = finalsByLearner.get(learnerKey) ?? new Map();
    const sectionSubjects = subjectsBySection.get(sectionId) ?? new Map();
    const subjectIds = new Set<string>([...sectionSubjects.keys(), ...finalsForLearner.keys()]);
    const subjects = [...subjectIds]
      .map((subjectId): LockGradesSubjectRow => {
        const final = finalsForLearner.get(subjectId);
        return {
          subject: final?.subject ?? sectionSubjects.get(subjectId) ?? "Subject",
          subjectId,
          computedAverage: final?.computedAverage ?? null,
          transmutedGrade: final?.transmutedGrade ?? null,
          remarks: final?.remarks ?? null,
          lockStatus: final?.lockStatus ?? null,
        };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));

    return {
      studentId: learnerKey,
      name: "",
      lrn: "",
      section: "",
      sectionId,
      hasAccount: !learnerKey.startsWith("roster:"),
      subjects,
      summary: {
        subjects: subjects.length,
        graded: subjects.filter((s) => s.computedAverage !== null).length,
        locked: subjects.filter((s) => s.lockStatus === "locked").length,
        approved: subjects.filter((s) => s.lockStatus === "adviser_approved").length,
      },
    };
  };

  const registeredLrns = new Set(profiles.map((p) => p.lrn));
  const rosterOnly = rosters.filter((r) => !registeredLrns.has(r.lrn));
  const learners: LockGradesAdviseeRow[] = [
    ...profiles.map((p) => ({
      ...buildLearnerRow(p.sectionId ?? "", p.userId),
      name: p.user.fullName,
      lrn: p.lrn,
      section: p.section?.name ?? "",
    })),
    ...rosterOnly.map((r) => ({
      ...buildLearnerRow(r.sectionId, `roster:${r.id}`),
      name: r.fullName,
      lrn: r.lrn,
      section: r.section?.name ?? "",
    })),
  ].sort(
    (a, b) =>
      a.section.localeCompare(b.section) || a.name.localeCompare(b.name),
  );

  return { classes, learners };
}

export async function getLockGrades(ctx: TeacherContext, view: LockGradesView) {
  const teacherId = ctx.userId;
  const termId = ctx.termId;

  const advisorySections = await prisma.section.findMany({
    where: {
      adviserId: teacherId,
      ...(ctx.schoolYearId ? { schoolYearId: ctx.schoolYearId } : {}),
    },
    select: { id: true, name: true, gradeLevel: true },
    orderBy: { name: "asc" },
  });
  const isAdviser = advisorySections.length > 0;

  if (!termId) {
    return emptyResult(view, isAdviser, advisorySections);
  }

  if (view === "classes") {
    // Link gate is the TeacherName claim (same source as /schedule/teachers/me),
    // not the timetable: linked teachers with no schedule rows still pass the
    // gate and land on the "no classes" desk, and a teacher who linked on the
    // classes page never sees the Link code card again.
    const [mine, termGrant, assignmentCount] = await Promise.all([
      prisma.teacherName.findUnique({
        where: { userId: teacherId },
        select: { id: true },
      }),
      findTeacherTermGrant(teacherId, termId),
      prisma.teacherSubjectAssignment.count({ where: { teacherId, termId } }),
    ]);

    if (!mine) {
      return {
        view,
        termId,
        isSubjectTeacher: assignmentCount > 0,
        isAdviser,
        gates: { linked: false, termGrant: false },
        classes: [] as LockGradesClassRow[],
        advisorySections,
        learners: [] as LockGradesAdviseeRow[],
        advisees: [] as LockGradesAdviseeRow[],
      };
    }

    if (!termGrant) {
      return {
        view,
        termId,
        isSubjectTeacher: true,
        isAdviser,
        gates: { linked: true, termGrant: false },
        classes: [] as LockGradesClassRow[],
        advisorySections,
        learners: [] as LockGradesAdviseeRow[],
        advisees: [] as LockGradesAdviseeRow[],
      };
    }

    // The class list carries across the terms of a school year (same rule as
    // the classes/grading desks), but the lock counts below are read with the
    // *selected* termId — another term's lock grades are never shown here.
    const linkedPairs = await resolveTeacherClassPairs(teacherId, termId);
    const isSubjectTeacher = linkedPairs.length > 0 || assignmentCount > 0;

    const { classes, learners } = await getClassRows(termId, linkedPairs);
    return {
      view,
      termId,
      isSubjectTeacher,
      isAdviser,
      gates: { linked: true, termGrant: true },
      classes,
      advisorySections,
      learners,
      advisees: [] as LockGradesAdviseeRow[],
    };
  }

  // --- My Advisees: read-only lock-status board -------------------------
  if (advisorySections.length === 0) {
    return {
      view,
      termId,
      isSubjectTeacher: false,
      isAdviser: false,
      gates: { linked: false, termGrant: false },
      classes: [] as LockGradesClassRow[],
      advisorySections,
      learners: [] as LockGradesAdviseeRow[],
      advisees: [] as LockGradesAdviseeRow[],
    };
  }

  const sectionIds = advisorySections.map((s) => s.id);
  const archivedLearners = await archivedAdvisoryLearnerIds();
  const [advisees, rosterEntries, assignRows, entryRows] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { sectionId: { in: sectionIds }, ...excludeArchivedProfiles(archivedLearners) },
      select: {
        userId: true,
        lrn: true,
        mascot: true,
        sectionId: true,
        user: { select: { fullName: true } },
        section: { select: { id: true, name: true } },
      },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.studentRoster.findMany({
      where: { sectionId: { in: sectionIds }, ...excludeArchivedRosters(archivedLearners) },
      select: {
        id: true,
        lrn: true,
        fullName: true,
        mascot: true,
        sectionId: true,
        section: { select: { id: true, name: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.teacherSubjectAssignment.findMany({
      where: { sectionId: { in: sectionIds }, termId },
      select: {
        sectionId: true,
        subject: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.sectionTimetableEntry.findMany({
      where: { sectionId: { in: sectionIds }, termId },
      select: {
        sectionId: true,
        subject: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);

  const registeredLrns = new Set(advisees.map((s) => s.lrn));
  const rosterOnly = rosterEntries.filter((r) => !registeredLrns.has(r.lrn));
  const profileIds = advisees.map((s) => s.userId);
  const rosterIds = rosterOnly.map((r) => r.id);

  const [profileFinals, rosterFinals] = await Promise.all([
    profileIds.length > 0
      ? prisma.finalGrade.findMany({
          where: { termId, studentId: { in: profileIds } },
          select: {
            id: true,
            studentId: true,
            subjectId: true,
            computedAverage: true,
            transmutedGrade: true,
            remarks: true,
            lockStatus: true,
            subject: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
    rosterIds.length > 0
      ? prisma.finalGrade.findMany({
          where: { termId, rosterId: { in: rosterIds } },
          select: {
            id: true,
            rosterId: true,
            subjectId: true,
            computedAverage: true,
            transmutedGrade: true,
            remarks: true,
            lockStatus: true,
            subject: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Section → subject map (assignments + timetable entries, like the
  // advisory list board).
  const subjectsBySection = new Map<string, Map<string, { name: string }>>();
  for (const row of [...assignRows, ...entryRows]) {
    if (!row.sectionId) continue;
    const perSection = subjectsBySection.get(row.sectionId) ?? new Map();
    perSection.set(row.subject.id, { name: row.subject.name });
    subjectsBySection.set(row.sectionId, perSection);
  }

  // Sharing visibility: one owner lookup per section × subject.
  const ownerCache = new Map<string, string[]>();
  const ownerTasks: Promise<void>[] = [];
  for (const [sectionId, subjects] of subjectsBySection) {
    for (const subjectId of subjects.keys()) {
      const cacheKey = `${sectionId}|${subjectId}`;
      ownerTasks.push(
        resolveGradeOwnerIds(subjectId, sectionId, termId).then((owners) => {
          ownerCache.set(cacheKey, owners);
        }),
      );
    }
  }
  await Promise.all(ownerTasks);
  const allOwners = [...new Set([...ownerCache.values()].flat())];
  const shareByTeacher = await sharingMap(allOwners);

  const hiddenSet = new Set<string>();
  for (const [key, owners] of ownerCache) {
    if (owners.length === 0) continue;
    if (canBypassSharing(ctx.role, teacherId, owners)) continue;
    const anyShared = owners.some((id) => shareByTeacher.get(id) === true);
    if (!anyShared) hiddenSet.add(key);
  }

  type FinalRow = {
    subjectId: string;
    computedAverage: number | null;
    transmutedGrade: number | null;
    remarks: string | null;
    lockStatus: string | null;
    subject: { id: string; name: string };
  };
  const finalsByKey = new Map<string, Map<string, FinalRow>>();
  for (const f of profileFinals) {
    const map = finalsByKey.get(f.studentId as string) ?? new Map<string, FinalRow>();
    map.set(f.subjectId, f);
    finalsByKey.set(f.studentId as string, map);
  }
  for (const f of rosterFinals) {
    const key = `roster:${f.rosterId}`;
    const map = finalsByKey.get(key) ?? new Map<string, FinalRow>();
    map.set(f.subjectId, f);
    finalsByKey.set(key, map);
  }

  const buildRow = (
    sectionId: string,
    studentKey: string,
    sectionSubjects: Map<string, { name: string }>,
  ): LockGradesAdviseeRow => {
    const finals = finalsByKey.get(studentKey) ?? new Map<string, FinalRow>();
    const subjectIds = new Set<string>([
      ...sectionSubjects.keys(),
      ...finals.keys(),
    ]);
    const subjects = [...subjectIds]
      .map((subjectId): LockGradesSubjectRow => {
        const hidden = hiddenSet.has(`${sectionId}|${subjectId}`);
        const final = finals.get(subjectId);
        const name =
          final?.subject.name ?? sectionSubjects.get(subjectId)?.name ?? "Subject";
        if (hidden) {
          return {
            subject: name,
            subjectId,
            computedAverage: null,
            transmutedGrade: null,
            remarks: null,
            lockStatus: null,
            hiddenByTeacher: true,
          };
        }
        return {
          subject: name,
          subjectId,
          computedAverage: final?.computedAverage ?? null,
          transmutedGrade: final?.transmutedGrade ?? null,
          remarks: final?.remarks ?? null,
          lockStatus: final?.lockStatus ?? null,
        };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));

    return {
      studentId: studentKey,
      name: "",
      lrn: "",
      section: "",
      sectionId,
      hasAccount: !studentKey.startsWith("roster:"),
      subjects,
      summary: {
        subjects: subjects.length,
        graded: subjects.filter(
          (s) => s.computedAverage !== null && !s.hiddenByTeacher,
        ).length,
        locked: subjects.filter((s) => s.lockStatus === "locked").length,
        approved: subjects.filter((s) => s.lockStatus === "adviser_approved")
          .length,
      },
    };
  };

  const adviseeRows: LockGradesAdviseeRow[] = [
    ...advisees.map((s) => {
      const row = buildRow(
        s.sectionId ?? "",
        s.userId,
        subjectsBySection.get(s.sectionId ?? "") ?? new Map(),
      );
      return {
        ...row,
        name: s.user.fullName,
        lrn: s.lrn,
        section: s.section?.name ?? "",
      };
    }),
    ...rosterOnly.map((r) => {
      const row = buildRow(
        r.sectionId,
        `roster:${r.id}`,
        subjectsBySection.get(r.sectionId) ?? new Map(),
      );
      return {
        ...row,
        name: r.fullName,
        lrn: r.lrn,
        section: r.section?.name ?? "",
      };
    }),
  ].sort(
    (a, b) =>
      a.section.localeCompare(b.section) || a.name.localeCompare(b.name),
  );

  return {
    view,
    termId,
    isSubjectTeacher: false,
    isAdviser: true,
    gates: { linked: false, termGrant: false },
    classes: [] as LockGradesClassRow[],
    advisorySections,
    learners: [] as LockGradesAdviseeRow[],
    advisees: adviseeRows,
  };
}
