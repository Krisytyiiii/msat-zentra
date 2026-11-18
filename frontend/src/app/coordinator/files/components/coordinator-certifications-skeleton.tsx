"use client";

import { Skeleton } from "@/components/ui/skeleton";
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
                  <Skeleton key={i} className={`h-5 rounded-md ${width}`} />
                ))}
              </div>
              <div className={folders.headerActions}>
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-8 w-60 rounded-2xl" />
              </div>
            </div>

            <ul className={folders.fileList}>
              {Array.from({ length: 8 }).map((_, i) => (
                <li
                  key={i}
                  className={folders.fileRow}
                  style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}
                  aria-hidden="true"
                >
                  <div className={folders.fileMain}>
                    <Skeleton className="size-[34px] shrink-0 rounded-full" />
                    <div className={folders.fileIdentity}>
                      <Skeleton className="h-4 w-36" />
                      <div className={folders.identityMeta}>
                        <Skeleton className="h-[18px] w-20 rounded-md" />
                        <Skeleton className="h-[18px] w-10 rounded-md" />
                      </div>
                    </div>
                    <div className={folders.fileMeta}>
                      <Skeleton className="h-3 w-10" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-[18px] w-24 rounded-md" />
                  </div>
                  <div className={folders.fileAction}>
                    <Skeleton className="h-6 w-16 rounded-md" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className={styles.railSkel} aria-hidden>
          <Skeleton className={styles.railSkelIcon} />
          <Skeleton className={styles.railSkelIcon} />
        </div>
      </div>
    </section>
  );
}
