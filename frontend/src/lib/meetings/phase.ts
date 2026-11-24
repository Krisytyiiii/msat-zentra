/**
 * One clock for every meeting surface (coordinator case card, referrals board
 * chip, booking reminders). Two copies of this window drifted before: the card
 * called a just-started meeting "Live now" while the reminder stack already
 * called it "Overdue — still unattended" for the same record.
 */
export const MEETING_JOIN_EARLY_MS = 15 * 60_000;
export const MEETING_LENGTH_MS = 60 * 60_000;

export type MeetingPhase = "upcoming" | "live" | "overdue";

export function meetingPhase(startMs: number, now: number): MeetingPhase | null {
  if (!Number.isFinite(startMs)) return null;
  if (now < startMs - MEETING_JOIN_EARLY_MS) return "upcoming";
  return now <= startMs + MEETING_LENGTH_MS ? "live" : "overdue";
}
