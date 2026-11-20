import { prisma } from "./prisma.js";

/**
 * One active day-shape preset per school year. Readers (admin board, principal
 * view, teacher attendance slots) all resolve through here so switching the
 * active preset re-times every consumer at once. A year with no preset yet
 * returns null and the caller falls back to `SCHEDULE_CONFIG_DEFAULTS`.
 */
export function activeScheduleConfigForYear(schoolYearId: string) {
  return prisma.scheduleConfig.findFirst({
    where: { schoolYearId, isActive: true },
  });
}

export async function activeScheduleConfigForTerm(termId: string) {
  const term = await prisma.term.findUnique({
    where: { id: termId },
    select: { schoolYearId: true },
  });
  if (!term) return null;
  return activeScheduleConfigForYear(term.schoolYearId);
}
