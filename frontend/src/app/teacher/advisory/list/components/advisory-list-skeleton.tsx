"use client";

import { KanbanSquare } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import listStyles from "./advisory-list.module.css";
import insightStyles from "./advisory-insight-board.module.css";

const TABLE_ROWS = 8;
const INSIGHT_CARDS = 3;

function ListRowSkeleton() {
  return (
    <div className="flex items-center border-t px-4 py-3">
      <div className="flex min-w-0 items-center gap-2" style={{ width: 250 }}>
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-4/5" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

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
 * The insight board's placeholder body. Shared by the page-load shell and by
 * the board's own per-student fetch, so a fetch always shows one skeleton UI
 * (and the same one) instead of two different treatments.
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

/** Right pane of the split: the Student insight board at rest. */
function InsightSkeleton() {
  return (
    <div className={`${insightStyles.board} ${insightStyles.bare}`} aria-hidden>
      <header className={insightStyles.boardHead}>
        <span className={insightStyles.boardIcon}>
          <KanbanSquare size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-28" />
        </div>
      </header>

      <InsightBoardSkeleton />
    </div>
  );
}

/**
 * Advisory list loading state — mirrors the loaded page: one panel split into
 * the roster lane (head, filter, table, pagination) and the Student insight
 * board, plus the two-button action rail on the right.
 */
export function AdvisoryListSkeleton() {
  return (
    <ShimmerGroup>
      <section
        className={`${listStyles.pageLock} flex min-w-0 flex-col gap-3`}
        aria-busy="true"
        aria-label="Loading advisory list"
      >
        <div className="grid w-full items-start gap-4">
          <div className={listStyles.panel} aria-hidden>
            <header className={listStyles.boardHead}>
              <span className={listStyles.boardIcon} aria-hidden>
                <KanbanSquare size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-6 w-28 rounded-md" />
              </div>
            </header>

            <div className={listStyles.split}>
              <div className={listStyles.left}>
                <section className={listStyles.lane}>
                  <header className={listStyles.laneHead}>
                    <span className={listStyles.laneDot} style={{ background: "#f59e0b" }} />
                    <Skeleton className="h-3 w-24" />
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Skeleton className="size-6 rounded-md" />
                      <Skeleton className="size-6 rounded-md" />
                    </div>
                  </header>

                  <Skeleton className="h-8 w-full rounded-[16px]" />

                  <div className={listStyles.tableWrap}>
                    <div className="flex items-center bg-muted/50 px-4 py-3">
                      <Skeleton className="h-3 w-[7.5rem]" />
                    </div>
                    {Array.from({ length: TABLE_ROWS }).map((_, i) => (
                      <ListRowSkeleton key={i} />
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-28" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  </div>
                </section>
              </div>

              <div className={listStyles.right}>
                <InsightSkeleton />
              </div>
            </div>
          </div>
        </div>
      </section>
    </ShimmerGroup>
  );
}
