"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./filter-tabs.module.css";

export type FilterTabOption<T extends string> = {
  value: T;
  label: string;
  /** Optional right-aligned count chip (row totals, per-status totals…). */
  count?: number;
};

/**
 * Segmented filter tabs — the one tab-filter shape for every desk: a rounded
 * track with an amber active chip and an optional count.
 *
 * Use it for filtering a list/board (status, type, grade level, decision…),
 * never for view switchers or in-dialog steppers.
 */
export function FilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: ReadonlyArray<FilterTabOption<T>>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(styles.track, className)}
      role="tablist"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(styles.tab, active && styles.tabActive)}
          >
            <span className={styles.label}>{option.label}</span>
            {option.count !== undefined ? (
              <span className={styles.count}>{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
