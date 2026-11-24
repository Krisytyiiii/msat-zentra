"use client";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { InsightCallout } from "@/components/ui/insight-callout";
import type {
  AtRiskStudentItem,
  CounselingSessionItem,
} from "@/services/guidance/interventions.types";
import type { InterventionStatusFilter } from "./intervention-row-helpers";
import { InterventionTableRow } from "./intervention-row";
import { Pagination } from "@/components/shared/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./guidance-interventions.module.css";

const STATUS_OPTIONS: { value: InterventionStatusFilter; label: string; tone: "amber" | "blue" | "green" | "red" | "neutral" }[] = [
  { value: "all", label: "All", tone: "neutral" },
  { value: "no_action", label: "No action yet", tone: "amber" },
  { value: "booked", label: "Booked session", tone: "blue" },
  { value: "session_done", label: "Session done", tone: "blue" },
  { value: "follow_up", label: "Follow-up session", tone: "amber" },
  { value: "done", label: "Done", tone: "green" },
  { value: "discontinued", label: "Discontinued", tone: "red" },
  { value: "risk_cleared", label: "No longer at risk", tone: "green" },
];

/**
 * Pill tab group — the shared segmented filter tabs.
 *
 * No parent card: like the alerts desk, the tag filter row, the search and the
 * pager sit directly on the page canvas, and the card grid is the only surface.
 */
export interface InterventionTableViewProps {
  students: AtRiskStudentItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unfilteredTotal?: number;
  onPageChange: (page: number) => void;
  query: string;
  onQueryChange: (value: string) => void;
  status: InterventionStatusFilter;
  onStatusChange: (value: InterventionStatusFilter) => void;
  isNavigating: boolean;
  expandedKey: string | null;
  onToggleDetails: (key: string) => void;
  now: number;
  locked: (key: string) => boolean;
  isBusy: (key: string, action: string) => boolean;
  isActionPending: boolean;
  onChange: (row: AtRiskStudentItem) => void;
  onOutcome: (row: AtRiskStudentItem) => void;
  onMarkDone: (row: AtRiskStudentItem) => void;
  onSchedule: (row: AtRiskStudentItem) => void;
  onSession: (
    row: AtRiskStudentItem,
    session: CounselingSessionItem,
    dialog: "finish" | "move" | "cancelSess"
  ) => void;
  onReview: (row: AtRiskStudentItem, decision: "approved" | "rejected") => void;
  onDocsChanged: () => void;
  highlightId?: string | null;
}
export function InterventionTableView({
  students,
  page,
  pageSize,
  total,
  onPageChange,
  query,
  onQueryChange,
  status,
  onStatusChange,
  isNavigating,
  expandedKey,
  onToggleDetails,
  now,
  locked,
  isBusy,
  isActionPending,
  onChange,
  onOutcome,
  onMarkDone,
  onSchedule,
  onSession,
  onReview,
  onDocsChanged,
  highlightId = null,
}: InterventionTableViewProps) {
  const hasActiveSearch = query.trim() !== "";
  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "All statuses";
  const isEmpty = students.length === 0;
  return (
    <section
      aria-label="Intervention cases"
      className={`flex min-w-0 flex-col gap-3 ${styles.boardIn}${
        isEmpty ? ` ${styles.emptyFill}` : ""
      }`}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <div className={`${styles.filterRow} ${styles.filterRowScroll}`}>
          <FilterTabs
            label="Filter cases by status"
            variant="tags"
            options={STATUS_OPTIONS}
            value={status}
            onChange={onStatusChange}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SearchField
            className="w-60"
            placeholder="Search student..."
            value={query}
            onChange={(next) => onQueryChange(next)}
            aria-label="Search at-risk students"
          />
        </div>
      </div>

      <div
        aria-busy={isNavigating || undefined}
        className={`flex min-w-0 flex-1 flex-col${isEmpty ? ` ${styles.emptyFill}` : ""}`}
      >
        {isNavigating ? (
          <div className={styles.caseList}>
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className={styles.skelCaseRow}>
                <Skeleton className={styles.skelAvatar} />
                <div className={styles.skelCaseLines}>
                  <Skeleton className={styles.skelBar} style={{ width: "38%" }} />
                  <Skeleton className={styles.skelBar} style={{ width: "24%" }} />
                </div>
                <Skeleton className={styles.skelCasePill} />
                <Skeleton className={styles.skelCaseBtn} />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className={styles.emptyCenter}>
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              {hasActiveSearch ? (
                <>
                  <strong>No cases match “{query.trim()}”.</strong> Try a different
                  name, LRN, or section — or clear the search to see every case.
                </>
              ) : status === "all" ? (
                <>
                  <strong>No cases match your filters.</strong> Pick a different
                  filter above the board, or show every case.
                </>
              ) : (
                <>
                  <strong>No cases in “{statusLabel}” right now.</strong> Pick a
                  different filter above the board.
                </>
              )}
            </InsightCallout>
          </div>
        ) : (
          <ul
            className={styles.caseList}
            aria-label="Intervention cases on the guidance desk"
          >
            {students.map((row, index) => (
              <InterventionTableRow
                key={row.studentKey}
                row={row}
                index={index}
                highlighted={highlightId !== null && highlightId === row.studentKey}
                locked={locked(row.studentKey)}
                isActionPending={isActionPending}
                isBusy={(action) => isBusy(row.studentKey, action)}
                expanded={expandedKey === row.studentKey}
                onToggleDetails={() => onToggleDetails(row.studentKey)}
                now={now}
                onChange={() => onChange(row)}
                onOutcome={() => onOutcome(row)}
                onMarkDone={() => onMarkDone(row)}
                onSchedule={() => onSchedule(row)}
                onSession={(session, dialog) =>
                  onSession(row, session, dialog)
                }
                onReview={(decision) => onReview(row, decision)}
                onDocsChanged={onDocsChanged}
              />
            ))}
          </ul>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </section>
  );
}
