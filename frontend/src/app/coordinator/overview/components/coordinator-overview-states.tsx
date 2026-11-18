"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./coordinator-overview-states.module.css";

/** Five shimmer rows that mirror the hero's at-a-glance metric list. */
function MetricShimmers() {
  return (
    <div className={styles.metrics} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.metricRow}>
          <Skeleton className={styles.skelIcon} />
          <Skeleton className={styles.skelMetricLabel} />
          <Skeleton className={styles.skelMetricValue} />
        </div>
      ))}
    </div>
  );
}

/** Queue row shimmers — same rhythm as the loaded hand-off rows. */
function QueueRows({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.queueRows}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.queueRow}>
          <Skeleton className={styles.skelAvatar} />
          <div className={styles.skelLines}>
            <Skeleton className={styles.skelLine} />
            <Skeleton className={styles.skelLineSm} />
          </div>
          <Skeleton className={styles.skelPill} />
        </div>
      ))}
    </div>
  );
}

/** Panel shimmers for the devices / meetings watchlist. */
function PanelShimmer({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.panel} aria-hidden="true">
      <div className={styles.panelHead}>
        <Skeleton className={styles.skelIcon} />
        <div className={styles.skelLines}>
          <Skeleton className={styles.skelLine} />
          <Skeleton className={styles.skelLineSm} />
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={styles.skelPanelRow} />
      ))}
    </div>
  );
}

/**
 * Loading skeleton for /coordinator/overview — mirrors the command-center
 * layout: hero header (copy + metrics), pipeline strip, then the priority
 * queue beside the devices / meetings watchlist.
 */
export function CoordinatorOverviewSkeleton() {
  return (
    <section className={styles.page} aria-busy="true">
      <div className={styles.hero} aria-hidden="true">
        <div className={styles.heroCopy}>
          <Skeleton className={styles.skelEyebrow} />
          <Skeleton className={styles.skelTitle} />
          <Skeleton className={styles.skelSub} />
          <div className={styles.skelActions}>
            <Skeleton className={styles.skelButton} />
            <Skeleton className={styles.skelButton} />
          </div>
        </div>
        <MetricShimmers />
      </div>

      <div className={styles.flow} aria-hidden="true">
        <div className={styles.flowHead}>
          <Skeleton className={styles.skelFlowTitle} />
          <Skeleton className={styles.skelFlowTotal} />
        </div>
        <Skeleton className={styles.skelFlowBar} />
        <div className={styles.flowSteps}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className={styles.skelStep} />
          ))}
        </div>
      </div>

      <div className={styles.workGrid} aria-hidden="true">
        <div className={styles.queue}>
          <div className={styles.queueHead}>
            <Skeleton className={styles.skelFlowTitle} />
            <Skeleton className={styles.skelFlowTotal} />
          </div>
          <QueueRows />
        </div>
        <div className={styles.rail}>
          <PanelShimmer />
          <PanelShimmer />
        </div>
      </div>
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
