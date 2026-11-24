"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import tableStyles from "./NurseAlertsTable.module.css";

/* Mirrors the real board one-to-one: the tag-filter bar, the 4-up folder-card
   grid (every card repeats the loaded card's header, identity row, folder
   block, pill rows, detail buttons and footer action), then the shared pager.
   The desk head and figure strip are rendered by the page itself, so they are
   not repeated here. Wrapped in ShimmerGroup so the whole board sweeps with
   one sheen instead of pulsing shape by shape. */
export function NurseReferralsSkeleton({
  entries = 16,
  paginate = true,
}: {
  entries?: number;
  paginate?: boolean;
}) {
  return (
    <ShimmerGroup>
      <div className={tableStyles.layout} aria-busy="true" aria-label="Loading your cases">
        <div className={`${tableStyles.feed} ${tableStyles.feedWide}`}>
          {/* Tag-filter bar — six rounded tags, the same 30px height. */}
          <div
            className="flex flex-wrap items-center gap-1.5"
            aria-hidden="true"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton
                key={i}
                className="h-[1.875rem] w-[6.5rem] rounded-full"
              />
            ))}
          </div>
          <div className={tableStyles.kanbanGrid} aria-hidden="true">
            {Array.from({ length: entries }).map((_, i) => (
              <NurseCaseCardSkeleton key={i} />
            ))}
          </div>
          {paginate ? <ZentraPaginationSkeleton /> : null}
        </div>
      </div>
    </ShimmerGroup>
  );
}

/* Same shell as the real NurseCaseKanbanCard article: outer muted card with a
   bordered header (document title + case-status pill), then the inner card
   holding the identity row, status copy, folder block, pill rows, detail
   buttons and the footer action. */
function NurseCaseCardSkeleton() {
  return (
    <article
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/60 p-2.5 dark:bg-muted/20"
      aria-hidden="true"
    >
      <header className="-mx-2.5 flex min-w-0 items-center justify-between gap-1.5 border-b border-border px-3.5 pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </header>
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-white p-2.5 shadow-sm dark:bg-card">
        <span className="flex min-w-0 items-center gap-1.5">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <span className="flex min-w-0 flex-col gap-1">
            <Skeleton className="h-4 w-28" />
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-md" />
            </span>
          </span>
        </span>
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-[6.5rem] w-[7.5rem] rounded-lg" />
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Skeleton className="h-5 w-12 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </span>
        <div className="flex min-w-0 items-center gap-1.5">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-7 flex-1 rounded-md" />
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5 pt-1">
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
    </article>
  );
}
