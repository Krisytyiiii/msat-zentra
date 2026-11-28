"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FolderOpen, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import { NurseEmptyCard } from "../components/NurseEmptyCard";
import { fetchNurseAlerts } from "@/services/nurse/alerts.service";
import type { NurseAlertsPage } from "@/services/nurse/nurse.types";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import { NurseDocumentariesList } from "./components/NurseDocumentariesList";
import {
  buildEntries,
  entryStatusLabel,
  type DocEntry,
  type TypeFilter,
} from "./components/documentaries-utils";
import styles from "./health-records-page.module.css";
import listStyles from "./components/NurseDocumentariesList.module.css";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { useSearchParams } from "next/navigation";
import { PAGE_SIZE } from "@/components/shared/pagination";

// The polaroid desk stacks a handful of records at a time (same rhythm as the
// guidance session-documents board), so page it 5 at a time instead of 15.
const HEALTH_RECORDS_PAGE_SIZE = 5;

/**
 * Load every health record on the desk once, like the alerts page: search,
 * type tabs and paging are all client-side afterwards.
 */
async function fetchAllHealthRecords(
  signal?: AbortSignal,
): Promise<NurseAlertsPage> {
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
      }),
    ),
  );
  return {
    ...first,
    alerts: [first.alerts, ...rest.map((r) => r.alerts)].flat(),
    cases: [first.cases, ...rest.map((r) => r.cases)].flat(),
    page: 1,
  };
}

function readTypeParam(raw: string | null): TypeFilter {
  if (raw === "adm" || raw === "ADM") return "ADM";
  if (raw === "clinic" || raw === "Clinic") return "Clinic";
  return "";
}

export default function NurseHealthRecordsPage() {
  return (
    <React.Suspense>
      <NurseHealthRecordsPageInner />
    </React.Suspense>
  );
}

function NurseHealthRecordsPageInner() {
  const searchParams = useSearchParams();
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const [queryInput, setQueryInput] = React.useState(
    searchParams.get("q") ?? "",
  );
  const [type, setTypeState] = React.useState<TypeFilter>(() =>
    readTypeParam(searchParams.get("type")),
  );

  const { data, isPending, isError, refetch, isRefetching } =
    useQuery<NurseAlertsPage>({
      ...liveQueryOptions,
      queryKey: ["nurse-health-records", "queue", termKey],
      queryFn: ({ signal }) => fetchAllHealthRecords(signal),
      enabled: termReady,
    });

  const allEntries = React.useMemo<DocEntry[]>(
    () => buildEntries(Array.isArray(data?.alerts) ? data.alerts : [])
      .filter((entry) => entry.files.length > 0),
    [data],
  );

  const filtered = React.useMemo(() => {
    const needle = queryInput.trim().toLowerCase();
    return allEntries.filter((entry) => {
      if (type && entry.row.type !== type) return false;
      if (!needle) return true;
      return `${entry.row.student} ${entry.row.lrn} ${entry.row.section} ${entry.row.type} ${entryStatusLabel(entry)}`
        .toLowerCase()
        .includes(needle);
    });
  }, [allEntries, queryInput, type]);

  const pager = useUrlPager(filtered.length, {}, {
    searchParam: "q",
    extraParams: ["type"],
    pageSize: HEALTH_RECORDS_PAGE_SIZE,
  });
  const page = pager.page;
  const setPage = pager.setPage;

  const handleQueryChange = (value: string) => {
    setQueryInput(value);
    if (page !== 1) setPage(1);
  };

  const handleTypeChange = (value: TypeFilter) => {
    setTypeState(value);
    pager.setFilters({ type: value === "" ? undefined : value });
  };

  const safePage = page;
  const visible = filtered.slice(
    (safePage - 1) * HEALTH_RECORDS_PAGE_SIZE,
    safePage * HEALTH_RECORDS_PAGE_SIZE,
  );

  if (isPending) {
    return (
      <section
        className={styles.page}
        aria-busy="true"
        aria-label="Loading health records"
      >
        <ShimmerGroup>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <Skeleton className="h-5 w-[4.4rem] rounded-md" />
                <Skeleton className="h-5 w-[7.6rem] rounded-md" />
                <Skeleton className="h-5 w-[5.4rem] rounded-md" />
              </div>
              <Skeleton className="h-8 w-56 max-w-full shrink-0 rounded-[16px]" />
            </div>
            <div className={listStyles.studentGrid}>
              {[0, 1, 2, 3, 4].map((card) => (
                <div
                  key={card}
                  className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border bg-muted/60 p-2.5 dark:bg-muted/20"
                >
                  <div className="-mx-2.5 flex min-w-0 items-center gap-1.5 border-b border-border px-3.5 pb-2">
                    <Skeleton className="size-3.5 rounded" />
                    <Skeleton className="h-[0.8125rem] w-24" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm dark:bg-card">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Skeleton className="size-7 shrink-0 rounded-full" />
                      <span className="flex min-w-0 flex-col items-start gap-1">
                        <Skeleton className="h-[0.875rem] w-28 max-w-full" />
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-20" />
                        </span>
                      </span>
                    </div>
                    <span className="flex w-full justify-center">
                      <Skeleton className="h-[100px] w-[120px] rounded-md" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <ZentraPaginationSkeleton />
          </div>
        </ShimmerGroup>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>Could not load the health records.</p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button
            size="sm"
            variant="outline"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            {isRefetching ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            {isRefetching ? "Loading…" : "Try again"}
          </Button>
        </div>
      </section>
    );
  }

  const hasActiveFilters = queryInput.trim() !== "" || type !== "";
  if (allEntries.length === 0 && !hasActiveFilters) {
    return (
      <section className={styles.page} aria-label="Health records">
        <NurseEmptyCard
          icon={FolderOpen}
          title="No health records yet"
          hint="Finished clinic sessions and resolved cases will appear here, one card per record."
          label="Health records"
          centered
        />
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label="Health records">
      <NurseDocumentariesList
        entries={visible}
        page={safePage}
        pageSize={HEALTH_RECORDS_PAGE_SIZE}
        total={filtered.length}
        onPageChange={setPage}
        query={queryInput}
        onQueryChange={handleQueryChange}
        type={type}
        onTypeChange={handleTypeChange}
      />
    </section>
  );
}

