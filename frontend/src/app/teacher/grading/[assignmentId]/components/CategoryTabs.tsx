"use client";

import {
  COMPONENT_LABELS,
  COMPONENT_ORDER,
} from "@/services/teacher/grading.compute";
import type { ComponentType } from "@/services/teacher/grading.types";
import {
  FilterTabs,
  type FilterTabOption,
} from "@/components/ui/filter-tabs";

type Props = {
  value: ComponentType;
  onChange: (tab: ComponentType) => void;
  className?: string;
};

const TONES: Record<ComponentType, "blue" | "amber" | "red"> = {
  WRITTEN_WORK: "blue",
  PERFORMANCE_TASK: "amber",
  EXAM: "red",
};

const OPTIONS: ReadonlyArray<FilterTabOption<ComponentType>> = COMPONENT_ORDER.map(
  (t) => ({ value: t, label: COMPONENT_LABELS[t], tone: TONES[t] }),
);

/**
 * Category selector — the shared glass-tag `FilterTabs` control, matching the
 * Grade input tags and the nurse desk filters.
 */
export function CategoryTabs({ value, onChange, className }: Props) {
  return (
    <FilterTabs
      label="Assessment category"
      variant="tags"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
