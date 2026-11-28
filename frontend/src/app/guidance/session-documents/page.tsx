"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import { GuidanceEmptyCard } from "../components/GuidanceEmptyCard";
import { GuidanceSessionDocumentsFolders } from "./components/guidance-session-documents-folders";
import type { TypeFilter } from "@/app/guidance/anecdotal/components/guidance-anecdotal-filters";
import { fetchAllGuidanceAnecdotal } from "@/services/guidance/anecdotal.service";
import type {
  GuidanceAnecdotalData,
  GuidanceAnecdotalRecord,
} from "@/services/guidance/anecdotal.types";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import styles from "@/app/guidance/anecdotal/components/guidance-anecdotal.module.css";
import gridStyles from "./components/guidance-session-documents-folders.module.css";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { useSearchParams } from "next/navigation";

// The polaroid desk stacks a handful of records at a time (same rhythm as the
// nurse health-records board), so page it 5 at a time instead of 15.
const GUIDANCE_SESSION_DOCS_PAGE_SIZE = 5;

function hasDocsCheck(record: { sessionDocs?: { files: { mimeType: string }[] }[] }): boolean {
  return (record.sessionDocs ?? []).some((s) =>
    (s.files ?? []).some((f) => f.mimeType.toLowerCase().startsWith("image/"))
  );
}

function readTypeParam(raw: string | null): TypeFilter {
  if (raw === "adm" || raw === "ADM") return "ADM";
  if (raw === "counseling" || raw === "Counseling") return "Counseling";
  return "";
}

export default function GuidanceSessionDocumentsPage() {
  return (
    <React.Suspense>
      <GuidanceSessionDocumentsPageInner />
    </React.Suspense>
  );
}

function GuidanceSessionDocumentsPageInner() {
  const searchParams = useSearchParams();
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const [queryInput, setQueryInput] = React.useState(searchParams.get("q") ?? "");
  const [type, setTypeState] = React.useState<TypeFilter>(() =>
    readTypeParam(searchParams.get("type")),
  );

  // One request set for the whole queue, then search / type tabs / paging are
  // all client-side — typing never triggers a fetch or a stale request stack.
  const { data, isPending, isError, refetch, isRefetching } =
    useQuery<GuidanceAnecdotalData>({
      ...liveQueryOptions,
      queryKey: ["guidance-session-documents", "queue", termKey],
      queryFn: ({ signal }) => fetchAllGuidanceAnecdotal({ signal, docsOnly: true }),
      enabled: termReady,
    });

  const allRecords = React.useMemo<GuidanceAnecdotalRecord[]>(
    () =>
      (Array.isArray(data?.records) ? data.records : []).filter(hasDocsCheck),
    [data],
  );

  const filtered = React.useMemo(() => {
    const needle = queryInput.trim().toLowerCase();
    return allRecords.filter((record) => {
      if (type && record.referralType !== type) return false;
      if (!needle) return true;
      const haystack = `${record.student} ${record.lrn} ${record.section}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [allRecords, queryInput, type]);

  const pager = useUrlPager(filtered.length, {}, {
    searchParam: "q",
    extraParams: ["type"],
    pageSize: GUIDANCE_SESSION_DOCS_PAGE_SIZE,
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

  const totalPages = pager.totalPages;
  const safePage = page;
  const visible = filtered.slice(
    (safePage - 1) * GUIDANCE_SESSION_DOCS_PAGE_SIZE,
    safePage * GUIDANCE_SESSION_DOCS_PAGE_SIZE,
  );

  if (isPending) {
    return (
      <section className={styles.page} aria-busy="true" aria-label="Loading session documents">
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
            <div className={gridStyles.studentGrid}>
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
        <p className={styles.error}>Could not load the session documents.</p>
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
  if (allRecords.length === 0 && !hasActiveFilters) {
    return (
      <section className={styles.page} aria-label="Session documents">
        <GuidanceEmptyCard
          icon={FolderOpen}
          title="No session files yet"
          hint="Images attached to counseling sessions — on referrals or interventions — will appear here."
          label="Session documents"
          centered
        />
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label="Session documents">
      <GuidanceSessionDocumentsFolders
        records={visible}
        page={safePage}
        pageSize={GUIDANCE_SESSION_DOCS_PAGE_SIZE}
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
