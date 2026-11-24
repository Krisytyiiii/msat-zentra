"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import styles from "./interventions.module.css";

/** Six placeholder rows — the same count the first page usually lands with. */
const ROWS = 6;

/** Filter chips the live toolbar shows (section is the optional one). */
const TAGS = [7, 9.5, 10.5, 8];

/**
 * Loading state for the adviser's intervention desk — one shimmer sweep over a
 * pixel-for-pixel copy of the live layout: header + count pill, the glass-tag
 * toolbar with search, the glass case list (head row, eight columns, pager)
 * and the detection-flow rail on the right, so nothing shifts when data lands.
 */
export function InterventionsSkeleton() {
  return (
    <ShimmerGroup>
      <section className={styles.page} aria-busy="true" aria-label="Loading interventions">
        <div className={styles.boardShell}>
          <header className={styles.header}>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <Skeleton className={styles.skelTitleIcon} />
                <Skeleton className={styles.skelTitle} />
              </div>
              <Skeleton className={styles.skelDescription} />
            </div>
            <Skeleton className={styles.skelCountPill} />
          </header>

          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              {TAGS.map((width, index) => (
                <Skeleton
                  key={index}
                  className={styles.skelTag}
                  style={{ width: `${width}rem` }}
                />
              ))}
            </div>
            <Skeleton className={styles.skelSearch} />
          </div>

          <div className={styles.listPanel} role="status" aria-label="Loading intervention cases">
            <div className={styles.listHead} aria-hidden>
              <Skeleton className={styles.skelHeadLabel} />
              <Skeleton className={styles.skelHeadLabel} style={{ width: "2.5rem" }} />
              <Skeleton
                className={`${styles.skelHeadLabel} ${styles.headSection}`}
                style={{ width: "4rem" }}
              />
              <Skeleton className={styles.skelHeadLabel} style={{ width: "4.25rem" }} />
              <Skeleton className={styles.skelHeadLabel} style={{ width: "4rem" }} />
              <Skeleton
                className={`${styles.skelHeadLabel} ${styles.headSessions}`}
                style={{ width: "3.5rem" }}
              />
              <Skeleton className={styles.skelHeadLabel} style={{ width: "3.25rem" }} />
              <span />
            </div>
            <ul className={styles.listBody} aria-hidden>
              {Array.from({ length: ROWS }).map((_, index) => (
                <li key={index} className={styles.skelCaseRow}>
                  <div className={`${styles.cell} ${styles.cellPerson}`}>
                    <Skeleton className={styles.skelAvatar} />
                    <div className={styles.skelPersonLines}>
                      <Skeleton className={styles.skelBar} style={{ width: "8.5rem" }} />
                      <Skeleton className={styles.skelBar} style={{ width: "5.5rem" }} />
                    </div>
                  </div>

                  <div className={`${styles.cell} ${styles.cellRisk}`}>
                    <Skeleton className={styles.skelPill} style={{ width: "3.75rem" }} />
                  </div>

                  <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellSection}`}>
                    <Skeleton className={styles.skelMeta} style={{ width: "3.75rem" }} />
                    <Skeleton className={styles.skelMeta} style={{ width: "3rem" }} />
                  </div>

                  <div className={`${styles.cell} ${styles.cellFactors}`}>
                    <Skeleton className={styles.skelFactor} />
                    <Skeleton className={styles.skelFactor} />
                    <Skeleton className={styles.skelFactor} />
                  </div>

                  <div className={`${styles.cell} ${styles.cellStatus}`}>
                    <Skeleton className={styles.skelPill} style={{ width: "5.5rem" }} />
                  </div>

                  <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellSessions}`}>
                    <Skeleton className={styles.skelMeta} style={{ width: "3rem" }} />
                    <Skeleton className={styles.skelMeta} style={{ width: "2.5rem" }} />
                  </div>

                  <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellFlagged}`}>
                    <Skeleton className={styles.skelMeta} style={{ width: "3.25rem" }} />
                  </div>

                  <div className={`${styles.cell} ${styles.cellAction}`}>
                    <Skeleton className={styles.skelAction} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.skelPager}>
            <Skeleton className={styles.skelRange} />
            <div className={styles.skelPagerBtns}>
              <Skeleton className={styles.skelPageBtn} />
              <Skeleton className={styles.skelPageLabel} />
              <Skeleton className={styles.skelPageBtn} />
            </div>
          </div>
        </div>

        <aside className={styles.flowAside} aria-label="Loading detection flow">
          <div className={styles.skelFlow}>
            <div className={styles.skelFlowHead}>
              <Skeleton className={styles.skelEyebrow} />
              <Skeleton className={styles.skelFlowTitle} />
            </div>

            <div className={styles.skelFlowColumns}>
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className={styles.skelFlowColumn}>
                  <Skeleton className={styles.skelBar} style={{ width: "3.5rem" }} />
                  <Skeleton className={styles.skelFlowCount} />
                  <Skeleton className={styles.skelBar} style={{ width: "3rem" }} />
                </div>
              ))}
            </div>

            <Skeleton className={styles.skelFlowMesh} />

            <div className={styles.skelFlowTotal}>
              <Skeleton className={styles.skelBar} style={{ width: "4rem" }} />
              <Skeleton className={styles.skelFlowTotalValue} />
              <Skeleton className={styles.skelBar} style={{ width: "9rem", maxWidth: "100%" }} />
            </div>

            <Skeleton className={styles.skelFlowFoot} />
          </div>
        </aside>
      </section>
    </ShimmerGroup>
  );
}
