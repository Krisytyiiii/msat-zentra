"use client";

import { Skeleton } from "@/components/ui/skeleton";
import styles from "./schedule-board.module.css";

const SKELETON_CARDS = 6;

/**
 * Loading shell for the schedule desk. It mirrors the live structure — header,
 * status/grade toolbar, then the review-queue card grid — so swapping in real
 * data doesn't move anything on screen.
 */
export function ScheduleSkeleton() {
  return (
    <div className={styles.board} role="status" aria-label="Loading schedule" aria-busy="true">
      <div className={styles.header} aria-hidden="true">
        <div className={styles.headerText}>
          <Skeleton className={styles.skelTitle} />
          <Skeleton className={styles.skelDescription} />
        </div>
        <Skeleton className={styles.skelAction} />
      </div>

      <div className={styles.toolbar} aria-hidden="true">
        <Skeleton className={styles.skelTabs} />
        <div className={styles.toolbarEnd}>
          <Skeleton className={styles.skelTabs} />
          <Skeleton className={styles.skelSearch} />
        </div>
      </div>

      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardHead}>
              <Skeleton className={styles.skelAvatar} />
              <div className={styles.cardId}>
                <Skeleton className={styles.skelLine} />
                <Skeleton className={styles.skelLineShort} />
              </div>
              <Skeleton className={styles.skelPill} />
            </div>
            <div className={styles.statusRow}>
              <Skeleton className={styles.skelPill} />
            </div>
            <div className={styles.metrics}>
              <Skeleton className={styles.skelMetric} />
              <Skeleton className={styles.skelMetric} />
              <Skeleton className={styles.skelMetric} />
            </div>
            <Skeleton className={styles.skelBar} />
            <div className={styles.cardActions}>
              <Skeleton className={styles.skelAction} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
