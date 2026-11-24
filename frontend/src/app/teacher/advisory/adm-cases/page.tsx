"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "@/lib/api/live";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerm } from "@/lib/term/TermContext";
import { fetchAllAdmCases } from "@/services/teacher/admCases.service";
import type { AdmCase, MyAdmCasesPage } from "@/services/teacher/admCases.types";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { AdmCaseListPanel } from "./components/AdmCaseListPanel";
import { AdmCaseWorkspace } from "./components/AdmCaseWorkspace";
import { AdmOverviewPanel } from "./components/AdmOverviewPanel";
import { AdmCasesSkeleton } from "./components/AdmCasesSkeleton";
import { AdmEmptyKanban } from "./components/AdmEmptyKanban";
import styles from "./components/adm-cases.module.css";

const TEACHER_ADM_CASES_PAGE_SIZE = PAGE_SIZE;

function TeacherAdvisoryAdmCasesView({
  highlightId,
  initialQuery,
}: {
  highlightId: string | null;
  initialQuery: string;
}) {
  const router = useRouter();
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  // The whole school-year desk loads once and is filtered locally, so typing in
  // the search field narrows the list instantly — no debounce, no refetch, no
  // stale results landing after the query moved on.
  const casesQuery = useLiveQuery<MyAdmCasesPage>({
    queryKey: ["adm-my-cases", "all", termKey],
    queryFn: ({ signal }) => fetchAllAdmCases({ signal }),
    retry: false,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const allCases = useMemo(
    () => (Array.isArray(casesQuery.data?.cases) ? casesQuery.data.cases : []),
    [casesQuery.data],
  );

  // Filter text is local and instant; it is mirrored to ?q only so refresh and
  // back/forward keep the filter (the pager below owns the URL write).
  const [queryInput, setQueryInput] = useState(initialQuery);

  const filtered = useMemo(() => {
    const needle = queryInput.trim().toLowerCase();
    if (!needle) return allCases;
    return allCases.filter((c) =>
      `${c.studentName} ${c.lrn} ${c.section} ${c.stageLabel} ${c.referralStatus}`
        .toLowerCase()
        .includes(needle),
    );
  }, [allCases, queryInput]);

  const pager = useUrlPager(filtered.length, {}, {
    searchParam: "q",
    extraParams: ["q"],
    pageSize: TEACHER_ADM_CASES_PAGE_SIZE,
  });
  const page = pager.page;
  const setPage = pager.setPage;

  const totalPages = Math.max(1, Math.ceil(filtered.length / TEACHER_ADM_CASES_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const cases = useMemo(
    () =>
      filtered.slice(
        (currentPage - 1) * TEACHER_ADM_CASES_PAGE_SIZE,
        currentPage * TEACHER_ADM_CASES_PAGE_SIZE,
      ),
    [filtered, currentPage],
  );

  const total = filtered.length;
  const unfilteredTotal = allCases.length;

  // The open case lives here, not in the URL: selecting a row swaps the right
  // pane in place. A notification landing (?highlight=<id>) opens its case
  // once the desk has loaded — and only once, so "Overview" stays put after.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const highlightApplied = useRef(false);

  useEffect(() => {
    if (highlightApplied.current || !highlightId || allCases.length === 0) return;
    const hit = allCases.find(
      (c) => c.id === highlightId || c.referralId === highlightId,
    );
    if (hit) {
      highlightApplied.current = true;
      setSelectedId(hit.id);
    }
  }, [allCases, highlightId]);

  const pickCase = (row: AdmCase) => {
    highlightApplied.current = true;
    // A referral guidance has not opened a case file for yet (or whose learner
    // has no account, so no case file can exist) is tracked on the referrals
    // desk — the ADM desk must still list it so both desks agree.
    if (!row.hasCase) {
      router.push(`/teacher/advisory/referrals?highlight=${row.referralId}`);
      return;
    }
    setSelectedId(row.id);
  };

  const selectedRow =
    selectedId !== null
      ? (allCases.find((c) => c.id === selectedId) ?? null)
      : null;

  // A newly opened case starts at the top of its workspace.
  useEffect(() => {
    if (selectedRow) leftScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedRow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToPage = (next: number) => setPage(next);

  function handleReferAdm() {
    // Land on the referrals desk with the ADM form already open (?new=adm),
    // so "Refer now" is one click instead of two.
    router.push("/teacher/advisory/referrals?new=adm");
  }

  const showEmpty =
    !casesQuery.isPending && !casesQuery.isError && unfilteredTotal === 0;

  if (casesQuery.isPending) return <AdmCasesSkeleton />;

  if (showEmpty) {
    return (
      <section aria-label="ADM cases">
        <div className="flex min-h-[calc(100dvh-10rem)] w-full items-center justify-center">
          <div className="w-full">
            <AdmEmptyKanban onReferAdm={handleReferAdm} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label="ADM cases desk">
      <AdmCaseListPanel
        cases={cases}
        total={total}
        unfilteredTotal={unfilteredTotal}
        query={queryInput}
        onQueryChange={(value) => {
          setQueryInput(value);
          highlightApplied.current = true;
        }}
        selectedId={selectedRow?.id ?? null}
        onSelect={(row) => pickCase(row)}
        onReferAdm={handleReferAdm}
        currentPage={currentPage}
        onPageChange={goToPage}
        casesQuery={{
          isPending: casesQuery.isPending,
          isError: casesQuery.isError,
          isFetching: casesQuery.isFetching,
          refetch: () => void casesQuery.refetch(),
        }}
      />

      <div
        className={styles.panel}
        aria-label={selectedRow ? "ADM case workspace" : "ADM overview"}
      >
        {selectedRow ? (
          <>
            <div className={styles.panelToolbar}>
              <Button
                type="button"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[12px] text-muted-foreground"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft size={12} aria-hidden />
                Overview
              </Button>
              <span className="ml-auto min-w-0 truncate text-[12px] font-medium text-muted-foreground">
                {selectedRow.studentName}
              </span>
            </div>
            <div
              ref={leftScrollRef}
              className={`${styles.panelScroll} ${styles.workspacePad}`}
            >
              <AdmCaseWorkspace key={selectedRow.id} caseRef={selectedRow.id} compact />
            </div>
          </>
        ) : (
          <div className={styles.panelScroll}>
            <AdmOverviewPanel
              cases={allCases}
              summary={casesQuery.data?.summary}
              recent={casesQuery.data?.recent}
              unfilteredTotal={unfilteredTotal}
              onOpenCase={(row) => pickCase(row)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function TeacherAdvisoryAdmCasesPageWithHighlight() {
  const params = useSearchParams();
  return (
    <TeacherAdvisoryAdmCasesView
      highlightId={params.get("highlight")}
      initialQuery={params.get("q") ?? ""}
    />
  );
}

export default function TeacherAdvisoryAdmCasesPage() {
  return (
    <Suspense fallback={<AdmCasesSkeleton />}>
      <TeacherAdvisoryAdmCasesPageWithHighlight />
    </Suspense>
  );
}
