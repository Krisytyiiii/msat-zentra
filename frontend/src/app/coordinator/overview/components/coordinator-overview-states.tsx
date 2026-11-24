"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import styles from "./coordinator-overview-states.module.css";

/** Stat deck shimmers — five tiles in one bordered strip, like the live strip. */
function DeckShimmers() {
  return (
    <div className={styles.deck} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.deckTile}>
          <div className={styles.deckTileTop}>
            <Skeleton className={styles.skelIcon} />
            <Skeleton className={styles.skelMetricLabel} />
          </div>
          <Skeleton className={styles.skelMetricValue} />
          <Skeleton className={styles.skelMetricHint} />
        </div>
      ))}
    </div>
  );
}

/** Pipeline chart shimmers — donut beside the stage legend. */
function ChartShimmer() {
  return (
    <div className={styles.chartCard} aria-hidden="true">
      <div className={styles.cardHead}>
        <Skeleton className={styles.skelFlowTitle} />
        <Skeleton className={styles.skelFlowTotal} />
      </div>
      <div className={styles.chartRow}>
        <Skeleton className={styles.skelDonut} />
        <div className={styles.skelLegend}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className={styles.skelLegendRow} />
          ))}
        </div>
      </div>
      <Skeleton className={styles.skelInterpretation} />
    </div>
  );
}

/** Table shimmers — the default "Needs you next" layout (queue rows). */
function QueueTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className={styles.queueTable}>
      <div className={styles.queueTableHead}>
        <Skeleton className={styles.queueTableHeadCell} />
        <Skeleton className={styles.queueTableHeadCell} />
        <Skeleton className={styles.queueTableHeadCell} />
        <Skeleton className={styles.queueTableHeadCell} />
        <Skeleton className={styles.queueTableHeadCell} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.queueTableRow}>
          <Skeleton className={styles.queueTableCellName} />
          <Skeleton className={styles.queueTableCellSm} />
          <Skeleton className={styles.queueTableCellMd} />
          <Skeleton className={styles.queueTableCellMd} />
          <Skeleton className={styles.queueTableCellSm} />
        </div>
      ))}
    </div>
  );
}

/** Devices panel shimmers — the same card anatomy as the loaded device cards. */
function PanelShimmer({ cards = 2 }: { cards?: number }) {
  return (
    <div className={styles.panel} aria-hidden="true">
      <div className={styles.panelHead}>
        <Skeleton className={styles.skelIcon} />
        <div className={styles.skelLines}>
          <Skeleton className={styles.skelLine} />
          <Skeleton className={styles.skelLineSm} />
        </div>
      </div>
      <div className={styles.skelPanelCards}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className={styles.skelPanelCard}>
            <div className={styles.skelPanelCardHead}>
              <Skeleton className={styles.skelPanelCardTitle} />
              <Skeleton className={styles.skelAvatar} />
            </div>
            <Skeleton className={styles.skelPanelCardMetric} />
            <Skeleton className={styles.skelPanelCardMeter} />
            <Skeleton className={styles.skelPanelCardFact} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Loading skeleton for /coordinator/overview — mirrors the desk layout: the
 * stat deck strip, then the pipeline chart over the priority queue beside the
 * devices / meetings watchlist.
 */
export function CoordinatorOverviewSkeleton() {
  return (
    <section className={styles.page} aria-busy="true">
      <ShimmerGroup>
        <DeckShimmers />

        <div className={styles.workGrid} aria-hidden="true">
          <div className={styles.mainCol}>
            <ChartShimmer />

            <div className={styles.queue}>
              <div className={styles.queueHead}>
                <Skeleton className={styles.skelFlowTitle} />
                <Skeleton className={styles.skelFlowTotal} />
              </div>
              <QueueTable />
            </div>
          </div>

          <div className={styles.rail}>
            <PanelShimmer />
          </div>
        </div>
      </ShimmerGroup>
    </section>
  );
}

export function CoordinatorOverviewError({
  onRetry,
  isRefetching,
}: {
  onRetry: () => void;
  isRefetching: boolean;
}) {
  return (
    <section className={styles.page}>
      <div className={styles.errorBlock} role="alert">
        <p className={styles.errorText}>
          We couldn&apos;t load the coordinator overview. Please check your
          internet connection and try again.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={isRefetching}
          onClick={onRetry}
        >
          {isRefetching ? (
            <Loader2 className={styles.spin} aria-hidden="true" />
          ) : null}
          {isRefetching ? "Loading…" : "Try again"}
        </Button>
      </div>
    </section>
  );
}
