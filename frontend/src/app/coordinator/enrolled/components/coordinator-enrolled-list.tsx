"use client";

import { FolderKanban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import { Pagination } from "@/components/shared/pagination";
import { SearchField, searchEmptyMessage } from "@/components/ui/search-field";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import { CoordinatorEnrolledRow } from "./coordinator-enrolled-row";
import {
  LANES,
  type LaneFilter,
  type LaneKey,
} from "./coordinator-enrolled-status";
import styles from "@/app/teacher/advisory/adm-cases/components/adm-cases.module.css";

const TAB_ORDER: LaneKey[] = ["in_progress", "complete", "not_released"];

/* Dot tone per lane — the same glass-tag palette the referrals desk uses. */
const TAB_TONE: Record<LaneFilter, "neutral" | "blue" | "green"> = {
  all: "neutral",
  not_released: "neutral",
  in_progress: "blue",
  complete: "green",
};

/**
 * Left pane of the enrolled desk — the monitoring roster. Mirrors the adviser
 * ADM desk's case list exactly (same pane chrome, header, column list, sticky
 * head and footer pager) with the monitoring-status tab filter above the
 * search field.
 */
export function CoordinatorEnrolledListPanel({
  rows,
  total,
  query,
  onQueryChange,
  lane,
  laneCounts,
  onLaneChange,
  selectedId,
  onSelect,
  currentPage,
  onPageChange,
  isError,
  isFetching,
  onRetry,
}: {
  rows: AdmCaseRow[];
  total: number;
  query: string;
  onQueryChange: (value: string) => void;
  lane: LaneFilter;
  laneCounts: Record<LaneFilter, number>;
  onLaneChange: (next: LaneFilter) => void;
  selectedId: string | null;
  onSelect: (row: AdmCaseRow) => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      className={`${styles.panel} ${styles.listPane}`}
      aria-label="Enrolled learners list"
    >
      <header className={styles.panelHead}>
        <div className={styles.titleRow}>
          <span className={styles.titleIcon} aria-hidden>
            <FolderKanban size={15} />
          </span>
          <div className={styles.titleText}>
            <h2 className={styles.title}>Monitoring roster</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill
            tone="amber"
            className={styles.countPill}
            label="Learners shown"
          >
            {rows.length}
          </Pill>
        </div>
      </header>

      <div className={styles.panelToolbar}>
        <FilterTabs
          label="Filter learners by monitoring status"
          variant="tags"
          options={[
            {
              value: "all" as const,
              label: "All",
              count: laneCounts.all > 0 ? laneCounts.all : undefined,
              tone: TAB_TONE.all,
            },
            ...TAB_ORDER.map((key) => ({
              value: key,
              label: LANES[key].title,
              count: laneCounts[key] > 0 ? laneCounts[key] : undefined,
              tone: TAB_TONE[key],
            })),
          ]}
          value={lane}
          onChange={onLaneChange}
        />
      </div>

      <div className={styles.panelToolbar}>
        <SearchField
          className="w-full"
          placeholder="Search learner, LRN, grade, or section…"
          value={query}
          onChange={onQueryChange}
          aria-label="Search enrolled learners"
        />
      </div>

      <div className={`${styles.panelScroll} ${styles.listPanel}`}>
        {isError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <p role="alert" className="m-0 font-medium">
              Could not load the enrolled learners.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isFetching}
            >
              {isFetching ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  <span aria-live="polite">Retrying</span>
                </>
              ) : (
                "Try again"
              )}
            </Button>
          </div>
        ) : rows.length > 0 ? (
          <>
            <div className={styles.listHead} aria-hidden>
              <span>Learner</span>
              <span>Monitoring</span>
              <span>Modules</span>
              <span />
            </div>
            <ul className={styles.listBody} aria-label="Enrolled learners">
              {rows.map((row) => (
                <CoordinatorEnrolledRow
                  key={row.id}
                  row={row}
                  selected={row.id === selectedId}
                  onSelect={() => onSelect(row)}
                />
              ))}
            </ul>
          </>
        ) : (
          <div className="flex w-full justify-center px-3 py-8">
            <PageEmptyCallout>
              {query.trim() ? (
                <>
                  {searchEmptyMessage(
                    query,
                    "enrolled learners",
                    "Try a different name, LRN, grade, or section.",
                  )}
                </>
              ) : (
                <>No learners in this view. Try a different status tab.</>
              )}
            </PageEmptyCallout>
          </div>
        )}
      </div>

      {rows.length > 0 && !isError && total > 0 ? (
        <footer className={styles.panelFoot}>
          <Pagination
            currentPage={currentPage}
            totalItems={total}
            onPageChange={onPageChange}
          />
        </footer>
      ) : null}
    </section>
  );
}
