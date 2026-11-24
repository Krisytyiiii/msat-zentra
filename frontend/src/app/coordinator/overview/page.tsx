"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CaseHistoryDialog,
  type HistoryTarget,
} from "../components/CaseHistoryDialog";
import { useCoordinatorOverview } from "./components/use-coordinator-overview";
import { useCoordinatorBooking } from "../referrals/components/use-coordinator-booking";
import { CoordinatorReferralsBookDialog } from "../referrals/components/coordinator-referrals-book-dialog";
import { CoordinatorOverviewKpis } from "./components/coordinator-overview-kpis";
import { CoordinatorOverviewStageChart } from "./components/coordinator-overview-stage-chart";
import { CoordinatorOverviewForwards } from "./components/coordinator-overview-forwards";
import { CoordinatorOverviewBoards } from "./components/coordinator-overview-boards";
import {
  CoordinatorOverviewError,
  CoordinatorOverviewSkeleton,
} from "./components/coordinator-overview-states";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import styles from "./components/coordinator-overview.module.css";

export default function CoordinatorOverviewPage() {
  const [historyTarget, setHistoryTarget] =
    React.useState<HistoryTarget | null>(null);
  const overview = useCoordinatorOverview();
  const queryClient = useQueryClient();
  const invalidateReferrals = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["coordinator-referrals"] });
    void queryClient.invalidateQueries({ queryKey: ["coordinator-notifications"] });
  }, [queryClient]);
  const booking = useCoordinatorBooking({
    selected: null,
    meetings: [],
    invalidateReferrals,
  });

  if (overview.isPending) return <CoordinatorOverviewSkeleton />;
  if (overview.isError) {
    return (
      <CoordinatorOverviewError
        onRetry={overview.refetch}
        isRefetching={overview.isRefetching}
      />
    );
  }

  // No ADM activity at all → one centered callout instead of empty boards.
  const isEmpty =
    overview.referredToMe === 0 &&
    overview.certificationsIssued === 0 &&
    overview.activeEnrolled === 0 &&
    overview.forwards.rows.length === 0 &&
    overview.devices.oldestOut.length === 0 &&
    overview.stageDonut.every((entry) => entry.value === 0);

  if (isEmpty) {
    return (
      <section className={styles.page}>
        <PageEmptyCallout>
          No ADM activity for the selected term yet. Referrals, certifications,
          and device tracking will appear here once cases are filed.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <CoordinatorOverviewKpis
        needsReviewTotal={overview.needsReview}
        needsReviewReady={overview.needsReviewReady}
        referredToMe={overview.referredToMe}
        certificationsIssued={overview.certificationsIssued}
        awaitingPrincipal={overview.awaitingPrincipal}
        activeEnrolled={overview.activeEnrolled}
        className={styles.statsDeck}
      />

      <div className={styles.workGrid}>
        <div className={styles.mainCol}>
          <CoordinatorOverviewStageChart stageDonut={overview.stageDonut} />

          <CoordinatorOverviewForwards
            rows={overview.forwards.rows}
            isPending={overview.forwards.isPending}
            isError={overview.forwards.isError}
            isRefetching={overview.forwards.isRefetching}
            now={overview.now}
            bookPendingId={booking.bookPendingId}
            onRetry={overview.forwards.refetch}
            onHistory={setHistoryTarget}
            onBook={booking.bookForRow}
          />
        </div>

        <aside className={styles.rail} aria-label="Live watchlist">
          <CoordinatorOverviewBoards
            devicesIssued={overview.devices.data?.issued ?? null}
            devicesReturned={overview.devices.data?.returned ?? null}
            devicesPending={overview.devices.isPending}
            oldestOut={overview.devices.oldestOut}
            now={overview.now}
          />
        </aside>
      </div>

      <CaseHistoryDialog
        target={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />

      <CoordinatorReferralsBookDialog
        open={booking.bookOpen}
        selected={booking.bookTarget}
        rescheduleMeeting={booking.rescheduleMeeting}
        venuePreset={booking.bookVenuePreset}
        pending={booking.bookPending}
        serverError={booking.bookError}
        onClose={booking.closeBook}
        onSubmit={booking.confirmBook}
      />
    </section>
  );
}
