"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import styles from "./coordinator-referrals-skeleton.module.css";

function SkeletonCards({ rows }: { rows: number }) {
  return (
    <div className={styles.grid}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.skelCard}>
          <div className={styles.skelTop}>
            <Skeleton className={styles.skelTitle} />
            <Skeleton className={styles.skelStatus} />
          </div>
          <div className={styles.skelInner}>
            <div className={styles.skelHead}>
              <Skeleton className={styles.skelAvatar} />
              <div className={styles.skelId}>
                <Skeleton className={styles.line} />
                <Skeleton className={styles.lineSm} />
              </div>
            </div>
            <div className={styles.skelPills}>
              <Skeleton className={styles.skelPill} />
              <Skeleton className={styles.skelPillSm} />
            </div>
            <Skeleton className={styles.skelBlock} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Table-view skeleton — same row rhythm as the data table. */
function TableSkeletonBlock({ rows }: { rows: number }) {
  return (
    <div className={styles.tableShell} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.tableRowSkel}>
          <Skeleton className={styles.tableCellName} />
          <Skeleton className={styles.tableCellSm} />
          <Skeleton className={styles.tableCellMd} />
          <Skeleton className={styles.tableCellSm} />
          <Skeleton className={styles.tableCellMd} />
          <Skeleton className={styles.tableCellMd} />
        </div>
      ))}
    </div>
  );
}

/** Card-grid-only skeleton used while a page/filter fetch swaps the rows. */
export function CoordinatorReferralsCardsSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading referrals">
      <SkeletonCards rows={rows} />
    </div>
  );
}

export function CoordinatorReferralsTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading referrals">
      <TableSkeletonBlock rows={rows} />
    </div>
  );
}

function BoardSkeleton({ rows }: { rows: number }) {
  return (
    <div className={styles.boardShell} aria-hidden="true">
      <div className={styles.tabRow}>
        <Skeleton className={styles.tab} />
        <Skeleton className={styles.tab} />
        <Skeleton className={styles.tab} />
        <Skeleton className={styles.tab} />
      </div>
      <TableSkeletonBlock rows={rows} />
    </div>
  );
}

/** Desk-head mirror — badge, title, search; the figure strip sits underneath. */
function DeskHeadSkeleton() {
  return (
    <div className={styles.deskHead} aria-hidden="true">
      <Skeleton className={styles.deskBadge} />
      <Skeleton className={styles.deskTitle} />
      <div className={styles.deskTools}>
        <Skeleton className={styles.search} />
      </div>
    </div>
  );
}

function FiguresSkeleton() {
  return (
    <div className={styles.deck} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={styles.deckTile}>
          <div className={styles.deckTileTop}>
            <Skeleton className={styles.deckIcon} />
            <Skeleton className={styles.deckLabel} />
          </div>
          <Skeleton className={styles.deckValue} />
          <Skeleton className={styles.deckHint} />
        </div>
      ))}
    </div>
  );
}

export function CoordinatorReferralsSkeleton({
  rows = 9,
  layout = "full",
}: {
  rows?: number;
  layout?: "full" | "board";
}) {
  if (layout === "board") {
    return (
      <div aria-busy="true" aria-label="Loading referrals">
        <BoardSkeleton rows={rows} />
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-label="Loading referrals">
      <ShimmerGroup>
        <DeskHeadSkeleton />
        <FiguresSkeleton />
        <div className={styles.body}>
          <div className={styles.mainCol}>
            <BoardSkeleton rows={rows} />
            <div className={styles.pager}>
              <Skeleton className={styles.range} />
              <div className={styles.pagerButtons}>
                <Skeleton className={styles.pageBtn} />
                <Skeleton className={styles.pageLabel} />
                <Skeleton className={styles.pageBtn} />
              </div>
            </div>
          </div>
        </div>
      </ShimmerGroup>
    </div>
  );
}
