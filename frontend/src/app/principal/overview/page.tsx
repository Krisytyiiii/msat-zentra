"use client";

import { useQuery } from "@tanstack/react-query";
import { useTerm } from "@/lib/term/TermContext";
import { fetchOverview } from "@/services/principal/overview.service";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { OverviewRisk } from "./components/OverviewRisk";
import { OverviewPopulation } from "./components/OverviewPopulation";
import { PrincipalOverviewStats } from "./components/PrincipalOverviewStats";
import styles from "./components/overview.module.css";

export default function PrincipalOverviewPage() {
  const { activeTerm, termReady } = useTerm();
  const { data, isPending } = useQuery({
    queryKey: ["overview", activeTerm?.termId ?? null],
    queryFn: fetchOverview,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: termReady,
  });
  const loading = isPending || !termReady;

  // Nothing to report (no sections, learners, staff, or filed records) → one
  // centered callout instead of zero-filled boards. Same rule the registry
  // desks use: every value this page renders must be empty before the shared
  // PageEmptyCallout (amber InsightCallout) replaces the boards.
  const isEmpty =
    !loading &&
    !!data &&
    data.kpis.activeSections === 0 &&
    data.kpis.enrollment === 0 &&
    data.kpis.teachers === 0 &&
    data.kpis.anecdotals === 0 &&
    data.sections.length === 0 &&
    data.atRisk.students === 0 &&
    data.riskByLevel.high === 0 &&
    data.riskByLevel.moderate === 0 &&
    data.riskByLevel.low === 0 &&
    data.attendanceWatch === 0 &&
    data.honorRoll === 0 &&
    data.admPending === 0;

  return (
    <section className={styles.page} aria-busy={loading || undefined}>
      {isEmpty ? (
        <PageEmptyCallout>
          No records for the selected term yet. Sections, enrollment, risk
          signals, and filed reports will appear here once data is recorded.
        </PageEmptyCallout>
      ) : (
        <div className={styles.layout}>
          <div className={styles.stack}>
            <PrincipalOverviewStats />

            <OverviewRisk />

            <OverviewPopulation />
          </div>
        </div>
      )}
    </section>
  );
}
