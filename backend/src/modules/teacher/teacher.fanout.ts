import { prisma } from "../../lib/prisma.js";
import { fanoutNotification } from "../../lib/notify.js";

/** Notify every teacher of a section (assigned, timetabled, or its adviser). */
export async function notifySectionTeachersScheduleChanged(
  sectionId: string | null,
  termId: string | null,
  reason: string,
  excludeUserId?: string,
) {
  try {
    if (!sectionId) return;
    const [assignments, timetableTeachers, sec] = await Promise.all([
      termId
        ? prisma.teacherSubjectAssignment.findMany({ where: { sectionId, termId }, select: { teacherId: true } })
        : prisma.teacherSubjectAssignment.findMany({ where: { sectionId }, select: { teacherId: true } }),
      termId
        ? prisma.sectionTimetableEntry.findMany({ where: { sectionId, termId }, select: { teacherName: { select: { userId: true } } } })
        : prisma.sectionTimetableEntry.findMany({ where: { sectionId }, select: { teacherName: { select: { userId: true } } } }),
      prisma.section.findUnique({ where: { id: sectionId }, select: { name: true, adviserId: true } }),
    ]);
    const ids = new Set<string>();
    for (const a of assignments) ids.add(a.teacherId);
    for (const t of timetableTeachers) {
      const uid = (t.teacherName as { userId?: string | null } | null)?.userId;
      if (uid) ids.add(uid);
    }
    if (sec?.adviserId) ids.add(sec.adviserId);
    if (excludeUserId) ids.delete(excludeUserId);
    const label = sec?.name ?? "your section";
    await Promise.all(
      [...ids].map((uid) =>
        fanoutNotification({
          userId: uid,
          sourceTable: "section_timetable_entries",
          action: "schedule_update",
          sourceId: sectionId,
          message: `${reason} (${label}).`,
        }),
      ),
    );
  } catch {

  }
}
