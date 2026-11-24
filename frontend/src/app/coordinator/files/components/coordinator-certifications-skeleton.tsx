"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import folders from "./coordinator-certifications-folders.module.css";
import styles from "./coordinator-certifications.module.css";

const TAB_WIDTHS = ["w-12", "w-16", "w-20", "w-24", "w-20"];

/**
 * Loading state for the certifications desk. Structurally identical to the
 * loaded page — header row, file shelf and pager — so the content does not
 * jump when data arrives.
 */
export function CoordinatorCertificationsSkeleton() {
  return (
    <ShimmerGroup>
      <section
        className={styles.page}
        aria-busy="true"
        aria-label="Certifications"
      >
        <div className={styles.layout}>
          <div className={styles.main}>
            <section className={folders.boardShell} aria-label="Loading files">
            <div className={folders.boardHeader}>
              <Skeleton className="h-4 w-36" />
              <div className={folders.filterRow}>
                {TAB_WIDTHS.map((width, i) => (
                  <Skeleton
                    key={i}
                    className={`h-[30px] rounded-full ${width}`}
                  />
                ))}
              </div>
              <div className={folders.headerActions}>
                <Skeleton className="h-8 w-60 max-w-full rounded-lg" />
                <Skeleton className="size-6 rounded-full" />
              </div>
            </div>

            <div className={folders.listPanel}>
              <div className={folders.listHead} aria-hidden>
                {Array.from({ length: 8 }).map((_, i) => (
                  <span key={i}>
                    <Skeleton className={folders.skelHeadLabel} />
                  </span>
                ))}
              </div>
              <ul className={folders.listBody}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <li
                    key={i}
                    className={folders.skelRow}
                    style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}
                    aria-hidden="true"
                  >
                    <div className={`${folders.cell} ${folders.cellPerson}`}>
                      <Skeleton className={folders.skelAvatar} />
                      <div className={folders.skelPersonLines}>
                        <Skeleton className={`${folders.skelBar} w-36`} />
                        <Skeleton className={`${folders.skelMeta} w-20`} />
                      </div>
                    </div>
                    <div className={`${folders.cell} ${folders.cellGrade}`}>
                      <Skeleton className={`${folders.skelPill} w-10`} />
                    </div>
                    <div className={`${folders.cell} ${folders.cellEligibility}`}>
                      <Skeleton className={`${folders.skelPill} w-16`} />
                    </div>
                    <div className={`${folders.cell} ${folders.cellStatus}`}>
                      <Skeleton className={`${folders.skelPill} w-24`} />
                      <Skeleton className={`${folders.skelBar} w-28`} />
                    </div>
                    <div className={`${folders.cell} ${folders.cellFiles}`}>
                      <Skeleton className={`${folders.skelMeta} w-12`} />
                    </div>
                    <div className={`${folders.cell} ${folders.cellPrepared}`}>
                      <Skeleton className={`${folders.skelMeta} w-14`} />
                    </div>
                    <div className={`${folders.cell} ${folders.cellApproved}`}>
                      <Skeleton className={`${folders.skelMeta} w-14`} />
                    </div>
                    <div className={`${folders.cell} ${folders.cellAction}`}>
                      <Skeleton className={folders.skelAction} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <div className={styles.skelPager} aria-hidden="true">
          <Skeleton className={styles.skelRange} />
          <div className={styles.skelPagerButtons}>
            <Skeleton className={styles.skelPageBtn} />
            <Skeleton className={styles.skelPageLabel} />
            <Skeleton className={styles.skelPageBtn} />
          </div>
        </div>
      </div>
      </section>
    </ShimmerGroup>
  );
}
