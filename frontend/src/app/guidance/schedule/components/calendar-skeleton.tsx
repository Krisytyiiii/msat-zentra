"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import styles from "./guidance-calendar.module.css";

/**
 * Loading shell for the booked-schedule desk. It mirrors the administrator's
 * no-class-days skeleton exactly — the same card, month caption, weekday row,
 * six week rows, legend and note — so the board does not move when the
 * bookings land. Only the leaves are placeholders.
 */

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const LEGEND_ITEMS = [0, 1, 2, 3];

export function GuidanceScheduleSkeleton() {
  return (
    <ShimmerGroup>
      <section className={styles.page} role="status" aria-label="Loading schedule" aria-busy="true">
        <div className={styles.grid}>
          <section className={styles.calendarCard}>
            <Skeleton className="mx-auto h-5 w-40 rounded-md" />

            <div className="grid w-full grid-cols-7 gap-1" aria-hidden="true">
              {WEEKDAY_NAMES.map((name) => (
                <Skeleton key={name} className="mx-auto h-3 w-8" />
              ))}
            </div>

            <div
              className="grid w-full flex-1 auto-rows-[minmax(0,1fr)] grid-cols-7 gap-1"
              aria-hidden="true"
            >
              {Array.from({ length: 42 }).map((_, i) => (
                <Skeleton key={`day-${i}`} className="h-full min-h-[3.75rem] w-full" />
              ))}
            </div>

            <div className={styles.legend} aria-hidden="true">
              {LEGEND_ITEMS.map((i) => (
                <span key={i} className={styles.legendItem}>
                  <ShimmerSkeleton className={styles.legendDot} />
                  <ShimmerSkeleton className="h-3 w-14" />
                </span>
              ))}
              <span className={`${styles.legendCount} inline-flex`}>
                <ShimmerSkeleton className="h-3 w-44" />
              </span>
            </div>

            <div className={styles.note} aria-hidden="true">
              <ShimmerSkeleton className={`${styles.noteIcon} size-3.5 rounded-sm`} />
              <div className="flex w-full flex-col gap-1.5">
                <ShimmerSkeleton className="h-3 w-full" />
                <ShimmerSkeleton className="h-3 w-4/5" />
              </div>
            </div>
          </section>
        </div>
      </section>
    </ShimmerGroup>
  );
}
