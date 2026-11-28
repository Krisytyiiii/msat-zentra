"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import {
  NurseOverviewCommandBar,
  NurseOverviewCommandSkeleton,
} from "./components/NurseOverviewCommandBar";
import { NurseLatestReferralsPanel } from "./components/NurseOverviewQueues";
import { NurseOverviewBreakdown } from "./components/NurseOverviewBreakdown";
import {
  NurseCaseLoadBoard,
  NurseWaitingTimeBoard,
} from "./components/NurseOverviewTrends";
import { fetchNurseOverview } from "@/services/nurse/overview.service";
import type { NurseOverviewData } from "@/services/nurse/nurse.types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import styles from "./components/nurse-overview.module.css";
import cardStyles from "./components/nurse-referral-card.module.css";

export default function NurseOverviewPage() {
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const { data, isPending, isError, refetch, isFetching } =
    useQuery<NurseOverviewData>({
      ...liveQueryOptions,
      queryKey: ["nurse-overview", "preview", termKey],
      queryFn: ({ signal }) => fetchNurseOverview(signal),
      placeholderData: keepPreviousData,
      enabled: termReady,
    });

  if (isPending) {
    return (
      <section
        className={styles.page}
        aria-busy="true"
        aria-label="Loading clinic overview"
      >
        <ShimmerGroup>
          <NurseOverviewCommandSkeleton />

          <div className={styles.body}>
            <div className={styles.chartsCol}>
              <div className={styles.skeletonBoard}>
                <Skeleton className="h-4 w-28" />
                <Skeleton className={styles.skelLine} />
              </div>

              <div className={styles.threeCol}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={styles.skeletonBoard}>
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className={styles.skelChartBlock} />
                  </div>
                ))}
              </div>
            </div>

            <aside className={styles.railCol} aria-hidden="true">
              <div className={styles.gridHeader}>
                <div className={styles.gridHeaderText}>
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <div className={styles.referralGrid}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className={styles.skeletonBoard}>
                    <div className={styles.caseInfoSkeleton}>
                      <Skeleton className="size-9 shrink-0 rounded-lg" />
                      <div className={styles.caseNameBlock}>
                        <Skeleton className="h-4 w-32 min-w-0" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
                    </div>
                    <div className={cardStyles.cardMetrics}>
                      <div className={cardStyles.cardMetric}>
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="mt-1 h-5 w-16" />
                        <Skeleton className="mt-1 h-3 w-20" />
                      </div>
                      <div className={cardStyles.cardMetric}>
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="mt-1 h-4 w-12" />
                        <Skeleton className="mt-1 h-3 w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </ShimmerGroup>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <div className={styles.pageError} role="alert">
          <p className={styles.pageErrorTitle}>
            We couldn&apos;t load the clinic overview
          </p>
          <p className={styles.pageErrorHint}>
            Please check your internet connection and try again.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            {isFetching ? (
              <Loader2 className={styles.spin} aria-hidden="true" />
            ) : null}
            Try again
          </Button>
        </div>
      </section>
    );
  }

  const refreshing = isFetching && !isPending;

  // No clinic cases at all — one centered callout instead of empty boards.
  const isEmpty =
    data.kpis.total === 0 &&
    (data.latestReferrals ?? []).length === 0 &&
    (data.dailyTrend ?? []).length === 0;

  if (isEmpty) {
    return (
      <section className={styles.page} aria-label="Clinic overview">
        <PageEmptyCallout>
          No clinic activity for the selected term yet. Referrals, follow-ups,
          and health records will appear here once cases are filed.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <section
      className={styles.page}
      aria-busy={refreshing}
      aria-label="Clinic overview"
    >
      <NurseOverviewCommandBar
        kpis={data.kpis}
        needsReview={data.needsReview ?? []}
      />

      <div
        className={`${styles.body} ${
          (data.latestReferrals ?? []).length > 0 ? "" : styles.bodyFull
        }`}
      >
        {/* Left: every chart. Right: the newest referrals rail (20% wide). */}
        <div className={styles.chartsCol}>
          <NurseCaseLoadBoard dailyTrend={data.dailyTrend} />

          <NurseOverviewBreakdown
            statusBreakdown={data.statusBreakdown}
            clinicStatusBreakdown={data.clinicStatusBreakdown}
            admStatusBreakdown={data.admStatusBreakdown}
            waitingSlot={<NurseWaitingTimeBoard needsReview={data.needsReview} />}
          />
        </div>

        {/* Hidden entirely until the desk has referrals — an empty rail is
            noise on a command page. */}
        {(data.latestReferrals ?? []).length > 0 ? (
          <aside className={styles.railCol}>
            <NurseLatestReferralsPanel
              latestReferrals={data.latestReferrals ?? []}
            />
          </aside>
        ) : null}
      </div>
    </section>
  );
}
