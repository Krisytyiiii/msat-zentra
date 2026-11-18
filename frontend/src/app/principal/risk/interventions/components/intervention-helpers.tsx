import type { RiskSnapshotStudent } from "../types";

export function planStatus(s: RiskSnapshotStudent): string {
  // Ongoing only once guidance books a session; a bare intervention record is
  // still "no plan yet".
  return (s.intervention?.sessions.length ?? 0) > 0 ? "ongoing" : "none";
}

export function canAlert(s: RiskSnapshotStudent): boolean {
  return !s.intervention || s.intervention.outcomeStatus === "unresolved";
}
