"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  NurseAlertsCasesTable,
  matchesAlertFilters,
  type TypeTrack,
} from "./components/nurse-alerts-cases-table";
import { NurseAlertsSkeleton } from "./components/NurseAlertsSkeleton";
import { fetchNurseAlerts } from "@/services/nurse/alerts.service";
import { fetchNurseRiskLevels } from "@/services/nurse/risk.service";
import type {
  NurseAlertItem,
  NurseAlertsPage,
  NurseRiskLevel,
} from "@/services/nurse/nurse.types";
import { useNurseInvalidate } from "../overview/components/use-nurse-mutation";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import { PAGE_SIZE } from "@/components/shared/pagination";
import styles from "./components/nurse-alerts.module.css";
import pageStyles from "../pages.module.css";

/**
 * Load every case on the desk once, like /guidance/alerts: the board then
 * filters (type tabs + search) and pages client-side, so switching tabs is
 * instant and the counts cover the whole desk rather than the current page.
 * The bundled notification list is skipped — this page only renders cases.
 */
async function fetchAllAlertCases(signal?: AbortSignal): Promise<NurseAlertsPage> {
  const first = await fetchNurseAlerts({
    page: 1,
    pageSize: PAGE_SIZE,
    signal,
    includeNotifications: false,
  });
  if (first.totalPages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) =>
      fetchNurseAlerts({
        page: i + 2,
        pageSize: PAGE_SIZE,
        signal,
        includeNotifications: false,
      })
    )
  );
  return {
    ...first,
    alerts: [first.alerts, ...rest.map((r) => r.alerts)].flat(),
    cases: [first.cases, ...rest.map((r) => r.cases)].flat(),
    page: 1,
  };
}

/** The risk endpoint is bounded to 15 ids per call — chunk the whole desk. */
async function fetchAllRiskLevels(
  studentIds: string[]
): Promise<Record<string, NurseRiskLevel>> {
  if (studentIds.length === 0) return {};
  const chunks: string[][] = [];
  for (let i = 0; i < studentIds.length; i += 15) {
    chunks.push(studentIds.slice(i, i + 15));
  }
  const settled = await Promise.all(
    chunks.map((chunk) => fetchNurseRiskLevels(chunk))
  );
  return Object.assign({}, ...settled);
}

export default function NurseAlertsPage() {
  const invalidateNurse = useNurseInvalidate();
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const [queryInput, setQueryInput] = React.useState("");
  // The desk type tabs are a view-only filter on the rows already loaded —
  // never a refetch, so switching is instant (same as /guidance/alerts).
  const [track, setTrack] = React.useState<TypeTrack>("");

  const { data, isPending, isError, refetch, isFetching } =
    useQuery<NurseAlertsPage>({
      ...liveQueryOptions,
      queryKey: ["nurse-alerts", "cases", termKey],
      queryFn: ({ signal }) => fetchAllAlertCases(signal),
      placeholderData: keepPreviousData,
      enabled: termReady,
    });

  const cases = React.useMemo<NurseAlertItem[]>(
    () => data?.cases ?? [],
    [data]
  );

  const studentIds = React.useMemo(
    () =>
      [
        ...new Set(
          cases
            .map((a) => a.studentId)
            .filter((id): id is string => id !== null)
        ),
      ].sort(),
    [cases]
  );

  const {
    data: riskByStudent,
    isPending: riskPending,
    isFetching: riskFetching,
    isError: riskError,
    refetch: refetchRisk,
  } = useQuery<Record<string, NurseRiskLevel>>({
    ...liveQueryOptions,
    queryKey: ["nurse-risk-levels", studentIds, termKey],
    queryFn: () => fetchAllRiskLevels(studentIds),
    staleTime: 300_000,
    enabled: termReady && studentIds.length > 0,
  });
  const riskLoading = studentIds.length > 0 && (riskPending || riskFetching);

  if (isPending) {
    return <NurseAlertsSkeleton />;
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <div className={styles.pageError} role="alert">
          <p className={styles.pageErrorTitle}>
            We couldn&apos;t load the referred cases
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
            {isFetching ? "Retrying…" : "Try again"}
          </Button>
        </div>
      </section>
    );
  }

  // Same predicate the board uses, so `pageFit` flips on the very keystroke
  // the empty callout appears (mirrors /guidance/alerts).
  const visibleCount = cases.filter((a) =>
    matchesAlertFilters(a, queryInput, track)
  ).length;
  const isEmpty = cases.length === 0 || visibleCount === 0;
  const refreshing = isFetching && !isPending;

  return (
    <section
      className={isEmpty ? `${styles.page} ${pageStyles.pageFit}` : styles.page}
      aria-busy={refreshing || undefined}
      aria-label="Referred cases"
    >
      {riskError && studentIds.length > 0 ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: "0.8125rem",
            color: "var(--destructive)",
          }}
        >
          Risk levels couldn&apos;t load.{" "}
          <button
            type="button"
            onClick={() => refetchRisk()}
            disabled={riskFetching}
            style={{
              textDecoration: "underline",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "inherit",
            }}
          >
            {riskFetching ? "Retrying…" : "Retry"}
          </button>
        </p>
      ) : null}
      <NurseAlertsCasesTable
        rows={cases}
        riskByStudent={riskByStudent ?? {}}
        riskLoading={riskLoading}
        query={queryInput}
        onQueryChange={setQueryInput}
        type={track}
        onTypeChange={setTrack}
        onChanged={() => {
          invalidateNurse();
        }}
      />
    </section>
  );
}
