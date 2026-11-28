"use client";
import * as React from "react";
import { ChevronRight, Clock } from "lucide-react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { InsightCallout } from "@/components/ui/insight-callout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { formatElapsedShort } from "@/lib/clock";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import cascade from "@/components/shared/desk-cascade.module.css";
import styles from "./alerts-table.module.css";

/**
 * The one referred-cases board behind /guidance/alerts and /nurse/alerts.
 *
 * Each desk normalizes its rows into `AlertsTableRow` (data scope only) and
 * passes its own drawer/actions; the toolbar, table, empty states, paging and
 * row markup are identical everywhere, so the desks can't drift apart.
 */

export type AlertsTypeFilter = string;

export interface AlertsTableRow {
  key: string;
  /** Case type shown in the first column (ADM / Counseling / Clinic / Intervention). */
  typeLabel: string;
  /** Blue for ADM/counseling, amber for Clinic/intervention. */
  typeTone: "blue" | "amber";
  student: string;
  lrn: string;
  mascot?: string | null;
  grade: string;
  section: string;
  statusLabel: string;
  /** Tailwind text colour class for the status cell. */
  statusTone: string;
  riskLevel?: "High" | "Moderate" | "Low";
  riskLoading?: boolean;
  elapsedMs: number | null;
  /** "Referred" or "Detected" — tooltip/column wording. */
  elapsedLabel: string;
  /** Lower-cased haystack for the client-side search. */
  searchText: string;
}

export interface AlertsTypeOption {
  value: AlertsTypeFilter;
  label: string;
  tone: "neutral" | "blue" | "amber";
}

const RISK_TEXT: Record<"High" | "Moderate" | "Low", string> = {
  High: "text-red-600 dark:text-red-400",
  Moderate: "text-amber-600 dark:text-amber-400",
  Low: "text-emerald-600 dark:text-emerald-400",
};

export function RowTypeLabel({
  type,
  tone,
}: {
  type: string;
  tone: "blue" | "amber";
}) {
  return (
    <span
      className={`${styles.caseTypePill} ${
        tone === "blue"
          ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      }`}
      aria-label="Case type"
      title={`Case type: ${type}`}
    >
      {type}
    </span>
  );
}

export function AlertsCasesTable({
  rows,
  type,
  typeOptions,
  query,
  onQueryChange,
  onTypeChange,
  emptyAll,
  renderDrawer,
}: {
  rows: AlertsTableRow[];
  type: AlertsTypeFilter;
  typeOptions: AlertsTypeOption[];
  query: string;
  onQueryChange: (next: string) => void;
  onTypeChange: (next: AlertsTypeFilter) => void;
  /** Copy for "the desk has no cases at all" (search/filter variants are shared). */
  emptyAll: React.ReactNode;
  /** Drawer/overlays for the currently opened row (null when none is open). */
  renderDrawer: (activeKey: string | null, close: () => void) => React.ReactNode;
}) {
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const searching = query.trim().length > 0;

  const filteredRows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (type && row.typeLabel !== type) return false;
      if (needle && !row.searchText.includes(needle)) return false;
      return true;
    });
  }, [rows, type, query]);

  const changeType = (next: AlertsTypeFilter) => {
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
              options={typeOptions}
              value={type}
              onChange={(next) => changeType(next)}
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
          <div className={styles.tableWrap}>
            <Table className={`${cascade.table} w-full table-fixed`}>
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:border-t-0">
                  <TableHead style={{ width: 120 }} className="h-10 truncate">
                    Case
                  </TableHead>
                  <TableHead style={{ width: 240 }} className="h-10 truncate">
                    Learner
                  </TableHead>
                  <TableHead style={{ width: 150 }} className="h-10 truncate">
                    Grade &amp; section
                  </TableHead>
                  <TableHead style={{ width: 150 }} className="h-10 truncate">
                    Status
                  </TableHead>
                  <TableHead style={{ width: 100 }} className="h-10 truncate">
                    Risk
                  </TableHead>
                  <TableHead style={{ width: 120 }} className="h-10 truncate">
                    Referred
                  </TableHead>
                  <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row, index) => (
                  <AlertTableRow
                    key={row.key}
                    row={row}
                    index={index}
                    onOpen={() => setActiveKey(row.key)}
                  />
                ))}
              </TableBody>
            </Table>
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
              ) : rows.length > 0 ? (
                <>
                  <strong>No cases match the selected filters.</strong> Pick a
                  different filter above the board, or show every case.
                </>
              ) : (
                emptyAll
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

      {renderDrawer(activeKey, () => setActiveKey(null))}
    </>
  );
}

function AlertTableRow({
  row,
  index,
  onOpen,
}: {
  row: AlertsTableRow;
  index: number;
  onOpen: () => void;
}) {
  return (
    <TableRow
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      aria-label={`Open case details for ${row.student}`}
      className={styles.alertRow}
      style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
    >
      <TableCell className="truncate">
        <RowTypeLabel type={row.typeLabel} tone={row.typeTone} />
      </TableCell>
      <TableCell className="truncate">
        <span className="flex min-w-0 items-center gap-2">
          <StudentMascot
            name={row.student}
            seed={row.lrn}
            character={row.mascot ?? undefined}
            size={28}
          />
          <span className="min-w-0">
            <span
              className="block truncate text-[13px] font-semibold text-primary"
              title={row.student}
            >
              {row.student}
            </span>
            <span className="mt-0.5 block truncate text-[12px] tabular-nums text-muted-foreground">
              {row.lrn || "—"}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell className="truncate">
        <span className="block truncate text-[12px] font-medium text-foreground">
          {row.grade || "—"}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
          {row.section || "—"}
        </span>
      </TableCell>
      <TableCell className="truncate">
        <span
          className={`text-[12px] font-semibold ${row.statusTone}`}
          title="Status"
        >
          {row.statusLabel}
        </span>
      </TableCell>
      <TableCell className="truncate">
        {row.riskLevel ? (
          <span
            className={`text-[12px] font-semibold ${RISK_TEXT[row.riskLevel]}`}
            title="Risk level"
          >
            {row.riskLevel}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">
            {row.riskLoading ? "…" : "—"}
          </span>
        )}
      </TableCell>
      <TableCell className="truncate">
        <span
          className={styles.elapsedPill}
          title={
            row.elapsedMs === null
              ? `${row.elapsedLabel} time unknown`
              : `${row.elapsedLabel} ${formatElapsedShort(row.elapsedMs)} ago`
          }
        >
          <Clock size={11} aria-hidden />
          {row.elapsedMs === null ? "—" : `${formatElapsedShort(row.elapsedMs)} ago`}
        </span>
      </TableCell>
      <TableCell className="truncate">
        <ChevronRight size={15} className="text-muted-foreground" aria-hidden />
      </TableCell>
    </TableRow>
  );
}
