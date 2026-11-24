"use client";

import {
  FilterTabs,
  type FilterTabOption,
} from "@/components/ui/filter-tabs";
import type { GuidanceReferralsSummary } from "@/services/guidance/guidance.types";
import {
  ADM_MENU,
  COUNSELING_MENU,
  trackMenuCounts,
  type GuidanceAction,
  type GuidanceActionValue,
  type GuidanceTrack,
} from "./guidance-referrals-format";

/* Dot tone per action — the same palette the nurse ADM / clinic banks use
   (amber = needs a look, green = cleared/endorsed, blue = scheduled, red =
   rejected, neutral = closed out). */
const ACTION_TONES: Record<
  GuidanceActionValue,
  FilterTabOption<string>["tone"]
> = {
  adm_needs: "amber",
  endorse: "green",
  adm_followup: "neutral",
  adm_booked: "blue",
  adm_reject: "red",
  adm_cancelled: "neutral",
  counseling_needs: "amber",
  counseling_booked: "blue",
  counseling_done: "green",
  counseling_followup: "neutral",
  counseling_cancelled: "neutral",
};

/**
 * Tag filter bar for the guidance ADM / counseling boards — the same glass
 * tag bar as the nurse case desks (dot + label + count, amber active pill):
 * one tag per action filter with its count, plus an "All cases" tag that shows
 * everything. Clicking the active tag clears the filter.
 */
export function GuidanceActionTabs({
  action,
  summary,
  track,
  onPick,
  onClear,
}: {
  action: GuidanceAction;
  summary: GuidanceReferralsSummary | null;
  track: GuidanceTrack;
  onPick: (value: GuidanceActionValue) => void;
  onClear: () => void;
}) {
  const counts = trackMenuCounts(summary, track);
  const menu = track === "ADM" ? ADM_MENU : COUNSELING_MENU;

  const options: FilterTabOption<GuidanceAction>[] = [
    { value: "", label: "All cases", tone: "neutral" },
  ];
  for (const item of menu) {
    options.push({
      value: item.value,
      label: item.label,
      count: counts[item.value] > 0 ? counts[item.value] : undefined,
      tone: ACTION_TONES[item.value],
    });
  }

  return (
    <FilterTabs
      label="Filter cases by action"
      variant="tags"
      value={action}
      onChange={(next) => {
        if (next === "") {
          onClear();
          return;
        }
        // Clicking the tag that is already active clears the filter.
        if (next === action) {
          onClear();
          return;
        }
        onPick(next);
      }}
      options={options}
    />
  );
}
