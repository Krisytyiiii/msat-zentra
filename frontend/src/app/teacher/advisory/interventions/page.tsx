"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { TeacherEmptyCard } from "../../components/TeacherEmptyCard";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Pagination } from "@/components/shared/pagination";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNowTick } from "@/lib/clock";
import { useTerm } from "@/lib/term/TermContext";
import {
  ADVISORY_INTERVENTIONS_PAGE_SIZE,
  useAdvisoryInterventionsQueue,
  type AdvisoryInterventionFactor,
  type AdvisoryInterventionLevel,
  type AdvisoryInterventionOutcome,
  type AdvisoryInterventionRow,
} from "@/services/teacher/interventions.service";
import { InterventionTableRow } from "./components/intervention-row";
import { InterventionsSkeleton } from "./components/InterventionsSkeleton";
import { InterventionDetailOverlay } from "./components/intervention-detail-overlay";
import cascade from "@/components/shared/desk-cascade.module.css";
import listStyles from "../list/components/advisory-list.module.css";
import styles from "./components/interventions.module.css";

type LevelFilter = "all" | AdvisoryInterventionLevel;
type FactorFilter = "all" | AdvisoryInterventionFactor;
type OutcomeFilter = "all" | AdvisoryInterventionOutcome;

const LEVEL_VALUES: LevelFilter[] = ["all", "High", "Moderate"];
const FACTOR_VALUES: FactorFilter[] = ["all", "academic", "attendance", "behavioral"];
const OUTCOME_VALUES: OutcomeFilter[] = ["all", "ongoing", "resolved", "unresolved", "none"];

const LEVEL_LABELS: Record<LevelFilter, string> = {
  all: "All at-risk",
  High: "High risk",
  Moderate: "Moderate risk",
  Low: "Low risk",
};
// Same ordering the backend applies: risk level, then flag count, then name.
const LEVEL_RANK: Record<string, number> = { High: 0, Moderate: 1, Low: 2 };

function isOneOf<T extends string>(value: string | null, options: readonly T[]): value is T {
  return value !== null && (options as readonly string[]).includes(value);
}

function AdviserInterventionsPageInner() {
  const searchParams = useSearchParams();
  const now = useNowTick();
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  // Filters live in local state so search and lane clicks filter the loaded
  // board instantly — same behaviour as the guidance interventions desk.
  const [queryInput, setQueryInput] = React.useState(() => searchParams.get("q") ?? "");
  const [level, setLevelState] = React.useState<LevelFilter>(() => {
    const value = searchParams.get("level");
    return isOneOf(value, LEVEL_VALUES) ? value : "all";
  });
  const [factor, setFactorState] = React.useState<FactorFilter>(() => {
    const value = searchParams.get("factor");
    return isOneOf(value, FACTOR_VALUES) ? value : "all";
  });
  const [outcome, setOutcomeState] = React.useState<OutcomeFilter>(() => {
    const value = searchParams.get("outcome");
    return isOneOf(value, OUTCOME_VALUES) ? value : "all";
  });
  const [sectionId, setSectionIdState] = React.useState<string>(() => searchParams.get("section") ?? "all");

  // The server always renders the skeleton (no query cache / no storage), so
  // hold the skeleton until the client has mounted. Without this, a TanStack
  // cache that already holds this term (fast refresh, back navigation) made
  // the first client tree differ from the server HTML and broke hydration.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const query = useAdvisoryInterventionsQueue(termKey, termReady);
  const allRows = React.useMemo(() => query.data?.data ?? [], [query.data]);

  const filtered = React.useMemo(() => {
    const needle = queryInput.trim().toLowerCase();
    return allRows
      .filter((row) => {
        if (sectionId !== "all" && row.sectionId !== sectionId) return false;
        if (level !== "all" && row.riskLevel !== level) return false;
        if (factor !== "all" && !row.factors[factor]) return false;
        if (outcome === "none" && row.intervention) return false;
        if (
          outcome !== "all" &&
          outcome !== "none" &&
          row.intervention?.outcomeStatus !== outcome
        ) {
          return false;
        }
        if (needle && !`${row.name} ${row.lrn} ${row.section}`.toLowerCase().includes(needle)) {
          return false;
        }
        return true;
      })
      .sort(
        // Newest detection first: the desk's question is "who was just
        // flagged", so a card detected today must not sit below an older one.
        // Rows without a timestamp sink to the bottom; level and risk count
        // only break ties.
        (a, b) => {
          const aAt = a.detectedAt ? Date.parse(a.detectedAt) : NaN;
          const bAt = b.detectedAt ? Date.parse(b.detectedAt) : NaN;
          const aHas = Number.isFinite(aAt);
          const bHas = Number.isFinite(bAt);
          if (aHas !== bHas) return aHas ? -1 : 1;
          if (aHas && bHas && aAt !== bAt) return bAt - aAt;
          return (
            (LEVEL_RANK[a.riskLevel] ?? 9) - (LEVEL_RANK[b.riskLevel] ?? 9) ||
            b.riskCount - a.riskCount ||
            a.name.localeCompare(b.name)
          );
        },
      );
  }, [allRows, sectionId, level, factor, outcome, queryInput]);

  const pager = useUrlPager(filtered.length, {}, {
    searchParam: "q",
    extraParams: ["q", "level", "factor", "outcome", "section"],
    pageSize: ADVISORY_INTERVENTIONS_PAGE_SIZE,
  });
  const page = pager.page;
  const setPage = pager.setPage;

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADVISORY_INTERVENTIONS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * ADVISORY_INTERVENTIONS_PAGE_SIZE,
    safePage * ADVISORY_INTERVENTIONS_PAGE_SIZE,
  );

  const handleQueryChange = (value: string) => {
    setQueryInput(value);
    // Local filtering is instant — only reset the pager, and skip the URL
    // write while already on page 1 so typing never triggers router churn.
    if (page !== 1) setPage(1);
  };

  const [selected, setSelected] = React.useState<AdvisoryInterventionRow | null>(null);
  // Keep the open overlay fresh after a refetch.
  const selectedRow = selected
    ? allRows.find((row) => row.key === selected.key) ?? selected
    : null;

  // The search field carries its own clear (X), so a no-match caused by typing
  // gets the inline message only; the button exists for chip filters.
  const hasFilterChips =
    level !== "all" || factor !== "all" || outcome !== "all" || sectionId !== "all";

  if (!mounted || (query.isPending && !query.data)) {
    return <InterventionsSkeleton />;
  }

  if (query.isError && !query.data) {
    return (
      <TeacherEmptyCard
        centered
        icon={HeartHandshake}
        title="No advisory section assigned"
        hint="Interventions are scoped to your advisory section. Claim your advisory in Settings, then come back."
        label="Advisory interventions"
      />
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Advisory interventions">
      <div className={styles.boardShell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <span className={styles.titleIcon} aria-hidden>
                <HeartHandshake size={16} />
              </span>
              <h2 className={styles.title}>Intervention cases</h2>
            </div>
          </div>
          {allRows.length > 0 ? (
            <TeacherSearchField
              className="w-60 max-w-full shrink-0"
              placeholder="Search advisee, LRN, or section…"
              value={queryInput}
              onChange={handleQueryChange}
              aria-label="Search advisee or LRN"
            />
          ) : null}
        </header>

        {allRows.length === 0 || pageRows.length === 0 ? (
          <PageEmptyCallout
            fit={allRows.length === 0}
            action={
              hasFilterChips ? (
                <button
                  type="button"
                  className="h-6 rounded-md border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    setQueryInput("");
                    setLevelState("all");
                    setFactorState("all");
                    setOutcomeState("all");
                    setSectionIdState("all");
                    pager.setFilters({
                      level: undefined,
                      factor: undefined,
                      outcome: undefined,
                      section: undefined,
                    });
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          >
            {allRows.length === 0 ? (
              <>
                <strong>No advisees flagged this term.</strong> Learners flagged by the risk
                engine, or with a guidance follow-up, will appear here.
              </>
            ) : queryInput.trim() ? (
              <>{searchEmptyMessage(queryInput, "cases", "Try another name, LRN, or section.")}</>
            ) : (
              <>{searchEmptyMessage("", "cases")}</>
            )}
          </PageEmptyCallout>
        ) : (
          <div className={listStyles.tableWrap}>
            <Table className={`${cascade.table} w-full table-fixed`}>
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:border-t-0">
                  <TableHead className="h-10" style={{ width: 260 }}>
                    Advisee
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 90 }}>
                    Risk
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 220 }}>
                    Factors
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 150 }}>
                    Pipeline
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 110 }}>
                    Sessions
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 100 }}>
                    Flagged
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 56 }} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row, index) => (
                  <InterventionTableRow
                    key={row.key}
                    row={row}
                    index={index}
                    now={now}
                    onOpen={setSelected}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {filtered.length > 0 ? (
          <Pagination
            currentPage={safePage}
            totalItems={filtered.length}
            pageSize={ADVISORY_INTERVENTIONS_PAGE_SIZE}
            onPageChange={setPage}
          />
        ) : null}
      </div>

      <InterventionDetailOverlay row={selectedRow} onClose={() => setSelected(null)} />
    </section>
  );
}

export default function AdviserInterventionsPage() {
  return (
    <React.Suspense fallback={<div className="flex flex-col gap-4" aria-busy="true" />}>
      <AdviserInterventionsPageInner />
    </React.Suspense>
  );
}
