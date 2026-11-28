"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import filtersStyles from "./guidance-anecdotal-filters.module.css";
import folderStyles from "./guidance-anecdotal-folders.module.css";
import pageStyles from "./guidance-anecdotal.module.css";

/**
 * Loading shell for /guidance/anecdotal. It reuses the live folder panel's own
 * layout classes (panel header with title/help/description, centred type tabs,
 * search, the 5/4/3/2/1 folder grid and the shared pager) so the board does not
 * move when the records land.
 */

const CARD_COUNT = 10;
/** Same labels as the live tabs: All types · ADM consultation · Counseling. */
const TYPE_TAB_WIDTHS = ["4.4rem", "7.6rem", "5.4rem"];

/** One placeholder folder card on the real AnecdotalRecordKanbanCard shell. */
function FolderCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border bg-muted/60 p-2.5 dark:bg-muted/20">
      <div className="-mx-2.5 flex min-w-0 items-center justify-between gap-1.5 border-b border-border px-3.5 pb-2">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Skeleton className="size-3.5 rounded" />
          <Skeleton className="h-[0.8125rem] w-24" />
        </span>
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>

      <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm dark:bg-card">
        <div className="flex min-w-0 items-center gap-1.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <span className="flex min-w-0 flex-col items-start gap-1">
            <Skeleton className="h-[0.875rem] w-28 max-w-full" />
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </span>
          </span>
        </div>
        <span className="flex w-full justify-center">
          <Skeleton className="h-[100px] w-[120px] rounded-md" />
        </span>
      </div>
    </div>
  );
}

export function GuidanceAnecdotalSkeleton() {
  return (
    <section
      className={pageStyles.page}
      aria-busy="true"
      aria-label="Loading referred records"
    >
      <ShimmerGroup>
        <div className={`${pageStyles.main} flex min-w-0 flex-col`}>
          <div className={folderStyles.panel}>
            <div className={folderStyles.header}>
              <div className="flex flex-wrap items-center gap-1" aria-hidden="true">
                {TYPE_TAB_WIDTHS.map((width) => (
                  <Skeleton key={width} className="h-5 rounded-md" style={{ width }} />
                ))}
              </div>

              <div className={folderStyles.headerActions}>
                <div className={filtersStyles.searchWrap}>
                  <Skeleton className={filtersStyles.search} />
                </div>
                <Skeleton className="size-6 shrink-0 rounded-full" />
              </div>
            </div>

            <div className={folderStyles.content}>
              <div className={folderStyles.scrollArea}>
                <div className={folderStyles.studentGrid} aria-hidden="true">
                  {Array.from({ length: CARD_COUNT }, (_, i) => (
                    <FolderCardSkeleton key={i} />
                  ))}
                </div>
              </div>
              <ZentraPaginationSkeleton />
            </div>
          </div>
        </div>
      </ShimmerGroup>
    </section>
  );
}
