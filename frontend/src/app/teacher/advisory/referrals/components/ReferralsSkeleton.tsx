"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import refStyles from "./referrals.module.css";

const ROWS = 8;

/** One placeholder row mirroring the loaded referral table row. */
function ReferralRowSkeleton() {
  return (
    <tr>
      <td>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </td>
      <td><Skeleton className="h-6 w-20 rounded-full" /></td>
      <td><Skeleton className="h-6 w-24 rounded-full" /></td>
      <td><Skeleton className="h-3.5 w-28" /></td>
      <td><Skeleton className="h-3.5 w-24" /></td>
      <td><Skeleton className="h-5 w-28 rounded-full" /></td>
      <td>
        <div className="flex items-center justify-end gap-1">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
      </td>
    </tr>
  );
}

/**
 * Referrals loading state — mirrors the loaded casebook table: the panel
 * header strip and page action buttons, the status-tab/search toolbar, the
 * table rows and its pager footer.
 */
export function ReferralsSkeleton() {
  return (
    <ShimmerGroup>
      <div className="flex min-w-0 flex-col gap-3" aria-busy="true" aria-label="Loading referrals">
        <div className={refStyles.panel}>
          <div className={refStyles.laneHead}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
          </div>

          <div className={refStyles.panelToolbar}>
            <Skeleton className="h-8 w-64 max-w-full rounded-full" />
            <Skeleton className="h-8 w-60 max-w-full rounded-full" />
          </div>

          <div className={refStyles.tableArea}>
            <div className={refStyles.tableWrap}>
              <table className="w-full table-fixed" aria-hidden>
                <thead>
                  <tr className="bg-muted/50">
                    <th className="h-10 w-[26%]" />
                    <th className="h-10 w-[13%]" />
                    <th className="h-10 w-[13%]" />
                    <th className="h-10 w-[16%]" />
                    <th className="h-10 w-[15%]" />
                    <th className="h-10 w-[12%]" />
                    <th className="h-10 w-[5%]" />
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: ROWS }).map((_, index) => (
                    <ReferralRowSkeleton key={index} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={refStyles.panelFooter}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
              <div className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShimmerGroup>
  );
}

/**
 * Tracking-rail loading state — the same sticky aside the loaded page shows on
 * the right: eyebrow, glass identity card, status pills, the "with desk" line,
 * the segmented progress bar, pipeline steps (with their update-count chips)
 * and the expanded stage's desk activity, so the split layout keeps its
 * footprint while the first page lands.
 */
export function ReferralRailSkeleton() {
  return (
    <ShimmerGroup>
      <aside className={refStyles.trackRail} aria-busy="true" aria-label="Loading referral tracking">
        <div className={refStyles.trackHead}>
          <Skeleton className="h-3 w-32" />
          <div className="rounded-xl border border-border bg-muted/40 p-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-3 w-44" />
          <div className="flex gap-0.5" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-1 flex-1 rounded-full" />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1 p-1.5" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex min-w-0 items-start gap-2 px-2 py-1.5">
              <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              {i < 2 ? <Skeleton className="size-4 shrink-0 rounded-full" /> : null}
            </div>
          ))}
          <div className="ml-6 mr-2 flex min-w-0 flex-col gap-2 rounded-md border-l-2 border-amber-500/40 bg-muted/40 p-2.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mx-0 h-px w-full" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        </div>
      </aside>
    </ShimmerGroup>
  );
}
