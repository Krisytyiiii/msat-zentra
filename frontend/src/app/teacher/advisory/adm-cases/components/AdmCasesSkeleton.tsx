"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import styles from "./adm-cases.module.css";

/** One placeholder row in the left-hand case list — same grid as the live row. */
function CaseRowSkeleton() {
  return (
    <li className={`${styles.row} pointer-events-none`} aria-hidden>
      <div className={`${styles.cell} ${styles.cellPerson}`}>
        <Skeleton className="size-[30px] shrink-0 rounded-full" />
        <div className={styles.personText}>
          <Skeleton className="h-3 w-32 max-w-full" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </div>
      </div>
      <div className={`${styles.cell} ${styles.cellStage}`}>
        <Skeleton className="h-5 w-24 rounded-md" />
      </div>
      <div className={`${styles.cell} ${styles.cellModules}`}>
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div className={`${styles.cell} ${styles.cellAction}`}>
        <Skeleton className="size-3.5 rounded-sm" />
      </div>
    </li>
  );
}

/**
 * Split ADM desk loading state — the case list beside the adviser overview,
 * with the same pane chrome and heights as the loaded page. Everything inside
 * rides one shimmer sweep instead of pulsing shape by shape.
 */
export function AdmCasesSkeleton() {
  return (
    <ShimmerGroup>
      <div className={styles.page} aria-busy="true" aria-label="Loading ADM cases">
        <section className={`${styles.panel} ${styles.listPane}`} aria-hidden>
          <div className={styles.panelHead}>
            <div className={styles.titleRow}>
              <Skeleton className="size-6 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-9 rounded-full" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
          </div>
          <div className={styles.panelToolbar}>
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
          <div className={`${styles.listHead}`} aria-hidden>
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-14" />
            <span />
          </div>
          <ul className={`${styles.listBody} m-0 list-none p-0`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <CaseRowSkeleton key={i} />
            ))}
          </ul>
        </section>

        <section className={styles.panel} aria-hidden>
          <div className={styles.skeletonStack}>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-full max-w-md" />
              <Skeleton className="h-3 w-3/4 max-w-sm" />
            </div>

            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-[10px] border border-border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-6 rounded-md" />
                    <Skeleton className="h-2.5 w-14" />
                  </div>
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-2.5 w-24 max-w-full" />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-16" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-2 rounded-md border border-border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-7 rounded-full" />
                      <Skeleton className="h-3 w-28 max-w-full" />
                    </div>
                    <Skeleton className="h-5 w-24 rounded-md" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </ShimmerGroup>
  );
}
