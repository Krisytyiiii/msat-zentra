"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./filter-tabs.module.css";

export type FilterTabOption<T extends string> = {
  value: T;
  label: string;
  /** Optional right-aligned count chip (row totals, per-status totals…). */
  count?: number;
  /** Optional status dot colour for the `tags` variant. */
  tone?: "amber" | "blue" | "green" | "red" | "neutral";
};

/**
 * Filter tabs — the one tab-filter shape for every desk.
 *
 * `segmented` (default): a rounded track with an amber active chip.
 * `tags`: free-standing glass pills, each led by a status dot, matching the
 * AI Canvas glass-tags pattern (no shared track).
 *
 * Use it for filtering a list/board (status, type, grade level, decision…),
 * never for view switchers or in-dialog steppers.
 */
export function FilterTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "segmented",
  className,
}: {
  label: string;
  options: ReadonlyArray<FilterTabOption<T>>;
  value: T;
  onChange: (next: T) => void;
  variant?: "segmented" | "tags";
  className?: string;
}) {
  const tags = variant === "tags";

  return (
    <div
      className={cn(tags ? styles.tags : styles.track, className)}
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
            className={cn(
              tags ? styles.tag : styles.tab,
              active && (tags ? styles.tagActive : styles.tabActive),
            )}
          >
            {tags ? (
              <span
                className={styles.tabDot}
                data-tone={option.tone ?? "neutral"}
                aria-hidden
              />
            ) : null}
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
