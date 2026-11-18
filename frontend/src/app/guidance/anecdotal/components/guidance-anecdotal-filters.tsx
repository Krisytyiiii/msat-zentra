"use client";

import { Search } from "lucide-react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Input } from "@/components/ui/input";
import styles from "./guidance-anecdotal-filters.module.css";

export type CategoryFilter = "";
export type TypeFilter = "" | "ADM" | "Counseling";

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "", label: "All types" },
  { value: "ADM", label: "ADM consultation" },
  { value: "Counseling", label: "Counseling" },
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
    <div className={styles.searchWrap}>
      <Search className={styles.searchIcon} aria-hidden />
      <Input
        className={`${styles.search} focus-visible:ring-2 focus-visible:ring-inset`}
        placeholder="Search student, LRN, observer…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search anecdotal records"
      />
    </div>
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
