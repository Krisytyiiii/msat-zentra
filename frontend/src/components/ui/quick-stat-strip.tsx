"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import styles from "./quick-stat-strip.module.css";

/**
 * Compact stat tile tone — colours the leading icon chip (and optionally the
 * value). Defaults to amber, the teacher shell's accent.
 */
export type QuickStatTone = "amber" | "green" | "teal" | "blue" | "red" | "violet";

export interface QuickStatItem {
  key: string;
  icon: LucideIcon;
  /** Small label above the figure. */
  label: string;
  /** The figure itself (number or pre-formatted string). */
  value: React.ReactNode;
  /** Right-aligned supporting note. */
  hint?: string;
  /** Icon-chip tone. Defaults to amber. */
  tone?: QuickStatTone;
  /** Optional value colour for attention figures. */
  valueTone?: "green" | "amber" | "red";
  /** Makes the tile a link (the whole tile is the target). */
  href?: string;
  /** Native tooltip on the tile. */
  title?: string;
}

function StatTile({ item }: { item: QuickStatItem }) {
  const Icon = item.icon;
  const body = (
    <>
      <span className={styles.icon} data-tone={item.tone ?? "amber"} aria-hidden>
        <Icon size={14} />
      </span>
      <span className={styles.body}>
        <span className={styles.label}>{item.label}</span>
        <span
          className={styles.value}
          data-tone={item.valueTone}
        >
          {item.value}
        </span>
      </span>
      {item.hint ? <span className={styles.hint}>{item.hint}</span> : null}
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={styles.card} title={item.title}>
        {body}
      </Link>
    );
  }
  return (
    <div className={styles.card} title={item.title}>
      {body}
    </div>
  );
}

/**
 * Compact glass stat strip — a row of amber-edged tiles (icon, label over the
 * figure, right-aligned note). Shared by the teacher anecdotal desk and the
 * term reports desk so both stat rows read identically.
 */
export function QuickStatStrip({
  items,
  ariaLabel,
  className,
}: {
  items: QuickStatItem[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(styles.grid, className)}
      role="group"
      aria-label={ariaLabel ?? "Summary"}
    >
      {items.map((item) => (
        <StatTile key={item.key} item={item} />
      ))}
    </div>
  );
}

/** Loading placeholder for `QuickStatStrip` — same tile geometry. */
export function QuickStatStripSkeleton({
  count = 3,
  className,
  hints = [],
}: {
  count?: number;
  className?: string;
  /** Optional per-tile hint width classes (Tailwind widths). */
  hints?: string[];
}) {
  return (
    <div className={cn(styles.grid, className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton className={styles.skelIcon} />
          <span className={styles.body}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-8" />
          </span>
          <Skeleton className={`ml-auto h-3 shrink-0 ${hints[i] ?? "w-20"}`} />
        </div>
      ))}
    </div>
  );
}
