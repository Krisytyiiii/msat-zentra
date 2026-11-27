"use client";

import { FilterTabs, type FilterTabOption } from "@/components/ui/filter-tabs";

export type AssessmentAudience = "regular" | "adm";

const OPTIONS: ReadonlyArray<FilterTabOption<AssessmentAudience>> = [
  { value: "regular", label: "Regular", tone: "neutral" },
  { value: "adm", label: "ADM", tone: "blue" },
];

type Props = {
  value: AssessmentAudience;
  onChange: (audience: AssessmentAudience) => void;
  /** Per-type assessment totals shown as chips on each tag. */
  counts?: Record<AssessmentAudience, number>;
};

/**
 * Filters the assessment list by grade input type — the shared glass-tag
 * `FilterTabs` control the nurse desk uses for its desk filters.
 */
export function AudienceTabs({ value, onChange, counts }: Props) {
  return (
    <FilterTabs
      label="Assessment type"
      variant="tags"
      options={OPTIONS.map((option) => ({
        ...option,
        count: counts?.[option.value],
      }))}
      value={value}
      onChange={onChange}
      className="shrink-0"
    />
  );
}
