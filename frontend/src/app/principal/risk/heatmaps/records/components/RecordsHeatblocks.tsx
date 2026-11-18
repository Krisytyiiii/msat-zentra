"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDot, FileText, Search, X } from "lucide-react";
import { PrincipalEmptyState } from "../../../../components/PrincipalEmptyCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { InsightCallout } from "@/components/ui/insight-callout";
import { PrivacyNoticeDialog } from "@/components/privacy-notice-dialog";
import {
  AnecdotalRecordKanbanCard,
  humanizeCategory,
} from "@/components/anecdotal/anecdotal-record-kanban-card";
import styles from "./RecordsHeatblocks.module.css";
import { CATEGORY_META, fetchRecords } from "@/services/principal/records.service";
import type { BehavioralCategory } from "../types";
import { liveQueryOptions } from "@/lib/api/live";
import { Pagination } from "@/components/shared/pagination";

const RECORDS_PAGE_SIZE = 16;

export function RecordsHeatblocks({
  category = null,
  onClearCategory,
  focus = null,
}: {
  /** Category picked in the summary panel — filters the list. */
  category?: BehavioralCategory | null;
  onClearCategory?: () => void;
  /** Learner picked in "Needs attention" — seeds the search once per pick. */
  focus?: { lrn: string; nonce: number } | null;
}) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);

  const [privacyFor, setPrivacyFor] = React.useState<string | null>(null);

  const { data, isPending, isError } = useQuery({
    ...liveQueryOptions,
    queryKey: ["records-heatmap"],
    queryFn: fetchRecords,
  });

  // A learner picked in the summary panel drops their LRN into the search so
  // their records are the only thing in the list. Derived during render (not
  // in an effect) so the list is filtered on the same commit as the pick.
  const [seenNonce, setSeenNonce] = React.useState<number | null>(null);
  if (focus && focus.nonce !== seenNonce) {
    setSeenNonce(focus.nonce);
    setQuery(focus.lrn);
    setPage(1);
  }

  const sections = React.useMemo(() => data?.sections ?? [], [data]);

  const shownReports = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections
      .flatMap((s) => s.students)
      .flatMap((st) => st.behavioral.map((rec) => ({ student: st, rec })))
      .filter(({ rec }) => (category ? rec.category === category : true))
      .filter(({ student }) =>
        q
          ? student.lrn.toLowerCase().includes(q) ||
            student.name.toLowerCase().includes(q)
          : true
      );
  }, [sections, query, category]);

  const totalPages = Math.max(1, Math.ceil(shownReports.length / RECORDS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedReports = shownReports.slice(
    (safePage - 1) * RECORDS_PAGE_SIZE,
    safePage * RECORDS_PAGE_SIZE
  );

  return (
    <>
      <KanbanBoard
        title="Anecdotal Records"
        icon={<FileText size={14} aria-hidden="true" />}
        description={
          category
            ? `Showing ${CATEGORY_META[category].label} records only — clear the filter to see every record.`
            : "Every anecdotal record filed this term. Search by name or LRN, or open a record to read it."
        }
        actions={
          <div className={styles.actions}>
            {category ? (
              <button
                type="button"
                className={styles.filterChip}
                onClick={() => onClearCategory?.()}
                aria-label={`Clear ${CATEGORY_META[category].label} filter`}
              >
                <span
                  className={styles.filterSwatch}
                  style={{ background: CATEGORY_META[category].color }}
                  aria-hidden
                />
                {CATEGORY_META[category].label}
                <X size={12} aria-hidden />
              </button>
            ) : null}
            <div className={styles.search}>
              <Search className={styles.searchIcon} aria-hidden />
              <Input
                type="search"
                placeholder="Search LRN or name"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                aria-label="Search students"
                className={`${styles.searchInput} rounded-[16px]`}
                style={{ height: "2rem" }}
              />
            </div>
          </div>
        }
        ariaLabel="Anecdotal records"
      >
        {isPending ? (
          <div
            className={styles.grid}
            aria-busy="true"
            aria-label="Loading student records"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.skelCard}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className={styles.empty}>
            <CircleDot className={styles.emptyIcon} aria-hidden />
            <p>Could not load student records.</p>
          </div>
        ) : shownReports.length === 0 ? (
          query.trim() ? (
            <div className={styles.noMatch}>
              <InsightCallout role="status" className={styles.noMatchCallout}>
                <strong>No reports match “{query.trim()}”.</strong> Try a
                different name or LRN — or clear the search to see every
                anecdotal record.
              </InsightCallout>
            </div>
          ) : (
            <PrincipalEmptyState
              icon={FileText}
              title="No reports found"
              hint="No anecdotal records match the current filters."
            />
          )
        ) : (
          <>
            <div className={styles.grid} role="list" aria-label="Anecdotal records">
              {pagedReports.map(({ student: s, rec }, i) => (
                <div
                  key={rec.id}
                  role="listitem"
                  className={styles.cardSlot}
                  style={{ animationDelay: `${Math.min(i, 24) * 55}ms` }}
                >
                  <AnecdotalRecordKanbanCard
                    category={rec.category}
                    headerTitle={CATEGORY_META[rec.category].label}
                    studentName={s.name}
                    plainName
                    mascotSeed={s.lrn}
                    mascotCharacter={s.mascot ?? undefined}
                    lrn={s.lrn}
                    metaText={s.section}
                    metaLabel="Section"
                    metaTone="amber"
                    fileName={rec.date}
                    fileTag={`${humanizeCategory(rec.category)} • ${rec.severity}`}
                    openLabel={`${s.name}, LRN ${s.lrn}, ${CATEGORY_META[rec.category].label} report from ${rec.date}`}
                    onOpen={() => setPrivacyFor(s.name)}
                  />
                </div>
              ))}
            </div>
            {totalPages > 1 ? (
              <Pagination
                currentPage={safePage}
                totalItems={shownReports.length}
                pageSize={RECORDS_PAGE_SIZE}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </KanbanBoard>

      <PrivacyNoticeDialog
        open={privacyFor !== null}
        onClose={() => setPrivacyFor(null)}
        studentName={privacyFor ?? undefined}
        reason="principal"
      />
    </>
  );
}
