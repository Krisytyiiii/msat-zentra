"use client";

import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import type { PillTone } from "@/components/ui/pill";

/* The enrolled desk keeps the same three monitoring lanes the board used, so
   the split list's status column, tab counts and pill tones stay identical. */
export type LaneKey = "not_released" | "in_progress" | "complete";
export type LaneFilter = "all" | LaneKey;

export interface Lane {
  key: LaneKey;
  title: string;
  tone: PillTone;
  /** Left rail tint of the list row (matches the pill family). */
  tint: string;
}

export const LANES: Record<LaneKey, Lane> = {
  not_released: {
    key: "not_released",
    title: "Not released",
    tone: "neutral",
    tint: "#94a3b8",
  },
  in_progress: {
    key: "in_progress",
    title: "In progress",
    tone: "blue",
    tint: "#3b82f6",
  },
  complete: { key: "complete", title: "Complete", tone: "green", tint: "#22c55e" },
};

/** Status is derived from module counts — the monitoring signal.
    A case the coordinator already completed always reads "Complete". */
export function laneFor(row: AdmCaseRow): LaneKey {
  if (row.stage === "completion") return "complete";
  const hasData =
    typeof row.modulesSubmitted === "number" &&
    typeof row.modulesTotal === "number";
  if (!hasData) return "not_released";
  const total = row.modulesTotal ?? 0;
  const submitted = row.modulesSubmitted ?? 0;
  if (total === 0) return "not_released";
  return submitted >= total ? "complete" : "in_progress";
}

export function moduleProgress(row: AdmCaseRow) {
  const hasData =
    typeof row.modulesSubmitted === "number" &&
    typeof row.modulesTotal === "number";
  const submitted = row.modulesSubmitted ?? 0;
  const total = row.modulesTotal ?? 0;
  const percent =
    hasData && total > 0
      ? Math.min(100, Math.round((submitted / total) * 100))
      : 0;
  return { submitted, total, percent, hasData };
}

/** A pre-profile referral has no ADM case file, so it can't open monitoring. */
export function canOpenMonitoring(row: AdmCaseRow): boolean {
  return !row.id.startsWith("referral:");
}
