"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import glass from "./modules-glass.module.css";
import styles from "./modules-skeleton.module.css";

const MODULE_CARDS = 6;
/** All / Submitted / Pending / Overdue — the same four tags ModulesPanel renders. */
const FILTER_TAGS = ["w-[4.25rem]", "w-[6.25rem]", "w-[5.5rem]", "w-[5.5rem]"];

/**
 * One module tile placeholder — same glass card, header, two-up metric grid,
 * progress track and footer actions as the loaded ModuleCard in ModulesPanel.
 */
function ModuleCardSkeleton() {
  return (
    <article className={`${glass.card} pointer-events-none`} aria-hidden>
      <div className={glass.cardHead}>
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className={glass.cardHeading}>
          <Skeleton className="h-3.5 w-32 max-w-full" />
          <span className={glass.cardMetaRow}>
            <Skeleton className="h-6 w-20 rounded-md" />
          </span>
        </div>
        <Skeleton className="h-6 w-[4.75rem] shrink-0 rounded-md" />
      </div>

      <div className={glass.cardMetrics}>
        <div className={glass.cardMetric}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-[1.375rem] w-14" />
          <Skeleton className="h-3 w-24 max-w-full" />
          <Skeleton className="mt-[0.3125rem] h-1 w-full rounded-full" />
        </div>
        <div className={glass.cardMetric}>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-24 max-w-full" />
          <Skeleton className="h-3 w-24 max-w-full" />
        </div>
      </div>

      <div className={glass.cardFoot}>
        <Skeleton className="h-3 w-28 max-w-full" />
        <div className="flex shrink-0 items-center gap-1">
          <Skeleton className="h-6 w-[4.5rem] rounded-md" />
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="size-6 rounded-md" />
        </div>
      </div>
    </article>
  );
}

/**
 * Loading state for the adviser Modules desk. Mirrors the loaded page exactly:
 * the Modules panel header (icon + title, section picker + Add module), the
 * status tag row, the module card grid and its pager. Submissions live in a
 * drawer, so they are not part of this board.
 */
export function AdvisoryModulesSkeleton() {
  return (
    <ShimmerGroup>
      <div
        className={`${styles.root} flex flex-col gap-4`}
        aria-busy="true"
        aria-label="Loading modules"
      >
        <section className="flex min-w-0 flex-col gap-3" aria-hidden>
          <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/70 pb-3">
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="size-7 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-7 w-40 rounded-md" />
              <Skeleton className="h-7 w-[6.5rem] rounded-md" />
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTER_TAGS.map((width, i) => (
                <Skeleton key={i} className={`h-[1.875rem] ${width} rounded-full`} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(264px,1fr))]">
            {Array.from({ length: MODULE_CARDS }).map((_, i) => (
              <ModuleCardSkeleton key={i} />
            ))}
          </div>

          <div className="pt-1">
            <ZentraPaginationSkeleton />
          </div>
        </section>
      </div>
    </ShimmerGroup>
  );
}
