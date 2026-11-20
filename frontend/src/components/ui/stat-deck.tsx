"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/lib/hooks/useCountUp";
import { cn } from "@/lib/utils";
import styles from "./stat-deck.module.css";

/** One figure in the deck. */
export interface StatDeckItem {
  key: string;
  icon: LucideIcon;
  /** Tile label — the metric name only, never the raw value. */
  label: string;
  /** Unit under the number, uppercase. Pass `""` to omit. */
  unit: string;
  /** Numbers count up; strings (e.g. "88.5", "—", "3/12") render as-is. */
  value: number | string;
  hint: string;
  /** Makes the whole tile a link to the list the number came from. */
  href?: string;
  /** Makes the whole tile a button (filters/expands instead of navigating). */
  onClick?: () => void;
  /** Attention tint — amber for work still queued, red for a flagged figure. */
  tone?: "amber" | "red";
  /** Thin share bar under the number (0–100). */
  meter?: number;
  /** Pressed/selected state for button tiles. */
  active?: boolean;
  disabled?: boolean;
  /**
   * Trailing glyph: `arrow` (default for links), `chevron` (expanders) or
   * `none`. Only shown on interactive tiles.
   */
  indicator?: "arrow" | "chevron" | "none";
  /** Rotates the chevron to point up (open panel). */
  indicatorOpen?: boolean;
  /** Overrides the generated accessible name. */
  ariaLabel?: string;
}

export interface StatDeckProps {
  /** Header rail copy. */
  title: string;
  /** Header rail glyph. */
  icon?: LucideIcon;
  items: StatDeckItem[];
  /** Dashed footnote under the tiles (scope/definition notes). */
  footer?: React.ReactNode;
  /** Extra content pinned to the right of the header rail. */
  headerExtra?: React.ReactNode;
  /** Panel rendered under the tiles inside the same strip. */
  children?: React.ReactNode;
  loading?: boolean;
  error?: boolean;
  /** Shown in place of the tiles when `error` is set. */
  errorMessage?: string;
  /** Accessible name for the section (defaults to `title`). */
  ariaLabel?: string;
  /** Count-up duration in ms. */
  countDuration?: number;
  /** Render nothing at all (e.g. a board with no data yet). */
  hidden?: boolean;
  className?: string;
}

function StatTile({
  item,
  duration,
}: {
  item: StatDeckItem;
  duration: number;
}) {
  const Icon = item.icon;
  const numeric = typeof item.value === "number";
  const shown = useCountUp(numeric ? (item.value as number) : 0, duration);
  const interactive = Boolean(item.href || item.onClick);
  const indicator = item.indicator ?? (item.href ? "arrow" : "none");

  const body = (
    <>
      <span className={styles.tileTop}>
        <span className={styles.tileIcon} aria-hidden>
          <Icon size={13} />
        </span>
        <span className={styles.tileLabel}>{item.label}</span>
        {interactive && indicator !== "none" ? (
          indicator === "chevron" ? (
            <ChevronDown
              className={cn(styles.tileArrow, item.indicatorOpen && styles.tileArrowOpen)}
              aria-hidden
            />
          ) : (
            <ArrowRight className={styles.tileArrow} aria-hidden />
          )
        ) : null}
      </span>
      <span className={styles.tileValue}>
        <span className={cn(styles.tileNumber, item.value === 0 && styles.tileNumberZero)}>
          {numeric ? shown : item.value}
        </span>
        {item.unit ? <span className={styles.tileUnit}>{item.unit}</span> : null}
      </span>
      {item.meter !== undefined ? (
        <span className={styles.tileMeter} aria-hidden>
          <span
            className={styles.tileMeterFill}
            style={{ width: `${Math.max(0, Math.min(100, item.meter))}%` }}
          />
        </span>
      ) : null}
      <span className={styles.tileHint}>{item.hint}</span>
    </>
  );

  const tileClass = cn(
    styles.tile,
    item.tone === "amber" && styles.tileAmber,
    item.tone === "red" && styles.tileRed,
    item.active && styles.tileActive,
  );

  if (item.onClick) {
    const label =
      item.ariaLabel ??
      `${item.label}: ${item.value} ${item.unit}${item.active ? " — open" : ""}`;
    return (
      <button
        type="button"
        className={cn(tileClass, styles.tileButton)}
        onClick={item.onClick}
        disabled={item.disabled}
        aria-pressed={item.active}
        aria-label={label}
      >
        {body}
      </button>
    );
  }

  if (item.href) {
    return (
      <Link
        href={item.href}
        className={tileClass}
        aria-label={
          item.ariaLabel ?? `${item.label}: ${item.value} ${item.unit} — open list`
        }
      >
        {body}
      </Link>
    );
  }

  return <div className={tileClass}>{body}</div>;
}

/**
 * Stat deck — one bordered strip instead of a row of floating cards: a header
 * rail, a 4-up grid of divided tiles (icon + label, big animated number + unit,
 * hint) and an optional dashed footnote. Tiles can link, act as buttons, carry
 * an amber/red attention tint, or open a panel inside the strip.
 *
 * Every desk renders its "at a glance" figures through this component so the
 * stat language is identical everywhere — do not fork the markup per page.
 */
export function StatDeck({
  title,
  icon: HeaderIcon,
  items,
  footer,
  headerExtra,
  children,
  loading = false,
  error = false,
  errorMessage = "Could not load these figures.",
  ariaLabel,
  countDuration = 900,
  hidden = false,
  className,
}: StatDeckProps) {
  if (hidden) return null;

  const skeletonTiles = items.length || 4;

  return (
    <section
      className={cn(styles.deck, className)}
      aria-label={ariaLabel ?? title}
      aria-busy={loading || undefined}
    >
      <div className={styles.deckHead}>
        <span className={styles.deckTitle}>
          {loading ? (
            <Skeleton className="h-3.5 w-32" />
          ) : (
            <>
              {HeaderIcon ? <HeaderIcon aria-hidden /> : null}
              {title}
            </>
          )}
        </span>
        {headerExtra ? <span className={styles.deckExtra}>{headerExtra}</span> : null}
      </div>

      {loading ? (
        <div className={styles.tiles}>
          {Array.from({ length: skeletonTiles }).map((_, index) => (
            <div key={index} className={styles.tile} aria-hidden="true">
              <span className={styles.tileTop}>
                <Skeleton className={styles.skelIcon} />
                <Skeleton className="h-3 w-20" />
              </span>
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className={styles.empty}>{errorMessage}</p>
      ) : (
        <div className={styles.tiles}>
          {items.map((item) => (
            <StatTile key={item.key} item={item} duration={countDuration} />
          ))}
        </div>
      )}

      {footer && !loading && !error ? (
        <p className={styles.deckFoot}>{footer}</p>
      ) : null}

      {children && !loading && !error ? (
        <div className={styles.deckPanel}>{children}</div>
      ) : null}
    </section>
  );
}
