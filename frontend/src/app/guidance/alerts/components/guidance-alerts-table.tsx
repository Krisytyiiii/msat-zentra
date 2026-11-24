"use client";
import * as React from "react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { InsightCallout } from "@/components/ui/insight-callout";
import type { GuidanceRiskLevel } from "@/services/guidance/guidance.types";
import type {
  AlertCaseType,
  GuidanceAlertCasesSummary,
} from "@/services/guidance/alerts.types";
import { useNowTick } from "@/lib/clock";
import {
  rowKey,
  rowRisk,
  rowSearchText,
  rowType,
  type GuidanceAlertRow,
  type TypeFilter,
} from "./guidance-alerts-helpers";
import { CaseKanbanRow } from "./guidance-alerts-row";
import { GuidanceBookedSessionButton } from "./GuidanceAlertsRowActions";
import { GuidanceCaseDetailDialog } from "../../components/GuidanceCaseDetailDialog";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import styles from "./guidance-alerts-table.module.css";
export type { GuidanceAlertRow };

const TYPE_OPTIONS: {
  value: TypeFilter;
  label: string;
  tone: "neutral" | "blue" | "amber";
}[] = [
  { value: "", label: "All", tone: "neutral" },
  { value: "ADM", label: "ADM", tone: "blue" },
  { value: "Counseling", label: "Counseling", tone: "blue" },
  { value: "Intervention", label: "Intervention", tone: "amber" },
];

/**
 * Client-side board: the page loads the whole alerts desk once and hands every
 * row here, so typing in the search box filters instantly with no request (same
 * behaviour as the adviser-access desk). Low-risk rows never reach the desk —
 * the backend drops them. Layout mirrors /nurse/alerts: one full-width filter
 * toolbar, a column head and hairline rows inside a glass list panel.
 */
export function GuidanceAlertsTable({
  rows,
  riskByStudent,
  summary,
  query,
  type,
  onQueryChange,
  onTypeChange,
}: {
  rows: GuidanceAlertRow[];
  riskByStudent: Record<string, GuidanceRiskLevel>;
  summary: GuidanceAlertCasesSummary;
  query: string;
  type: AlertCaseType;
  onQueryChange: (next: string) => void;
  onTypeChange: (next: AlertCaseType) => void;
}) {
  const [activeRow, setActiveRow] = React.useState<GuidanceAlertRow | null>(null);
  const [page, setPage] = React.useState(1);
  const now = useNowTick();
  const hasRows = summary.total > 0;
  const searching = query.trim().length > 0;

  const filteredRows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (type && rowType(row) !== type) return false;
      if (needle && !rowSearchText(row).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, type, query]);

  // Any filter change starts the board back at page 1.
  const changeType = (next: AlertCaseType) => {
    setPage(1);
    onTypeChange(next);
  };
  const changeQuery = (next: string) => {
    setPage(1);
    onQueryChange(next);
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = React.useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage],
  );
  const isEmpty = filteredRows.length === 0;

  return (
    <>
      {/* No parent card: the toolbar, the data list and the pager sit directly
          on the page canvas (the list panel is the only surface). */}
      <section
        aria-label="Referred cases"
        className={`flex min-w-0 flex-col gap-3 ${styles.boardIn}${
          isEmpty ? ` ${styles.emptyFill}` : ""
        }`}
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className={`${styles.filterRow} ${styles.filterRowScroll}`}>
            <FilterTabs
              label="Filter cases by type"
              variant="tags"
              options={TYPE_OPTIONS}
              value={type}
              onChange={(next) => changeType(next as AlertCaseType)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SearchField
              className="w-60"
              placeholder="Search cases..."
              value={query}
              onChange={changeQuery}
              aria-label="Search referred cases"
            />
          </div>
        </div>

        {pageRows.length > 0 ? (
          <div className={styles.listPanel}>
            <div className={styles.listHead} aria-hidden="true">
              <span>Case</span>
              <span>Learner</span>
              <span className={styles.colGrade}>Grade &amp; section</span>
              <span className={styles.colConcern}>Concern</span>
              <span>Status</span>
              <span>Risk</span>
              <span className={styles.colSessions}>Sessions</span>
              <span className={styles.colReferred}>Referred</span>
              <span className={styles.headActions}>Actions</span>
            </div>
            <ul className={styles.caseList} aria-label="Cases on the guidance desk">
              {pageRows.map((row, index) => (
                <CaseKanbanRow
                  key={rowKey(row)}
                  row={row}
                  index={index}
                  riskLevel={rowRisk(row, riskByStudent)}
                  now={now}
                  onOpen={() => setActiveRow(row)}
                  onBook={() => setActiveRow(null)}
                />
              ))}
            </ul>
          </div>
        ) : (
          <div className={styles.emptyCenter}>
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              {searching ? (
                <>
                  <strong>No cases match your search.</strong> Try a different
                  name, LRN, or keyword — or clear the search to see every
                  referred case.
                </>
              ) : hasRows ? (
                <>
                  <strong>No cases match the selected filters.</strong> Pick a
                  different filter above the board, or show every case.
                </>
              ) : (
                <>
                  <strong>No referred cases.</strong> New ADM, counseling, and
                  intervention cases will appear here.
                </>
              )}
            </InsightCallout>
          </div>
        )}

        <Pagination
          currentPage={safePage}
          totalItems={filteredRows.length}
          onPageChange={setPage}
        />
      </section>
      <GuidanceCaseDetailDialog
        row={activeRow}
        riskLevel={activeRow ? rowRisk(activeRow, riskByStudent) : undefined}
        onClose={() => setActiveRow(null)}
        actions={
          activeRow?.kind === "intervention" ? (
            <GuidanceBookedSessionButton
              item={activeRow.item}
              onBeforeOpen={() => setActiveRow(null)}
              keepOverlayOnOpen
            />
          ) : undefined
        }
      />
    </>
  );
}
