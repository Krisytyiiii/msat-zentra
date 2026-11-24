"use client";

import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import styles from "./guidance-anecdotal-filters.module.css";

export type CategoryFilter = "";
export type TypeFilter = "" | "ADM" | "Counseling";

/* Same glass-tag filter bar as the alerts / interventions / referrals desks:
   dot + label, amber active pill. */
const TYPES: {
  value: TypeFilter;
  label: string;
  tone: "neutral" | "blue" | "amber";
}[] = [
  { value: "", label: "All types", tone: "neutral" },
  { value: "ADM", label: "ADM consultation", tone: "blue" },
  { value: "Counseling", label: "Counseling", tone: "blue" },
];

interface GuidanceAnecdotalFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  type: TypeFilter;
  onTypeChange: (value: TypeFilter) => void;
}

/** Pill tab group — the shared segmented filter tabs. */

export function GuidanceAnecdotalTypeTabs({
  type,
  onTypeChange,
}: Pick<GuidanceAnecdotalFiltersProps, "type" | "onTypeChange">) {
  return (
    <FilterTabs
      label="Filter records by case type"
      variant="tags"
      options={TYPES}
      value={type}
      onChange={onTypeChange}
    />
  );
}

export function GuidanceAnecdotalSearch({
  query,
  onQueryChange,
}: Pick<GuidanceAnecdotalFiltersProps, "query" | "onQueryChange">) {
  return (
    <SearchField
      className="w-60"
      placeholder="Search student, LRN, observer…"
      value={query}
      onChange={(next) => onQueryChange(next)}
      aria-label="Search anecdotal records"
    />
  );
}

export function GuidanceAnecdotalFilters({
  query,
  onQueryChange,
  type,
  onTypeChange,
}: GuidanceAnecdotalFiltersProps) {
  return (
    <div className={styles.filters}>
      <GuidanceAnecdotalTypeTabs type={type} onTypeChange={onTypeChange} />
      <GuidanceAnecdotalSearch query={query} onQueryChange={onQueryChange} />
    </div>
  );
}
