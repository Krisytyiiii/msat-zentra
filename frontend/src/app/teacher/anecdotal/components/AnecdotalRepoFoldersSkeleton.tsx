"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import glassStyles from "@/components/anecdotal/anecdotal-record-kanban-card.module.css";
import { PAGE_SIZE } from "@/components/shared/pagination";
import styles from "./anecdotal-repo.module.css";
import repoStyles from "./anecdotal-repo-folders.module.css";

/** Approximate widths of the six filter tags (All + one per category). */
const FILTER_TAG_WIDTHS = [
  "w-16",
  "w-[5.5rem]",
  "w-[5.75rem]",
  "w-[5.75rem]",
  "w-[6.25rem]",
  "w-[5rem]",
];

/**
 * One filed-record folder card placeholder — same glass shell as
 * `AnecdotalRecordKanbanCard` (`variant="glass"`): category header row, inner
 * body with the mascot + name/LRN above the centered folder graphic, then the
 * bottom-right Edit/Delete action row.
 */
function RecordCardSkeleton() {
  return (
    <div
      className={`${glassStyles.glass} flex min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl p-2.5`}
    >
      <div className="flex w-full min-w-0 flex-col gap-2">
        <div className="-mx-2.5 flex min-w-0 items-center justify-between gap-1.5 border-b border-border px-3.5 pb-2">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Skeleton className="size-3.5 shrink-0 rounded-sm" />
            <Skeleton className="h-3.5 w-20" />
          </span>
        </div>
        <div
          className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 shadow-sm ${glassStyles.glassBody}`}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-col items-start gap-1">
              <Skeleton className="h-4 w-28 max-w-full rounded-md" />
              <Skeleton className="h-6 w-24 max-w-full rounded-md" />
            </div>
          </div>
          <div className="flex w-full justify-center">
            <Skeleton className="aspect-[50/40] w-full max-w-[220px] rounded-md" />
          </div>
        </div>
      </div>
      <div className="mt-auto flex w-full items-center justify-end gap-1.5 pt-0.5">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
      </div>
    </div>
  );
}

/**
 * Filed-records loading state — mirrors `/teacher/anecdotal`: the desk header
 * (badge + title + search/Archive records/Bama actions), the category filter
 * tag row, the record-card grid and the pagination footer.
 */
export function AnecdotalRepoFoldersSkeleton() {
  return (
    <section className={styles.page} aria-busy="true" aria-label="Loading filed records">
      <ShimmerGroup>
        <div className={`${styles.main} flex min-w-0 flex-col`}>
          <div className={`${repoStyles.panel} flex flex-1 flex-col`}>
            <header className={repoStyles.deskHead}>
              <Skeleton className="size-8 shrink-0 rounded-[0.625rem]" />
              <div className={repoStyles.deskHeading}>
                <Skeleton className="h-4 w-52 max-w-full" />
              </div>
              <div className={repoStyles.deskTools}>
                <Skeleton className="h-8 w-full max-w-56 shrink-0 rounded-full" />
                <Skeleton className="h-8 w-32 shrink-0 rounded-full" />
                <Skeleton className="h-8 w-32 shrink-0 rounded-md" />
              </div>
            </header>

            {/* Category filter tags (FilterTabs variant="tags"). */}
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTER_TAG_WIDTHS.map((width, i) => (
                <div
                  key={i}
                  className={`flex h-[1.875rem] items-center gap-[0.4375rem] rounded-full border border-border/85 bg-card/55 px-3 ${width}`}
                >
                  <Skeleton className="size-[7px] shrink-0 rounded-full" />
                  <Skeleton className="h-2.5 flex-1 rounded-sm" />
                  <Skeleton className="h-[1.125rem] w-4 shrink-0 rounded-full" />
                </div>
              ))}
            </div>

            <div className={repoStyles.content}>
              <div className={repoStyles.scrollArea}>
                <div className={repoStyles.folderGrid}>
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </div>
              </div>
              {/* Pagination footer: both info lines + prev/pages/next. */}
              <nav
                aria-hidden
                className="flex flex-wrap items-center justify-between gap-4"
              >
                <Skeleton className="h-3 w-[7.5rem]" />
                <Skeleton className="h-3 w-16" />
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="size-8 rounded-[8px]" />
                  <div className="flex items-center gap-1">
                    <Skeleton className="size-8 rounded-[8px]" />
                    <Skeleton className="size-8 rounded-[8px]" />
                  </div>
                  <Skeleton className="size-8 rounded-[8px]" />
                </div>
              </nav>
            </div>
          </div>
        </div>
      </ShimmerGroup>
    </section>
  );
}
