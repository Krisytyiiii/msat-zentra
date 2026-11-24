"use client";

import { FileBarChart2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NurseEmptyCard } from "../components/NurseEmptyCard";
import {
  NurseAdmInsights,
  NurseAdmStats,
} from "./components/NurseAdmInsights";
import { NurseAdmReports } from "./components/NurseAdmReports";
import { NurseAdmRisk } from "./components/NurseAdmRisk";
import { NurseAdmHotspotStat } from "./components/NurseAdmHotspotStat";
import { NurseAdmSkeleton } from "./components/NurseAdmSkeleton";
import { useNurseReportData } from "./components/use-nurse-report-data";
import styles from "./components/nurse-adm.module.css";
import pageStyles from "../pages.module.css";

/**
 * Reports desk. Everything the page renders — case totals, category mix,
 * 12-week trend, bottlenecks, recommendations and the risk boards — comes from
 * one `/api/nurse/reports` payload, so the page never waits on a chain of
 * queue-page → risk-level → risk-factor requests.
 */
export default function NurseAdmPage() {
  const { data, insights, isPending, isError, isFetching, refetch } =
    useNurseReportData();

  if (isPending) {
    return (
      <section
        className={styles.page}
        aria-busy="true"
        aria-label="Loading referrals report"
      >
        <NurseAdmSkeleton />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <div className={styles.pageError} role="alert">
          <p className={styles.pageErrorTitle}>We couldn&apos;t load the referrals report</p>
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
  const isTrueEmpty = data.desk.length === 0;

  return (
    <section
      className={isTrueEmpty ? `${styles.page} ${pageStyles.pageFit}` : styles.page}
      aria-busy={refreshing}
      aria-label="Referrals report"
    >
      {isTrueEmpty ? (
        <NurseEmptyCard
          icon={FileBarChart2}
          title="No referrals this term"
          hint="Referral trends and outcomes will appear here once cases are filed."
          label="Referrals report"
          centered
          layout="fit"
        />
      ) : (
        <>
          {insights ? (
            <>
              <NurseAdmStats
                data={insights}
                extra={<NurseAdmHotspotStat />}
              />
              <NurseAdmReports data={data} insights={insights} />
              <NurseAdmInsights data={insights} />
              <NurseAdmRisk />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
