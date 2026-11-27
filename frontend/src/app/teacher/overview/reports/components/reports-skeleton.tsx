"use client";

import * as React from "react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import styles from "./reports.module.css";

/* Both strips on the desk are real <StatDeck>s, so the placeholder reuses the
   component's own loading tiles and keeps each deck's exact geometry: the
   teaching-load strip is 4-up (default), the KPI strip is 6-up in one row. */
function StatDeckSkeleton({
  columns = 4,
  ariaLabel,
}: {
  columns?: 4 | 6;
  ariaLabel: string;
}) {
  return <StatDeck items={[]} columns={columns} loading ariaLabel={ariaLabel} />;
}

/* Both chart boards lost their title row, so their placeholder is the real
   board shell: description line → chart → "What it means" footer. */
function BoardSkeleton({
  children,
  footer,
  ariaLabel,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <KanbanBoard
      title=""
      ariaLabel={ariaLabel}
      showHeader={false}
      description={<Skeleton className="h-3 w-72 max-w-full rounded" />}
      footer={footer}
      className="flex-1"
    >
      {children}
    </KanbanBoard>
  );
}

/* Class performance: no parent board — a bare heading over the real
   `.classCardGrid` / `.classCard` anatomy (identity → metrics → facts). */
function ClassTableSkeleton() {
  return (
    <div className={styles.classCardGrid} aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={styles.classCard}>
          <div className={styles.classCardHead}>
            <div className={styles.classCardHeading}>
              <Skeleton className="h-3.5 w-2/3 rounded" />
              <div className={styles.classCardMeta}>
                <Skeleton className="h-[18px] w-14 rounded-md" />
                <Skeleton className="h-[18px] w-16 rounded-md" />
                <Skeleton className="h-[18px] w-10 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-[22px] w-16 rounded-md" />
          </div>
          <div className={styles.classCardMetrics}>
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className={styles.classCardMetric}>
                <Skeleton className="h-3 w-12 rounded" />
                <Skeleton className="h-5 w-10 rounded" />
                {j > 0 ? <Skeleton className="h-3 w-16 rounded" /> : null}
              </div>
            ))}
          </div>
          <div className={styles.classCardFacts}>
            {["w-12", "w-10", "w-16", "w-14"].map((width, k) => (
              <div key={k} className={styles.classCardFact}>
                <Skeleton className="h-3 w-8 rounded" />
                <Skeleton className={`h-3 ${width} rounded`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Distribution: the same 208px plot the bar chart occupies, five bars. */
function DistributionSkeleton() {
  return (
    <div className={styles.skeletonBars} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className="w-full rounded-t-[4px] rounded-b-none"
          style={{ height: `${[80, 20, 24, 20, 92][i]}%` }}
        />
      ))}
    </div>
  );
}

/* Case activity: donut on the left, three legend rows on the right. */
function ActivitySkeleton() {
  return (
    <div className={styles.activityBody} aria-hidden>
      <div className={styles.donutWrap}>
        <Skeleton className="mx-auto aspect-square w-full max-w-[156px] rounded-full" />
      </div>
      <div className={styles.activityLegendCol}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles.activityLegendItem}>
            <div className={styles.legendRow}>
              <Skeleton className="size-2 shrink-0 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-[3px] w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Reserves the callout-shaped "What it means" footer. */
function BoardFooterSkeleton() {
  return (
    <div className={styles.footerSlot}>
      <div className={styles.interpretation}>
        <div className="flex flex-col gap-1.5 rounded-r-[6px] border-l-[3px] border-amber-500 bg-amber-500/10 px-3 py-2.5">
          <Skeleton className="h-2.5 w-[88%]" />
          <Skeleton className="h-2.5 w-[62%]" />
        </div>
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading term report">
      <ShimmerGroup>
        <StatDeckSkeleton columns={4} ariaLabel="Teaching load at a glance" />
        <StatDeckSkeleton columns={6} ariaLabel="Term report KPIs" />
        <div className={styles.panels}>
          <BoardSkeleton ariaLabel="Grade distribution" footer={<BoardFooterSkeleton />}>
            <DistributionSkeleton />
          </BoardSkeleton>
          <BoardSkeleton ariaLabel="Case activity" footer={<BoardFooterSkeleton />}>
            <ActivitySkeleton />
          </BoardSkeleton>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-1.5 px-1" aria-hidden>
            <Skeleton className="mt-px size-3.5 shrink-0 rounded" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-32 rounded" />
              <Skeleton className="h-2.5 w-80 max-w-full rounded" />
            </div>
          </div>
          <ClassTableSkeleton />
        </div>
      </ShimmerGroup>
    </div>
  );
}
