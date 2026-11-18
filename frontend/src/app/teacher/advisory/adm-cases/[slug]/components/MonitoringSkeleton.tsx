"use client";

import { Skeleton } from "@/components/ui/skeleton";

function HeroSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-48 max-w-full" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-5 w-28 rounded-md" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      </div>

      <div className="grid max-w-sm grid-cols-2 gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-md" />
        ))}
      </div>

      <div className="border-t pt-3">
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-16" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-2 w-full max-w-[4rem]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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

function ModulesSkeleton() {
  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
      aria-label="Loading modules"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2.5 w-64 max-w-full" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-md" />
          ))}
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-md border bg-background p-3"
        >
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-48 max-w-full" />
            <Skeleton className="h-2.5 w-56 max-w-full" />
          </div>
          <Skeleton className="h-7 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </section>
  );
}

function RailCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
      <Skeleton className="h-4 w-28" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-md" />
        ))}
      </div>
    </div>
  );
}

/**
 * ADM monitoring loading state — mirrors the loaded case desk: hero + journey,
 * the next-step callout, the progress card, then the modules tracker beside the
 * context rail.
 */
export function MonitoringSkeleton() {
  return (
    <div
      className="flex w-full flex-col gap-5"
      aria-busy="true"
      aria-label="Loading ADM monitoring"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3.5 w-32" />
        <HeroSkeleton />
      </div>

      <Skeleton className="h-10 w-full rounded-md" />

      <ProgressSkeleton />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <ModulesSkeleton />
        <div className="flex flex-col gap-5">
          <RailCardSkeleton rows={4} />
          <RailCardSkeleton rows={3} />
          <RailCardSkeleton rows={2} />
        </div>
      </div>
    </div>
  );
}
