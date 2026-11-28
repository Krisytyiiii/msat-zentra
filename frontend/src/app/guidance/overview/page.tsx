"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { StatDeck } from "@/components/ui/stat-deck";
import {
  GuidanceOverviewSkeleton,
  DetectionFlowSkeleton,
} from "./components/guidance-overview-skeleton";
import {
  ClipboardList,
  FileClock,
  HeartPulse,
  Inbox,
  MessageSquare,
  Send,
} from "lucide-react";
import { GuidanceOverviewGradeTable } from "./components/guidance-overview-grade-table";
import { GuidanceOverviewRiskCharts } from "./components/guidance-overview-risk-charts";
import { GuidanceOverviewCaseloadCharts } from "./components/guidance-overview-caseload-charts";
import { fetchGuidanceOverview } from "@/services/guidance/overview.service";
import type { GuidanceOverviewData } from "@/services/guidance/overview.types";
import { fetchAllGuidanceInterventions } from "@/services/guidance/interventions.service";
import type { GuidanceInterventionsData } from "@/services/guidance/interventions.types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTerm } from "@/lib/term/TermContext";
import { useNowTick } from "@/lib/clock";
import { guidanceLiveQueryOptions, liveQueryOptions } from "@/lib/api/live";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import {
  DetectionFlowPanel,
  type DetectionLaneId,
} from "@/components/risk-dashboard/detection-flow-panel";
import styles from "./components/guidance-overview.module.css";

/** The guidance shell's shared interventions cache key (same as the shell poll). */
const INTERVENTIONS_BOARD_KEY = ["guidance-interventions", "queue"] as const;

export default function GuidanceOverviewPage() {
  const router = useRouter();
  const now = useNowTick();
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const { data, isPending, isError, refetch, isFetching } =
    useQuery<GuidanceOverviewData>({
      ...liveQueryOptions,
      queryKey: ["guidance-overview", "preview", termKey],
      queryFn: ({ signal }) => fetchGuidanceOverview(signal),
      placeholderData: keepPreviousData,
      enabled: termReady,
    });

  // Same cache entry the interventions desk and the shell's risk monitor use,
  // so the detection panel costs no extra request on this page.
  const { data: board } = useQuery<GuidanceInterventionsData>({
    ...guidanceLiveQueryOptions,
    queryKey: [...INTERVENTIONS_BOARD_KEY, termKey],
    queryFn: ({ signal }) => fetchAllGuidanceInterventions({ signal }),
    enabled: termReady,
  });

  const flowRows = React.useMemo(() => board?.students ?? [], [board]);
  const flowSummary = React.useMemo(
    () => ({
      total: flowRows.length,
      ongoing: flowRows.filter(
        (row) => row.intervention?.outcomeStatus === "ongoing",
      ).length,
    }),
    [flowRows],
  );

  const openLane = (lane: DetectionLaneId) => {
    const status =
      lane === "noPlan" ? "no_action" : lane === "followUp" ? "booked" : null;
    router.push(
      status
        ? `/guidance/interventions?status=${status}`
        : "/guidance/interventions",
    );
  };

  if (isPending) {
    return <GuidanceOverviewSkeleton />;
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <div className={styles.pageError} role="alert">
          <p className={styles.pageErrorTitle}>
            We couldn&apos;t load the guidance overview
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

  // No caseload at all → one centered callout instead of a wall of empty boards.
  const isEmpty =
    data.kpis.referredToMe === 0 &&
    data.kpis.pendingAdm === 0 &&
    data.kpis.pendingCounseling === 0 &&
    data.kpis.openInterventions === 0 &&
    data.kpis.myInterventions === 0 &&
    data.kpis.highRisk === 0 &&
    data.kpis.admHandoffs === 0 &&
    data.gradeAttention.length === 0 &&
    data.sectionHeat.length === 0 &&
    data.referralsByType.length === 0 &&
    flowRows.length === 0;

  if (isEmpty) {
    return (
      <section className={styles.page} aria-label="Guidance overview">
        <PageEmptyCallout>
          No guidance activity for the selected term yet. Referrals, risk
          signals, and caseload will appear here once cases are filed.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <section
      className={styles.page}
      aria-busy={refreshing}
      aria-label="Guidance overview"
    >
      <StatDeck
        columns={6}
        ariaLabel="Guidance queue figures"
        items={[
          {
            key: "referred",
            icon: Inbox,
            label: "Referred to me",
            unit: "cases",
            value: data.kpis.referredToMe,
            hint: "ADM + counseling on your desk",
            href: "/guidance/referrals",
            tone: "amber",
          },
          {
            key: "highrisk",
            icon: HeartPulse,
            label: "High-risk students",
            unit: "students",
            value: data.kpis.highRisk,
            hint: "Two or more flags this term",
            href: "/guidance/reports",
            tone: "red",
          },
          {
            key: "interventions",
            icon: ClipboardList,
            label: "Open interventions",
            unit: "cases",
            value: data.kpis.openInterventions,
            hint: `${data.kpis.myInterventions} assigned to me`,
            href: "/guidance/interventions",
          },
          {
            key: "counseling",
            icon: MessageSquare,
            label: "Pending counseling",
            unit: "cases",
            value: data.kpis.pendingCounseling,
            hint: "Awaiting a session",
            href: "/guidance/referrals/counseling",
          },
          {
            key: "pendingAdm",
            icon: FileClock,
            label: "Pending ADM",
            unit: "cases",
            value: data.kpis.pendingAdm,
            hint: "Awaiting endorsement",
            href: "/guidance/reports",
          },
          {
            key: "handoffs",
            icon: Send,
            label: "ADM hand-offs",
            unit: "cases",
            value: data.kpis.admHandoffs,
            hint: "Endorsed | with coordinator",
            href: "/guidance/reports",
            tone: "green",
          },
        ]}
      />

      <div className={styles.body}>
        <div className={styles.mainCol}>
          <GuidanceOverviewGradeTable rows={data.gradeAttention} />

          <GuidanceOverviewRiskCharts
            riskByLevel={data.riskByLevel}
            factorTotals={data.factorTotals}
            riskByGrade={data.riskByGrade}
          />

          <GuidanceOverviewCaseloadCharts
            referralsByType={data.referralsByType}
            sectionHeat={data.sectionHeat}
          />
        </div>

        <aside className={styles.flowAside} aria-label="Detection flow summary">
          {board ? (
            <DetectionFlowPanel
              rows={flowRows}
              summary={flowSummary}
              now={now}
              activeLane={null}
              onLaneSelect={openLane}
              scopeLabel="Students"
              unitOne="student"
              unitMany="students"
              separator="|"
              emptyHint="No students flagged this term."
              footNote=" Point at a lane to isolate it; click to open the interventions desk."
            />
          ) : (
            <div aria-busy="true" aria-label="Loading detection flow">
              <DetectionFlowSkeleton />
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
