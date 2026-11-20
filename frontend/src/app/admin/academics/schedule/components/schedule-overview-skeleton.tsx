"use client";

import { CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import styles from "./schedule-overview-board.module.css";

/** One skeleton card per grid cell of a typical 1080p desk; the grid reflows
 *  to the same `auto-fill` columns as the loaded board so nothing jumps. */
const SKELETON_CARDS = 8;
const SKELETON_TABS = 7;

/**
 * Loading state for the schedule overview. Mirrors `ScheduleOverviewBoard`
 * exactly — same board shell, header rail, stat deck strip (4 tiles), filter
 * toolbar and section-card grid — so the swap to live data causes no shift.
 */
export function ScheduleOverviewSkeleton() {
  return (
    <section
      className={cardStyles.board}
      role="status"
      aria-label="Loading schedule"
      aria-busy="true"
    >
      <header className={cardStyles.header}>
        <div className={cardStyles.headerText}>
          <div className={cardStyles.titleRow}>
            <span className={cardStyles.titleIcon} aria-hidden>
              <CalendarDays size={16} />
            </span>
            <h1 className={cardStyles.title}>Schedule</h1>
          </div>
          <p className={cardStyles.subtitle}>
            School-wide timetable workspace. Open a section to build its weekly grid and publish it —
            published sections are what teachers see in grading and attendance.
          </p>
        </div>
        <div className={cardStyles.headerActions} aria-hidden>
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      </header>

      <StatDeck title="This term" icon={CalendarDays} items={[]} loading />

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
          <div key={i} className={cardStyles.card}>
            <div className={cardStyles.cardHead}>
              <Skeleton className={cardStyles.skelAvatar} />
              <div className={cardStyles.cardId}>
                <Skeleton className={cardStyles.skelName} />
                <Skeleton className={cardStyles.skelTeacher} />
              </div>
              <Skeleton className={cardStyles.skelPill} />
            </div>

            <div className={cardStyles.metaRow}>
              <Skeleton className={cardStyles.skelPill} />
            </div>

            <div className={styles.progress}>
              <span className={styles.progressFill} style={{ width: "40%" }} />
            </div>
            <Skeleton className="h-3 w-32" />

            <div className={cardStyles.linksRow}>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-16" />
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
  );
}
