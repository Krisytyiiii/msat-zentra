"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuidanceEmptyCard } from "../components/GuidanceEmptyCard";
import { GuidanceAnecdotalFolders } from "./components/guidance-anecdotal-folders";
import { GuidanceAnecdotalSkeleton } from "./components/GuidanceAnecdotalSkeleton";
import type { TypeFilter } from "./components/guidance-anecdotal-filters";
import { fetchAllGuidanceAnecdotal } from "@/services/guidance/anecdotal.service";
import type {
  GuidanceAnecdotalData,
  GuidanceAnecdotalRecord,
} from "@/services/guidance/anecdotal.types";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import styles from "./components/guidance-anecdotal.module.css";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { useSearchParams } from "next/navigation";

// Match the sibling session-documents board: a clean 3×5 folder grid on wide
// desks (the global 15/page size), so no orphan card spills onto a fourth row.
const GUIDANCE_ANECDOTAL_PAGE_SIZE = PAGE_SIZE;

function readTypeParam(raw: string | null): TypeFilter {
  if (raw === "adm" || raw === "ADM") return "ADM";
  if (raw === "counseling" || raw === "Counseling") return "Counseling";
  return "";
}

export default function GuidanceAnecdotalPage() {
  return (
    <React.Suspense>
      <GuidanceAnecdotalPageInner />
    </React.Suspense>
  );
}

function GuidanceAnecdotalPageInner() {
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
      queryKey: ["guidance-anecdotal", "queue", termKey],
      queryFn: ({ signal }) => fetchAllGuidanceAnecdotal({ signal }),
      enabled: termReady,
    });

  const allRecords = React.useMemo<GuidanceAnecdotalRecord[]>(
    () => (Array.isArray(data?.records) ? data.records : []),
    [data],
  );

  const filtered = React.useMemo(() => {
    const needle = queryInput.trim().toLowerCase();
    return allRecords.filter((record) => {
      if (type && record.referralType !== type) return false;
      if (!needle) return true;
      const haystack =
        `${record.student} ${record.lrn} ${record.section} ${record.observer} ${record.referredBy} ${record.category}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [allRecords, queryInput, type]);

  const pager = useUrlPager(filtered.length, {}, {
    searchParam: "q",
    extraParams: ["type"],
    pageSize: GUIDANCE_ANECDOTAL_PAGE_SIZE,
  });
  const page = pager.page;
  const setPage = pager.setPage;

  const handleQueryChange = (value: string) => {
    setQueryInput(value);
    // Local filtering is instant — only reset the pager, and skip the URL write
    // while already on page 1 so typing never triggers router churn.
    if (page !== 1) setPage(1);
  };

  const handleTypeChange = (value: TypeFilter) => {
    setTypeState(value);
    pager.setFilters({ type: value === "" ? undefined : value });
  };

  const totalPages = pager.totalPages;
  const safePage = page;
  const pageRecords = filtered.slice(
    (safePage - 1) * GUIDANCE_ANECDOTAL_PAGE_SIZE,
    safePage * GUIDANCE_ANECDOTAL_PAGE_SIZE,
  );

  if (isPending) {
    return <GuidanceAnecdotalSkeleton />;
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>Could not load the anecdotal records.</p>
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
      <section className={styles.page} aria-label="Anecdotal records">
        <GuidanceEmptyCard
          icon={FolderOpen}
          title="No referred files yet"
          hint="Every ADM and counseling case advisers refer to you will appear here as its own folder."
          label="Anecdotal records"
          centered
          action={
            <Button asChild size="sm" variant="outline" className="gap-1">
              <Link href="/guidance/referrals">
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                View referrals
              </Link>
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label="Anecdotal records">
      <GuidanceAnecdotalFolders
        records={pageRecords}
        page={safePage}
        pageSize={GUIDANCE_ANECDOTAL_PAGE_SIZE}
        total={filtered.length}
        totalPages={totalPages}
        onPageChange={setPage}
        query={queryInput}
        onQueryChange={handleQueryChange}
        type={type}
        onTypeChange={handleTypeChange}
      />
    </section>
  );
}
