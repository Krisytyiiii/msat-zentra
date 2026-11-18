"use client";

import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { PrincipalEmptyState } from "../../../../components/PrincipalEmptyCard";
import type { AttentionItem } from "./types";
import styles from "./academics.module.css";

const PASSING = 75;

/**
 * Lowest section–subject averages, ranked worst-first. A row is a shortcut
 * into the section ranking board for that subject, so the list is a place to
 * act from rather than a static readout. Rows (not cards) keep the panel
 * readable whether one section or eight are below target.
 */
export function NeedsAttentionList({
  items,
  isPending,
  isNoData,
  onSelectSubject,
  selectedSubject,
}: {
  items: AttentionItem[];
  isPending: boolean;
  isNoData?: boolean;
  onSelectSubject?: (subject: string) => void;
  selectedSubject?: string | null;
}) {
  const isEmpty = !isPending && items.length === 0;
  // Nothing needs attention: render nothing (no "All clear" card).
  if (isEmpty && !isNoData) return null;

  if (isPending) {
    return (
      <section className={styles.attnPanel} aria-hidden>
        <div className={styles.attnHead}>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className={styles.attnBody}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.attnSkelRow}>
              <Skeleton className="h-4 w-6" />
              <span className={styles.attnSkelWho}>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </span>
              <Skeleton className="h-5 w-10 rounded-md" />
              <Skeleton className="h-1.5 w-full rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (isEmpty) {
    return (
      <PrincipalEmptyState
        icon={ShieldAlert}
        title="No graded records"
        hint="No graded records for the active term. Grades will appear here once finalized."
      />
    );
  }

  return (
    <section className={styles.attnPanel} aria-label="Needs attention">
      <div className={styles.attnHead}>
        <span className={styles.attnTitle}>
          <ShieldAlert size={14} aria-hidden="true" />
          Needs Attention
        </span>
        <span className={styles.attnDesc}>
          Lowest section–subject averages below {PASSING}, worst first. Pick one
          to highlight its bars in Subject Trends.
        </span>
      </div>

      <div className={styles.attnRail} aria-hidden="true">
        <span>Rank</span>
        <span>Section · Subject</span>
        <span>Average</span>
        <span>Distribution</span>
        <span>Learners below</span>
      </div>

      <div
        className={styles.attnBody}
        aria-label={`Section-subject averages below ${PASSING}`}
      >
        {items.map((item, index) => {
          const selected = selectedSubject === item.subject;
          const meter = Math.max(0, Math.min(100, item.avg));
          return (
            <button
              key={`${item.sectionId}::${item.subject}`}
              type="button"
              className={`${styles.attnRow} ${
                selected ? styles.attnRowSelected : ""
              }`}
              onClick={() => onSelectSubject?.(item.subject)}
              aria-pressed={selected}
              aria-label={`${item.section}, ${item.subject}: average ${item.avg}, ${item.below} of ${item.graded} learners below ${PASSING} — show section ranking`}
            >
              <span
                className={`${styles.attnRank} ${
                  index === 0 ? styles.attnRankWorst : ""
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <span className={styles.attnWho}>
                <span className={styles.attnSectionName}>{item.section}</span>
                <span className={styles.attnSubject}>{item.subject}</span>
              </span>

              <span className={styles.attnAvg}>
                <Pill tone="red" label="Average">
                  {item.avg}
                </Pill>
              </span>

              <span className={styles.attnMeterCol}>
                <span className={styles.attnMeter} aria-hidden>
                  <span
                    className={`${styles.attnMeterFill} ${
                      item.avg < 70 ? styles.attnMeterCritical : ""
                    }`}
                    style={{ width: `${meter}%` }}
                  />
                  <span
                    className={styles.attnPassMark}
                    style={{ left: `${PASSING}%` }}
                  />
                </span>
                <span className={styles.attnScale} aria-hidden>
                  <span>0</span>
                  <span>100</span>
                </span>
              </span>

              <span className={styles.attnMeta}>
                <strong>{item.below}</strong> of {item.graded} below {PASSING}
              </span>

              <ArrowUpRight
                className={styles.attnGo}
                size={14}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
