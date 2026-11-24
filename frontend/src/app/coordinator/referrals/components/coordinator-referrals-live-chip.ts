import type { AdmMeeting } from "@/services/coordinator/coordinator.types";
import {
  MEETING_JOIN_EARLY_MS,
  meetingPhase,
} from "@/lib/meetings/phase";

export const JOIN_EARLY_MS = MEETING_JOIN_EARLY_MS;
export const MEETING_LEN_MS = 60 * 60_000;

export function liveChip(
  m: Pick<AdmMeeting, "meetingDatetime" | "attended">,
  now: number,
): "live" | "overdue" | null {
  if (m.attended) return null;
  const start = new Date(m.meetingDatetime).getTime();
  const phase = meetingPhase(start, now);
  if (phase === "live" || phase === "overdue") return phase;
  return null;
}
