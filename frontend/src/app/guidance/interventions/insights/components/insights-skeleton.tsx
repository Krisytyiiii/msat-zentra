"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import {
  KanbanBoardSkeleton,
  ZentraPageHeaderSkeleton,
} from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import pageStyles from "../../../pages.module.css";
import styles from "./insights.module.css";

/**
 * Loading skeleton for /guidance/interventions/insights — one shimmer sweep
 * over an exact copy of the live page so nothing shifts when the data lands:
 * header → four-figure stat deck → pipeline-trend and
 * sessions-by-type charts → success-by-risk bars and success-by-grade donut →
 * section × outcome heatmap. Every placeholder reuses the same shell, grid and
 * CSS module the live boards use, so paddings, chart heights, legends and the
 * "what it means" callouts match to the pixel.
 */

/** Footer "What it means" callout — pinned to the board bottom like the real one. */
function CalloutSkeleton() {
  return <Skeleton className="mt-auto h-12 w-full rounded-md" />;
}

/** Chart legend row — swatch + label, as rendered under every chart. */
function LegendSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className={styles.legend} aria-hidden="true">
      {Array.from({ length: items }).map((_, i) => (
        <span key={i} className={styles.legendItem}>
          <Skeleton className="size-2 shrink-0 rounded-[2px]" />
          <Skeleton className="h-3 w-16" />
        </span>
      ))}
    </div>
  );
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
      <div className="absolute rounded-full bg-card" style={{ inset: hole / 2 }} />
      <Skeleton className="absolute top-1/2 left-1/2 h-5 w-12 -translate-x-1/2 -translate-y-1/2 rounded-md" />
    </div>
  );
}

/** Pipeline trend — 250px composed chart, three-entry legend, callout. */
function TrendBoardSkeleton() {
  return (
    <KanbanBoardSkeleton
      titleWidth="8rem"
      showDescription
      className="flex-1"
      footer={<CalloutSkeleton />}
    >
      <div className={styles.chartBody} aria-hidden="true">
        <Skeleton className="h-[250px] w-full rounded-md" />
        <LegendSkeleton items={3} />
      </div>
    </KanbanBoardSkeleton>
  );
}

/** Sessions by type — vertical stacked bars (≈4 rows), three-entry legend. */
function SessionBoardSkeleton() {
  return (
    <KanbanBoardSkeleton
      titleWidth="9rem"
      showDescription
      className="flex-1"
      footer={<CalloutSkeleton />}
    >
      <div className={styles.chartBody} aria-hidden="true">
        <Skeleton className="h-[178px] w-full rounded-md" />
        <LegendSkeleton items={3} />
      </div>
    </KanbanBoardSkeleton>
  );
}

/** Success-by-risk — horizontal stacked bars + per-level breakdown list. */
function OutcomeBarsSkeleton() {
  return (
    <KanbanBoardSkeleton
      titleWidth="10rem"
      showDescription
      className="flex-1"
      footer={<CalloutSkeleton />}
    >
      <div className={styles.chartBody} aria-hidden="true">
        <Skeleton className="h-[150px] w-full rounded-md" />
        <LegendSkeleton items={3} />
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-1.5">
              <Skeleton className="h-3 w-20" />
              <span className="flex shrink-0 items-center gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-10 rounded-md" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </KanbanBoardSkeleton>
  );
}

/** Success-by-grade — 210px donut with a centred rate. */
function OutcomeDonutSkeleton() {
  return (
    <KanbanBoardSkeleton
      titleWidth="9rem"
      showDescription
      className="flex-1"
      footer={<CalloutSkeleton />}
    >
      <div className={styles.donutWrap} aria-hidden="true">
        <div className="flex h-[210px] items-center justify-center">
          <DonutSkeleton />
        </div>
      </div>
    </KanbanBoardSkeleton>
  );
}

/** Section × outcome heatmap — header row, section rows, legend + note. */
function HeatmapSkeleton() {
  return (
    <KanbanBoardSkeleton
      titleWidth="12rem"
      showDescription
      className="flex-1"
    >
      <div className={styles.heatScroll} aria-hidden="true">
        <table className={styles.heatTable}>
          <thead>
            <tr>
              <th scope="col" className={styles.heatRowHead}>
                <Skeleton className="ml-9 h-3 w-16" />
              </th>
              {[0, 1, 2, 3].map((i) => (
                <th key={i} scope="col" className={styles.heatColHead}>
                  <Skeleton className="mx-auto h-3 w-14" />
                  <Skeleton className="mx-auto mt-1 h-3 w-6" />
                </th>
              ))}
              <th scope="col" className={styles.heatColHead}>
                <Skeleton className="mx-auto h-3 w-12" />
              </th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4].map((row) => (
              <tr key={row}>
                <th scope="row" className={styles.heatRowHead}>
                  <span className={styles.heatSectionCell}>
                    <Skeleton className="size-7 shrink-0 rounded-md" />
                    <span className={styles.heatSectionText}>
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="mt-1 h-3 w-10" />
                    </span>
                  </span>
                </th>
                {[0, 1, 2, 3].map((cell) => (
                  <td key={cell} className={styles.heatCell}>
                    <Skeleton className={styles.heatBox} />
                  </td>
                ))}
                <td className={styles.heatCell}>
                  <Skeleton className="mx-auto h-3 w-8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.heatFooter} aria-hidden="true">
        <div className={styles.heatLegend}>
          <Skeleton className="h-3 w-3" />
          <span className={styles.heatLegendSwatches}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className={styles.heatLegendSwatch} />
            ))}
          </span>
          <Skeleton className="h-3 w-4" />
        </div>
        <Skeleton className="h-3 w-56" />
      </div>
    </KanbanBoardSkeleton>
  );
}

/** Full insights skeleton, in live render order. */
export function InsightsSkeleton() {
  return (
    <section
      className={pageStyles.page}
      aria-busy="true"
      aria-label="Loading intervention insights"
    >
      <ShimmerGroup>
        <ZentraPageHeaderSkeleton />

        <StatDeckSkeleton />

        <div className={pageStyles.grid2} aria-hidden="true">
          <TrendBoardSkeleton />
          <SessionBoardSkeleton />
        </div>

        <div className="grid gap-3 lg:grid-cols-2" aria-hidden="true">
          <OutcomeBarsSkeleton />
          <OutcomeDonutSkeleton />
        </div>

        <div aria-hidden="true">
          <HeatmapSkeleton />
        </div>
      </ShimmerGroup>
    </section>
  );
}

/** Four KPI tiles — the shared StatDeck loading shape. */
function StatDeckSkeleton() {
  return (
    <div aria-hidden="true">
      <StatDeck columns={4} loading items={[]} ariaLabel="Intervention figures" />
    </div>
  );
}
