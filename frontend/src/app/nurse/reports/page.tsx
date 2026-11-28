"use client";

import { FileBarChart2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NurseEmptyCard } from "../components/NurseEmptyCard";
import {
  GuidanceAdmInsights,
  GuidanceAdmStats,
} from "../../guidance/adm/components/GuidanceAdmInsights";
import { GuidanceAdmReports } from "../../guidance/adm/components/guidance-adm-reports";
import { GuidanceAdmSkeleton } from "../../guidance/adm/components/GuidanceAdmSkeleton";
import { NurseAdmRisk } from "./components/NurseAdmRisk";
import { useNurseReportData } from "./components/use-nurse-report-data";
/* Same page/board chrome as /guidance/reports so both report desks render
   pixel-identical layouts; only the case data and queue deep-links differ. */
import styles from "../../guidance/adm/components/guidance-adm.module.css";
import pageStyles from "../pages.module.css";

/** Nurse queue deep-links for the shared report boards. */
const NURSE_LINKS = {
  basePath: "/nurse/referrals",
  otherSegment: "clinic",
  otherLabel: "clinic",
  scopeLabel: "clinic",
} as const;

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
    return <GuidanceAdmSkeleton />;
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <div className={styles.errorBlock} role="alert">
          <p className={styles.errorText}>
            We couldn&apos;t load the referrals report. Please check your internet
            connection and try again.
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
            {isFetching ? "Loading…" : "Try again"}
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
              <GuidanceAdmStats data={insights} />
              <GuidanceAdmReports data={data} insights={insights} />
              <GuidanceAdmInsights data={insights} links={NURSE_LINKS} />
              <NurseAdmRisk />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
