"use client";

import { FolderKanban, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import {
  TeacherSearchField,
  searchEmptyMessage,
} from "@/app/teacher/components/TeacherSearchField";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import type { AdmCase } from "@/services/teacher/admCases.types";
import { AdmCaseRow } from "./AdmCaseRow";
import cascade from "@/components/shared/desk-cascade.module.css";
import listStyles from "../../list/components/advisory-list.module.css";
import styles from "./adm-cases.module.css";

export function AdmCaseListPanel({
  cases,
  total,
  unfilteredTotal,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  onReferAdm,
  currentPage,
  onPageChange,
  casesQuery,
}: {
  cases: AdmCase[];
  total: number;
  unfilteredTotal: number;
  query: string;
  onQueryChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (row: AdmCase) => void;
  onReferAdm: () => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  casesQuery: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    refetch: () => void;
  };
}) {
  return (
    <section className={`${styles.panel} ${styles.listPane}`} aria-label="ADM case list">
      <header className={styles.panelHead}>
        <div className={styles.titleRow}>
          <span className={styles.titleIcon} aria-hidden>
            <FolderKanban size={15} />
          </span>
          <div className={styles.titleText}>
            <h2 className={styles.title}>ADM cases</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            className="h-7 gap-1 px-2 text-[12px]"
            onClick={onReferAdm}
          >
            <Send size={12} aria-hidden />
            New referral
          </Button>
        </div>
      </header>

      <div className={styles.panelToolbar}>
        <TeacherSearchField
          className="w-full"
          placeholder="Search learner, LRN, section, or stage…"
          value={query}
          onChange={onQueryChange}
          aria-label="Search ADM cases"
        />
      </div>

      <div className={`${styles.panelScroll} ${styles.listPanel}`}>
        {casesQuery.isError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <p role="alert" className="m-0 font-medium">
              Could not load your ADM cases.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => casesQuery.refetch()}
              disabled={casesQuery.isFetching}
            >
              {casesQuery.isFetching ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  <span aria-live="polite">Retrying</span>
                </>
              ) : (
                "Try again"
              )}
            </Button>
          </div>
        ) : cases.length > 0 ? (
          <div className={`${listStyles.tableWrap} ${cascade.table}`}>
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:border-t-0">
                  <TableHead className="h-10">Advisee</TableHead>
                  <TableHead className="h-10" style={{ width: 148 }}>
                    ADM stage
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 124 }}>
                    Modules
                  </TableHead>
                  <TableHead className="h-10" style={{ width: 44 }} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((row, index) => (
                  <AdmCaseRow
                    key={row.id}
                    caseData={row}
                    selected={row.id === selectedId}
                    onSelect={() => onSelect(row)}
                    index={index}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex w-full justify-center px-3 py-8">
            <PageEmptyCallout>
              {query.trim() ? (
                <>
                  {searchEmptyMessage(query, "ADM cases", "Try a different name, LRN, section, or stage.")}
                </>
              ) : (
                <>No ADM cases match this view.</>
              )}
            </PageEmptyCallout>
          </div>
        )}
      </div>

      {cases.length > 0 && !casesQuery.isError ? (
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
