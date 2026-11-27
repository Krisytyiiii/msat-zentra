"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";

/**
 * One folder tile placeholder. Mirrors the loaded card markup exactly (outer
 * tinted frame, status + term pill strip, inner white slip with avatar/name/LRN
 * and the 120×100 folder illustration footprint) so nothing jumps when data
 * lands.
 */
export function Sf10FolderCardSkeleton() {
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/60 p-2.5 text-left dark:bg-muted/20"
      aria-hidden
    >
      <span className="-mx-2.5 flex min-w-0 items-center gap-1.5 border-b border-border px-3.5 pb-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </span>
      <span className="flex min-w-0 flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm dark:bg-card">
        <span className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-5 w-3/4 rounded-full" />
            <Skeleton className="h-5 w-1/2 rounded-full" />
          </span>
        </span>
        <span className="flex w-full justify-center">
          <Skeleton className="h-[100px] w-[120px] rounded-lg" />
        </span>
      </span>
    </div>
  );
}

/** Card placeholder matching the loaded glass learner card. */
function Sf10RecordCardSkeleton() {
  return (
    <div
      className="flex min-h-[11.5rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
      aria-hidden
    >
      <div className="flex items-start gap-2 border-b border-border p-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-3/4 rounded-full" />
          <Skeleton className="h-3 w-1/2 rounded-full" />
        </div>
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      </div>
      <div className="grid grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 border-r border-border p-2.5 last:border-r-0">
            <Skeleton className="h-3 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-3 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border p-2.5">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-md" />
      </div>
    </div>
  );
}

/**
 * Page-level loading state. Mirrors the loaded SF10 access desk: the same
 * header (icon tile + title + Request), the filter tabs + search row, then the
 * responsive learner card grid.
 */
export function Sf10PageSkeleton() {
  return (
    <ShimmerGroup>
      <section
        className="flex min-w-0 flex-col gap-3"
        aria-busy="true"
        aria-label="Loading SF10 access"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-2">
            <Skeleton className="h-[1.625rem] w-[1.625rem] shrink-0 rounded-lg" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <Skeleton className="h-7 w-32 shrink-0 rounded-md" />
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-64 rounded-full" />
          <Skeleton className="ml-auto h-8 w-56 rounded-lg sm:w-64" />
        </div>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(264px,1fr))]">
          {Array.from({ length: 6 }).map((_, i) => (
            <Sf10RecordCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </ShimmerGroup>
  );
}
