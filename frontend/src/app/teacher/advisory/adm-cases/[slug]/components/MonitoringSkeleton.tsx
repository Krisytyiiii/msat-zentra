"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";

/** Case header: identity, stage/eligibility pills, facts and the journey strip. */
function HeroSkeleton() {
  return (
    <section className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-48 max-w-full" />
            <Skeleton className="h-5 w-32 rounded-md" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-5 w-26 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t pt-3">
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2.5 w-16" />
          </div>
          <div className="flex w-full gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5"
              >
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-2 w-full max-w-[4rem]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The "what happens next" callout above the module tracker. */
function NextStepSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 rounded-md border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-md" />
        <Skeleton className="h-4 w-40 max-w-full" />
      </div>
      <Skeleton className="h-3 w-full max-w-lg" />
      <Skeleton className="h-3 w-3/4 max-w-md" />
      <Skeleton className="mt-1 h-8 w-32 rounded-md" />
    </div>
  );
}

/** Module progress deck — five stat tiles over the completion meter. */
function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border bg-background p-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-2.5 w-16" />
            </div>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-2.5 w-24 max-w-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="h-2.5 w-48" />
      </div>
    </div>
  );
}

/**
 * ADM monitoring loading state — mirrors the opened case workspace: the view
 * tabs, the hero with its journey strip, the next-step callout, then the module
 * tracker. One shimmer sweep covers the whole pane.
 */
export function MonitoringSkeleton() {
  return (
    <ShimmerGroup>
      <div
        className="flex w-full flex-col gap-4"
        aria-busy="true"
        aria-label="Loading ADM monitoring"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>

        <HeroSkeleton />
        <NextStepSkeleton />
        <ProgressSkeleton />
      </div>
    </ShimmerGroup>
  );
}
