"use client";

import {
  COMPONENT_LABELS,
  COMPONENT_ORDER,
} from "@/services/teacher/grading.compute";
import type { ComponentType } from "@/services/teacher/grading.types";
import { FilterTabs, type FilterTabOption } from "@/components/ui/filter-tabs";

type Props = {
  value: ComponentType;
  onChange: (tab: ComponentType) => void;
  className?: string;
};

const OPTIONS: ReadonlyArray<FilterTabOption<ComponentType>> = COMPONENT_ORDER.map(
  (t) => ({ value: t, label: COMPONENT_LABELS[t] }),
);

/**
 * Category selector — the shared segmented `FilterTabs` track, same control
 * every desk filter uses.
 */
export function CategoryTabs({ value, onChange, className }: Props) {
  return (
    <FilterTabs
      label="Assessment category"
      options={OPTIONS}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
