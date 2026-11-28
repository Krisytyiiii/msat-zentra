"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import tableStyles from "./NurseAlertsTable.module.css";

/* Column tracks in the same 140/240/150/110/150/120/44 proportion as the
   real table-fixed head, and the placeholder width for each header label. */
const COLUMNS = "140fr 240fr 150fr 110fr 150fr 120fr 44fr";
const HEAD_CELLS = [44, 48, 88, 56, 40, 52, 0];

/* Mirrors the real case desk one-to-one: the action-tag bar, the data list
   column head (concern / learner / grade & section / sessions / status /
   referred / chevron) with hairline rows, then the shared pager. The desk head
   and figure strip are rendered by the page itself, so they are not repeated
   here. Wrapped in ShimmerGroup so the whole board sweeps with one sheen
   instead of pulsing shape by shape. */
export function NurseReferralsSkeleton({
  entries = 8,
  paginate = true,
}: {
  entries?: number;
  paginate?: boolean;
}) {
  return (
    <ShimmerGroup>
      <div
        className={tableStyles.layout}
        aria-busy="true"
        aria-label="Loading your cases"
      >
        <div className={`${tableStyles.feed} ${tableStyles.feedWide}`}>
          {/* Action-tag bar — "All cases" plus the action filters. */}
          <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-[1.875rem] w-[6.5rem] rounded-full"
              />
            ))}
          </div>
          <div className={tableStyles.tableWrap}>
            <div aria-hidden="true">
              <div
                className={`${tableStyles.skeletonRow} ${tableStyles.skeletonHead}`}
                style={{ gridTemplateColumns: COLUMNS }}
              >
                {HEAD_CELLS.map((width, index) => (
                  <Skeleton
                    key={index}
                    className="h-3"
                    style={{ width: `${width}px` }}
                  />
                ))}
              </div>
              {Array.from({ length: entries }).map((_, row) => (
                <div
                  key={row}
                  className={tableStyles.skeletonRow}
                  style={{ gridTemplateColumns: COLUMNS }}
                >
                  {/* Concern pill */}
                  <Skeleton className="h-5 w-20 rounded-md" />
                  {/* Learner — mascot + name/LRN */}
                  <span className="flex min-w-0 items-center gap-2">
                    <Skeleton className="size-7 shrink-0 rounded-full" />
                    <span className="flex min-w-0 flex-col gap-1">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 w-20" />
                    </span>
                  </span>
                  {/* Grade & section */}
                  <span className="flex min-w-0 flex-col gap-1">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-2.5 w-16" />
                  </span>
                  {/* Sessions */}
                  <span className="flex min-w-0 flex-col gap-1">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-2.5 w-14" />
                  </span>
                  {/* Status */}
                  <Skeleton className="h-3 w-16" />
                  {/* Referred elapsed pill */}
                  <Skeleton className="h-5 w-20 rounded-md" />
                  {/* Chevron */}
                  <Skeleton className="size-3.5 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          {paginate ? <ZentraPaginationSkeleton /> : null}
        </div>
      </div>
    </ShimmerGroup>
  );
}
