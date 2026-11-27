"use client";

import { KanbanSquare } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import cascade from "@/components/shared/desk-cascade.module.css";
import listStyles from "./advisory-list.module.css";
import insightStyles from "./advisory-insight-board.module.css";

const TABLE_ROWS = 8;
const INSIGHT_CARDS = 3;

/** Live column budget: Student, Risk, Attendance, Average, Anecdotal, actions. */
const COLUMNS = [250, 110, 140, 100, 110, 50];

/** One insight card placeholder — same head / metric / facts anatomy as the board. */
function InsightCardSkeleton({ folders }: { folders?: ReactNode }) {
  return (
    <div className={insightStyles.kCard}>
      <div className={insightStyles.kHead}>
        <div className={insightStyles.kHeading}>
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="size-6 shrink-0 rounded-lg" />
      </div>
      {folders ? (
        <div className={`${insightStyles.kBody} ${insightStyles.folderGrid}`}>
          {folders}
        </div>
      ) : (
        <>
          <div className={insightStyles.kMetrics}>
            <div className={insightStyles.kMetric}>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <div className={insightStyles.kFacts}>
            <Skeleton className="h-3 w-24" />
          </div>
        </>
      )}
    </div>
  );
}

/** One anecdotal folder placeholder — same shell as the record folder card. */
function FolderCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/60 p-2.5 dark:bg-muted/20">
      <div className="flex items-center justify-between gap-1.5 border-b border-border pb-2">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex min-w-0 flex-row items-center gap-3 rounded-lg border bg-white p-3 dark:bg-card">
        <Skeleton className="h-16 w-[112px] shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * The insight board's placeholder body. Shared by the board's own per-student
 * fetch, so a fetch always shows one skeleton UI instead of a different
 * treatment from the page-load shell.
 */
export function InsightBoardSkeleton() {
  return (
    <div className={insightStyles.plainSection} aria-hidden>
      <header className={insightStyles.laneHead}>
        <span className={insightStyles.laneDot} style={{ background: "var(--border)" }} />
        <Skeleton className="h-3 w-24" />
      </header>
      <ul className={insightStyles.cardGrid}>
        {Array.from({ length: INSIGHT_CARDS }).map((_, i) => (
          <li key={i} className="min-w-0">
            <InsightCardSkeleton />
          </li>
        ))}
        <li className={`min-w-0 ${insightStyles.laneWide}`}>
          <InsightCardSkeleton
            folders={
              <>
                <FolderCardSkeleton />
                <FolderCardSkeleton />
                <FolderCardSkeleton />
              </>
            }
          />
        </li>
      </ul>
    </div>
  );
}

/**
 * Advisory list loading state — mirrors the loaded page: one full-width board
 * with the toolbar (risk tabs, search, edit/remove) and the roster data table.
 */
export function AdvisoryListSkeleton() {
  return (
    <ShimmerGroup>
      <section
        aria-busy="true"
        aria-label="Loading advisory list"
        className="flex min-w-0 flex-col gap-3"
      >
        <div className="flex min-w-0 flex-col" aria-hidden>
            <header className={listStyles.boardHead}>
              <span className={listStyles.boardIcon}>
                <KanbanSquare size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            </header>

            <div className={listStyles.body}>
              <div className={listStyles.toolbar}>
                {/* Risk tags: All students / Low / Moderate / High. */}
                {["w-32", "w-20", "w-28", "w-20"].map((width, index) => (
                  <Skeleton key={index} className={`h-[30px] ${width} rounded-full`} />
                ))}
                <Skeleton className="ml-auto h-8 w-56 rounded-[16px] sm:w-64" />
              </div>

              <div className={listStyles.tableWrap}>
                <Table className={`${cascade.table} w-full table-fixed`}>
                  <TableHeader>
                    <TableRow className="bg-muted/50 [&>th]:border-t-0">
                      {COLUMNS.map((width, index) => (
                        <TableHead key={index} style={{ width }} className="h-10">
                          {index < COLUMNS.length - 1 ? (
                            <Skeleton className="h-3 w-16" />
                          ) : null}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: TABLE_ROWS }).map((_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <Skeleton className="size-8 shrink-0 rounded-full" />
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                              <Skeleton className="h-3.5 w-32" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-10" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-1.5 w-14 rounded-full" />
                            <Skeleton className="h-3 w-8" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-10" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-12" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            <Skeleton className="size-6 rounded" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
        </div>
      </section>
    </ShimmerGroup>
  );
}
