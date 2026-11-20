import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { fanoutNotification, fanoutToRole } from "../../lib/notify.js";
import { invalidateTags } from "../../lib/cache.js";
import { CACHE_TAGS } from "../../lib/cacheTags.js";
import { gradeToNumber } from "../../modules/teacher/teacher.repository.js";
import { resolveTeacherClassPairs } from "./timetable.read.service.js";
import { isMascotCharacter } from "../mascot.js";
import type { TeacherContext } from "./teacher.types.js";

export async function listAdviserSections(ctx: TeacherContext) {
  const teacherId = ctx.userId;
  const termId = ctx.termId;
  const yearId = ctx.schoolYearId;
  const sectionWhere = yearId ? { schoolYearId: yearId } : {};
  const [sections, scheduled] = await Promise.all([
    prisma.section.findMany({
      where: sectionWhere,
      orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        gradeLevel: true,
        adviserLabel: true,
        adviserCode: true,
        adviserId: true,
        adviser: { select: { fullName: true } },
      },
    }),
    termId
      ? prisma.sectionTimetableEntry.findMany({
          where: { termId },
          select: { sectionId: true },
          distinct: ["sectionId"],
        })
      : Promise.resolve([] as { sectionId: string }[]),
  ]);
  const scheduledIds = new Set(scheduled.map((s) => s.sectionId));
  return {
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      gradeLevel: s.gradeLevel,
      gradeNumber: gradeToNumber(s.gradeLevel),
      adviserLabel: (s as { adviserLabel?: string | null }).adviserLabel ?? "",
      claimable: s.adviserId === null,
      advisedByMe: s.adviserId === teacherId,
      holderName: s.adviserId && s.adviserId !== teacherId ? (s.adviser?.fullName ?? null) : null,
      inMasterSchedule: scheduledIds.has(s.id),
      hasCode: !!((s as { adviserCode?: string | null }).adviserCode ?? null),
    })),
  };
}

export async function readProfileSettings(teacherId: string) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: teacherId },
      select: { fullName: true },
    }),
    prisma.staffProfile.findUnique({
      where: { userId: teacherId },
      select: { photoUrl: true, mascot: true, primaryColor: true, secondaryColor: true, shareStudentData: true, shareUpdatedAt: true },
    }),
  ]);
  return {
    fullName: user?.fullName ?? "",
    photoUrl: profile?.photoUrl ?? null,
    mascot: profile?.mascot ?? null,
    primaryColor: profile?.primaryColor ?? null,
    secondaryColor: profile?.secondaryColor ?? null,
    shareStudentData: profile?.shareStudentData ?? false,
    shareUpdatedAt: profile?.shareUpdatedAt ?? null,
  };
}

export interface UpdateProfileSettingsInput {
  fullName?: string;
  mascot?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

export async function updateProfileSettings(ctx: TeacherContext, input: UpdateProfileSettingsInput) {
  const teacherId = ctx.userId;
  const { fullName, mascot, primaryColor, secondaryColor } = input;
  if (mascot !== undefined && mascot !== null && !isMascotCharacter(mascot)) {
    throw new AppError(400, "INVALID_MASCOT", "Unknown mascot character.");
  }
  await prisma.$transaction(async (tx) => {
    if (fullName !== undefined) {
      await tx.user.update({
        where: { id: teacherId },
        data: { fullName },
      });
    }
    const palette: { primaryColor?: string | null; secondaryColor?: string | null; mascot?: string | null } = {};
    if (primaryColor !== undefined) palette.primaryColor = primaryColor;
    if (secondaryColor !== undefined) palette.secondaryColor = secondaryColor;
    if (mascot !== undefined) palette.mascot = mascot;
    if (Object.keys(palette).length > 0) {
      await tx.staffProfile.upsert({
        where: { userId: teacherId },
        update: palette,
        create: {
          userId: teacherId,
          employeeId: `T-${teacherId.slice(0, 8)}`,
          ...palette,
        },
      });
    }
  });
  await writeAudit({
    userId: teacherId,
    actionType: "update",
    sourceTable: "staff_profiles",
    sourceId: teacherId,
    reason: "Teacher updated profile settings",
  });
  return readProfileSettings(teacherId);
}

export async function updateProfilePhoto(ctx: TeacherContext, photoUrl: string) {
  const teacherId = ctx.userId;
  await prisma.staffProfile.upsert({
    where: { userId: teacherId },
    update: { photoUrl },
    create: {
      userId: teacherId,
      employeeId: `T-${teacherId.slice(0, 8)}`,
      photoUrl,
    },
  });
  await writeAudit({
    userId: teacherId,
    actionType: "update",
    sourceTable: "staff_profiles",
    sourceId: teacherId,
    reason: "Teacher updated profile photo",
  });
  return { photoUrl };
}

export async function readDataSharing(teacherId: string, termId: string | null) {
  const [profile, advised, pairs] = await Promise.all([
    prisma.staffProfile.findUnique({
      where: { userId: teacherId },
      select: { shareStudentData: true, shareUpdatedAt: true },
    }),
    prisma.section.findMany({
      where: { adviserId: teacherId },
      select: { id: true },
    }),
    // Handled classes come from the code link entered on /teacher/classes
    // (TeacherName.userId), exactly like My Classes/Grading/Attendance.
    // TeacherSubjectAssignment rows are academics-desk rows and do not mean
    // this login has linked the class, so they are not listed here.
    termId ? resolveTeacherClassPairs(teacherId, termId) : Promise.resolve([]),
  ]);
  // Handled classes only — never the teacher's own advisory-section classes.
  const advisedIds = new Set(advised.map((s) => s.id));
  const seen = new Map<string, { subject: string; section: string }>();
  for (const p of pairs) {
    if (advisedIds.has(p.sectionId)) continue;
    const key = `${p.subject.name}|${p.section.name}`;
    if (!seen.has(key)) seen.set(key, { subject: p.subject.name, section: p.section.name });
  }
  return {
    shareStudentData: profile?.shareStudentData ?? false,
    shareUpdatedAt: profile?.shareUpdatedAt ?? null,
    handledClasses: [...seen.values()],
  };
}

export async function setDataSharing(ctx: TeacherContext, share: boolean) {
  const teacherId = ctx.userId;
  const now = new Date();
  await prisma.staffProfile.upsert({
    where: { userId: teacherId },
    update: { shareStudentData: share, shareUpdatedAt: now },
    create: {
      userId: teacherId,
      employeeId: `T-${teacherId.slice(0, 8)}`,
      shareStudentData: share,
      shareUpdatedAt: now,
    },
  });
  await writeAudit({
    userId: teacherId,
    actionType: "update",
    sourceTable: "staff_profiles",
    sourceId: teacherId,
    reason: share
      ? "Teacher enabled student-data sharing (Connect/Sync ON)"
      : "Teacher disabled student-data sharing (Connect/Sync OFF)",
  });
  void fanoutNotification({
    userId: teacherId,
    sourceTable: "staff_profiles",
    action: "data_share",
    sourceId: teacherId,
    message: share
      ? "Student-data sharing is ON — your adviser, guidance, and allowed roles now see your grades/attendance in real-time."
      : "Student-data sharing is OFF — only you see the grades/attendance you encode.",
  });
  if (share) {
    void fanoutToRole("principal", {
      sourceTable: "staff_profiles",
      action: "data_share_on",
      sourceId: teacherId,
      excludeUserId: teacherId,
      message: "A teacher enabled student-data sharing.",
    });
    // Connect/Sync flipped ON — re-run the engine now so the adviser's
    // advisees can be auto-detected without waiting for the hourly sweep.
    if (ctx.termId) void recomputeAdvisedRisk(teacherId, ctx.termId);
  }
  // The principal's overview/risk boards are adviser-share gated — drop the
  // cached overview and risk boards so the toggle is reflected on the next
  // load (the overview rail reads /api/risk/board separately). The academics
  // summary (section cards + roster) is gated the same way.
  await invalidateTags([
    CACHE_TAGS.overview,
    CACHE_TAGS.risk,
    CACHE_TAGS.academics,
    CACHE_TAGS.attendance,
  ]);
  return readDataSharing(teacherId, ctx.termId);
}

async function recomputeAdvisedRisk(teacherId: string, termId: string) {
  const { recomputeRisk, recomputeRosterRisk } = await import("../risk.js");
  const sections = await prisma.section.findMany({
    where: { adviserId: teacherId },
    select: { id: true },
  });
  const sectionIds = sections.map((s) => s.id);
  if (sectionIds.length === 0) return;

  const [profiles, rosters] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { sectionId: { in: sectionIds } },
      select: { userId: true },
    }),
    prisma.studentRoster.findMany({
      where: { sectionId: { in: sectionIds } },
      select: { id: true },
    }),
  ]);
  await Promise.allSettled([
    ...profiles.map((p) => recomputeRisk(p.userId, termId)),
    ...rosters.map((r) => recomputeRosterRisk(r.id, termId)),
  ]);
}
