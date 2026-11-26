"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import styles from "./schedule-overview-board.module.css";

/** One skeleton card per grid cell of a typical 1080p desk; the grid reflows
 *  to the same `auto-fill` columns as the loaded board so nothing jumps. */
const SKELETON_CARDS = 8;
const SKELETON_TABS = 7;

/**
 * Loading state for the schedule overview. Mirrors `ScheduleOverviewBoard`
 * exactly — the same headerless stat strip (4 clickable tiles), grade/search
 * toolbar and elevated section-card grid — so the swap to live data causes no
 * shift. Wrapped in `ShimmerGroup` so every placeholder (including the stat
 * deck's own tiles) sweeps together instead of pulsing one shape at a time.
 */
export function ScheduleOverviewSkeleton() {
  return (
    <ShimmerGroup>
      <section
        className={cardStyles.board}
        role="status"
        aria-label="Loading schedule"
        aria-busy="true"
      >
        <StatDeck ariaLabel="Schedule at a glance" items={[]} loading />

        <div className={cardStyles.toolbar} aria-hidden>
          <div className={styles.skelTrack}>
            {Array.from({ length: SKELETON_TABS }).map((_, i) => (
              <Skeleton key={i} className={styles.skelTab} />
            ))}
          </div>
          <Skeleton className="h-8 w-60 max-w-full shrink-0 rounded-[16px]" />
        </div>

        <div className={cardStyles.grid} aria-hidden>
          {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
            <div key={i} className={styles.card}>
              <header className={cardStyles.cardHead}>
                <Skeleton className={cardStyles.skelAvatar} />
                <div className={cardStyles.cardId}>
                  <Skeleton className={cardStyles.skelName} />
                  <Skeleton className={cardStyles.skelTeacher} />
                </div>
                <Skeleton className="h-3 w-14 shrink-0" />
              </header>

              <div className={cardStyles.metaRow}>
                <Skeleton className="h-3 w-20" />
              </div>

              <div className={styles.progress}>
                <span className={styles.progressFill} style={{ width: "45%" }} />
              </div>
              <Skeleton className="h-3 w-32" />

              <div className={cardStyles.linksRow}>
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>

              <div className={cardStyles.cardActions}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-28 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </ShimmerGroup>
  );
}
