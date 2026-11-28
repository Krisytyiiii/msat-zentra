"use client";

import type * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KanbanBoardSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import cascade from "@/components/shared/desk-cascade.module.css";
import reportStyles from "./guidance-adm-reports.module.css";
import styles from "./guidance-adm.module.css";
import alertsStyles from "../../alerts/components/guidance-alerts-table.module.css";

/**
 * Loading skeleton for /guidance/reports — one shimmer board per live board, in
 * the same order and grids as the loaded page: findings strip → report charts
 * (category bars, referred-actions donut, referral trend) → bottlenecks /
 * recommendations → risk boards → trend → watchlist. Board shells come from
 * the real `KanbanBoard`, so paddings, borders and gaps match exactly when the
 * data lands.
 */

/** Footer interpretation line — pinned to the board bottom like the real one. */
function InterpSkeleton() {
  return <Skeleton className="mt-auto h-12 w-full rounded-md" />;
}

/** Donut placeholder matching the ring + hollow-centre charts on the desk. */
function DonutSkeleton({ size = 168 }: { size?: number }) {
  const hole = Math.round(size * 0.56);
  return (
    <div
      className="relative mx-auto shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Skeleton className="h-full w-full rounded-full" />
      <div
        className="absolute rounded-full bg-card"
        style={{ inset: hole / 2 }}
      />
      <Skeleton className="absolute top-1/2 left-1/2 h-5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-md" />
    </div>
  );
}

/** Legend column beside a donut — dot + label + count/percent pill. */
function LegendRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </span>
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Category rows — dot + label + bar + value pill. */
function CategoryRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Horizontal bar chart rows — label + bar + trailing count. */
function BarRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 flex-1 rounded-full" />
          <Skeleton className="h-3 w-6" />
        </div>
      ))}
    </div>
  );
}

/** Student/action rows — mascot, name pill, section pill, trailing wait. */
function ListRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </span>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Donut + legend split — "Referred actions", "Students by risk level". */
function DonutBoard({ legendRows = 5 }: { legendRows?: number }) {
  return (
    <KanbanBoardSkeleton
      titleWidth="56%"
      showDescription
      className="flex-1"
      footer={<InterpSkeleton />}
    >
      <div className={reportStyles.split}>
        <DonutSkeleton />
        <LegendRowsSkeleton rows={legendRows} />
      </div>
    </KanbanBoardSkeleton>
  );
}

/** Waiting bottlenecks — response stats, then the longest-waiting rows. */
function BottleneckBoard() {
  return (
    <KanbanBoardSkeleton
      titleWidth="55%"
      showDescription
      className="flex-1"
      footer={<InterpSkeleton />}
    >
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 w-full rounded-md" />
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
      <ListRowsSkeleton rows={3} />
    </KanbanBoardSkeleton>
  );
}

/** Who needs attention first — summary line + the watchlist data table. */
function AttentionBoard() {
  return (
    <KanbanBoardSkeleton
      titleWidth="48%"
      showDescription
      className="flex-1"
      footer={<InterpSkeleton />}
    >
      <Skeleton className="h-4 w-3/4" />
      <div className={alertsStyles.tableWrap} aria-hidden="true">
        <Table className={`${cascade.table} w-full table-fixed`}>
          <TableHeader>
            <TableRow className="bg-muted/50 [&>th]:border-t-0">
              <TableHead className="h-10 truncate">
                <Skeleton className="h-3 w-14" />
              </TableHead>
              <TableHead style={{ width: 170 }} className="h-10 truncate">
                <Skeleton className="h-3 w-16" />
              </TableHead>
              <TableHead style={{ width: 90 }} className="h-10 truncate">
                <Skeleton className="h-3 w-8" />
              </TableHead>
              <TableHead style={{ width: 220 }} className="h-10 truncate">
                <Skeleton className="h-3 w-28" />
              </TableHead>
              <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[0, 1, 2].map((row) => (
              <TableRow key={row}>
                <TableCell className="truncate">
                  <span className="flex min-w-0 items-center gap-2">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="mt-1 h-3 w-16" />
                    </span>
                  </span>
                </TableCell>
                <TableCell className="truncate">
                  <Skeleton className="h-3 w-20" />
                </TableCell>
                <TableCell className="truncate">
                  <Skeleton className="h-3 w-10" />
                </TableCell>
                <TableCell className="truncate">
                  <Skeleton className="h-3 w-32" />
                </TableCell>
                <TableCell className="truncate">
                  <Skeleton className="size-3.5" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </KanbanBoardSkeleton>
  );
}

/** Risk section: two boards, then the trend and the watchlist. */
export function GuidanceAdmRiskSkeleton() {
  return (
    <ShimmerGroup>
      <div
        className={styles.insights}
        aria-busy="true"
        aria-label="Loading risk dashboard"
      >
        <div className={styles.insightsGrid} aria-hidden="true">
          <DonutBoard legendRows={4} />
          <KanbanBoardSkeleton
            titleWidth="60%"
            showDescription
            className="flex-1"
            footer={<InterpSkeleton />}
          >
            <BarRowsSkeleton />
          </KanbanBoardSkeleton>
        </div>

        <KanbanBoardSkeleton
          titleWidth="52%"
          showDescription
          className="flex-1"
          footer={<InterpSkeleton />}
        >
          <Skeleton className="h-[240px] w-full rounded-md" />
        </KanbanBoardSkeleton>

        <AttentionBoard />
      </div>
    </ShimmerGroup>
  );
}

/** Full /guidance/reports skeleton, in live render order. */
export function GuidanceAdmSkeleton(): React.ReactElement {
  return (
    <ShimmerGroup>
      <section
        className={styles.page}
        aria-busy="true"
        aria-label="Loading referrals report"
      >
      {/* Key findings — the same stat deck the live page renders, loading. */}
      <div aria-hidden="true">
        <StatDeck
          columns={4}
          loading
          items={[]}
          ariaLabel="Key findings"
        />
      </div>

      {/* Report row — category bars, referred-actions donut, referral trend. */}
      <div className={reportStyles.threeCol} aria-hidden="true">
        <KanbanBoardSkeleton
          titleWidth="58%"
          showDescription
          className="flex-1"
          footer={<InterpSkeleton />}
        >
          <CategoryRowsSkeleton />
        </KanbanBoardSkeleton>

        <DonutBoard />

        <KanbanBoardSkeleton
          titleWidth="60%"
          showDescription
          className="flex-1"
          footer={<InterpSkeleton />}
        >
          <Skeleton className="h-[200px] w-full rounded-md" />
        </KanbanBoardSkeleton>
      </div>

      {/* Insights — waiting bottlenecks + recommended actions. */}
      <div className={styles.insightsGrid} aria-hidden="true">
        <BottleneckBoard />
        <KanbanBoardSkeleton
          titleWidth="58%"
          showDescription
          className="flex-1"
        >
          <ListRowsSkeleton rows={4} />
        </KanbanBoardSkeleton>
      </div>

      <GuidanceAdmRiskSkeleton />
      </section>
    </ShimmerGroup>
  );
}
