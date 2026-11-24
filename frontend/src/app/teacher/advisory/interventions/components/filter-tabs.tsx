"use client";

import * as React from "react";
import {
  FilterTabs as SharedFilterTabs,
  type FilterTabOption,
} from "@/components/ui/filter-tabs";

/**
 * Pill tab group — thin alias over the shared `FilterTabs` so the advisory
 * desk keeps its existing import while every desk renders the same shape.
 */
export function FilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  variant,
}: {
  label: string;
  options: ReadonlyArray<FilterTabOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** Rendering variant forwarded to the shared tabs (segmented | tags). */
  variant?: "segmented" | "tags";
  /** Accepted for backwards compatibility; the shared tabs use one accent. */
  tone?: string;
}) {
  return (
    <SharedFilterTabs
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      variant={variant}
    />
  );
}
