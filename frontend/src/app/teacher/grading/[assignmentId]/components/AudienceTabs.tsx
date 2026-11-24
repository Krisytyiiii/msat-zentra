"use client";

import { FilterTabs, type FilterTabOption } from "@/components/ui/filter-tabs";

export type AssessmentAudience = "regular" | "adm";

const OPTIONS: ReadonlyArray<FilterTabOption<AssessmentAudience>> = [
  { value: "regular", label: "Regular" },
  { value: "adm", label: "ADM" },
];

type Props = {
  value: AssessmentAudience;
  onChange: (audience: AssessmentAudience) => void;
};

/**
 * Filters the assessment list by grade input type — the shared segmented
 * `FilterTabs` control, same as every other desk filter.
 */
export function AudienceTabs({ value, onChange }: Props) {
  return (
    <FilterTabs
      label="Assessment type"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      className="shrink-0"
    />
  );
}
