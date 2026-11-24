"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  GuidanceAlertsTable,
} from "./components/guidance-alerts-table";
import { GuidanceAlertsSkeleton } from "./components/GuidanceAlertsSkeleton";
import { rowSearchText, rowType } from "./components/guidance-alerts-helpers";
import { fetchGuidanceAlertCases } from "@/services/guidance/alerts.service";
import type {
  AlertCaseType,
  GuidanceAlertCasesData,
} from "@/services/guidance/alerts.types";
import { useTerm } from "@/lib/term/TermContext";
import { guidanceLiveQueryOptions } from "@/lib/api/live";
import { PAGE_SIZE } from "@/components/shared/pagination";
import styles from "./components/guidance-alerts.module.css";
import pageStyles from "../pages.module.css";

/**
 * The board filters locally, so load every page of the merged desk once.
 * Requests happen on mount instead of on every keystroke.
 */
async function fetchAllAlertCases(signal?: AbortSignal): Promise<GuidanceAlertCasesData> {
  const first = await fetchGuidanceAlertCases({ page: 1, pageSize: PAGE_SIZE }, { signal });
  if (first.totalPages <= 1) return first;
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) =>
      fetchGuidanceAlertCases({ page: i + 2, pageSize: PAGE_SIZE }, { signal })
    )
  );
  return {
    ...first,
    cases: [first.cases, ...rest.map((r) => r.cases)].flat(),
    page: 1,
  };
}

export default function GuidanceAlertsPage() {
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const [typeFilter, setTypeFilter] = React.useState<AlertCaseType>("");
  const [queryInput, setQueryInput] = React.useState("");

  // One server request for the whole merged desk (referrals + live
  // interventions), then search / tabs / paging are all client-side. The board
  // used to fan out to twenty requests and made the backend recompute the live
  // cohort ten times per visit.
  const casesQuery = useQuery<GuidanceAlertCasesData>({
    ...guidanceLiveQueryOptions,
    queryKey: ["guidance-alerts", "cases", termKey],
    queryFn: ({ signal }) => fetchAllAlertCases(signal),
    placeholderData: keepPreviousData,
    enabled: termReady,
  });

  const isFetching = casesQuery.isFetching;
  const data = casesQuery.data;

  if (casesQuery.isPending) {
    return <GuidanceAlertsSkeleton />;
  }

  if (casesQuery.isError || !data || !data.summary) {
    return (
      <section className={styles.page}>
        <div className={styles.pageError} role="alert">
          <p className={styles.pageErrorTitle}>We couldn&apos;t load the referred cases</p>
          <p className={styles.pageErrorHint}>
            Please check your internet connection and try again.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isFetching}
            onClick={() => {
              void casesQuery.refetch();
            }}
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
  // the empty callout appears (mirrors /nurse/alerts).
  const needle = queryInput.trim().toLowerCase();
  const visibleCount = data.cases.filter((row) => {
    if (typeFilter && rowType(row) !== typeFilter) return false;
    if (needle && !rowSearchText(row).toLowerCase().includes(needle)) return false;
    return true;
  }).length;
  const isEmpty = data.summary.total === 0 || visibleCount === 0;

  return (
    <section
      className={isEmpty ? `${styles.page} ${pageStyles.pageFit}` : styles.page}
      aria-busy={isFetching || undefined}
      aria-label="Referred cases"
    >
      <GuidanceAlertsTable
        rows={data.cases}
        riskByStudent={data.riskByStudent}
        summary={data.summary}
        query={queryInput}
        type={typeFilter}
        onQueryChange={setQueryInput}
        onTypeChange={setTypeFilter}
      />
    </section>
  );
}
