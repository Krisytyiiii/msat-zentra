"use client";

import {
  FilterTabs,
  type FilterTabOption,
} from "@/components/ui/filter-tabs";
import {
  ADM_MENU,
  CLINIC_MENU,
  type ActionFilter,
  type ActionValue,
  type TypeFilter,
} from "./nurse-referrals-format";

/* Dot tone per action — the same palette the alerts desk's type tags use
   (amber = needs a look, green = cleared/endorsed, blue = scheduled,
   red = rejected, neutral = closed out). */
const ACTION_TONES: Record<ActionValue, FilterTabOption<string>["tone"]> = {
  adm_needs: "amber",
  endorse: "green",
  followup: "neutral",
  booked: "blue",
  reject: "red",
  adm_cancelled: "neutral",
  clinic_needs: "amber",
  clinic_booked: "blue",
  clinic_done: "green",
  clinic_followup: "neutral",
  clinic_reject: "red",
  clinic_cancelled: "neutral",
};

/**
 * Tag filter bar for the nurse case desks — the same glass-tag bar the alerts
 * desk uses (dot + label + count, amber active pill): one tag per action
 * filter with its count, plus an "All cases" tag that shows everything.
 * Clicking the active tag clears the filter, same as the action rail.
 *
 * Shared by the split ADM / clinic boards (locked to one track) and any desk
 * that shows both groups at once (each label then carries its track prefix).
 */
export function NurseActionTabs({
  actionFilter,
  counts,
  typeFilter,
  onPick,
  onClear,
}: {
  actionFilter: ActionFilter;
  counts: Record<ActionValue, number>;
  typeFilter: TypeFilter;
  onPick: (value: ActionValue, type: "ADM" | "Clinic") => void;
  onClear: () => void;
}) {
  const options: FilterTabOption<ActionFilter>[] = [
    { value: "", label: "All cases", tone: "neutral" },
  ];

  const pushGroup = (menu: { value: ActionValue; label: string }[], type: "ADM" | "Clinic") => {
    const prefix = typeFilter === "" ? `${type} · ` : "";
    for (const item of menu) {
      options.push({
        value: item.value,
        label: `${prefix}${item.label}`,
        count: counts[item.value] > 0 ? counts[item.value] : undefined,
        tone: ACTION_TONES[item.value],
      });
    }
  };

  if (typeFilter !== "Clinic") pushGroup(ADM_MENU, "ADM");
  if (typeFilter !== "ADM") pushGroup(CLINIC_MENU, "Clinic");

  return (
    <FilterTabs
      label="Filter cases by action"
      variant="tags"
      value={actionFilter}
      onChange={(next) => {
        if (next === "") {
          onClear();
          return;
        }
        // Clicking the tag that is already active clears the filter.
        if (next === actionFilter) {
          onClear();
          return;
        }
        onPick(next, next.startsWith("clinic") ? "Clinic" : "ADM");
      }}
      options={options}
    />
  );
}
