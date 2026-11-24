"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import { KanbanBoardSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import styles from "./guidance-overview.module.css";

/** Grade rows the live board usually ranks (G7–G12). */
const GRADE_ROWS = 6;

/** Live gauge legend sizes: three risk factors, six grade levels. */
const FACTOR_LEGEND = 3;
const GRADE_LEGEND = 6;

/**
 * Loading state for the guidance command center — one shimmer sweep over an
 * exact copy of the live page: the six-figure stat deck, the grade-attention
 * board (three-column row: grade + sections, section pills, risk metrics), the
 * donut + two gauge breakdown row, the caseload row, and the detection-flow
 * panel that now closes the page at full width. Nothing shifts when data lands.
 */
export function GuidanceOverviewSkeleton() {
  return (
    <ShimmerGroup>
      <section
        className={styles.page}
        aria-busy="true"
        aria-label="Loading guidance overview"
      >
        <StatDeck columns={6} loading items={[]} />

        <div className={styles.body}>
          <div className={styles.mainCol}>
            {/* Grade levels needing attention */}
            <KanbanBoardSkeleton
              titleWidth="14rem"
              rows={0}
              showDescription
              actions={<Skeleton className="h-4 w-12 shrink-0" />}
            >
              <ul className={styles.caseList} aria-hidden="true">
                {Array.from({ length: GRADE_ROWS }).map((_, index) => (
                  <li
                    key={index}
                    className={styles.caseRow}
                    style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
                  >
                    <div className={styles.rowLink}>
                      <div className={styles.caseInfo}>
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-5 w-16 shrink-0 rounded-md" />
                      </div>
                      <div className={styles.sectionGroup}>
                        <Skeleton className="h-5 w-20 shrink-0 rounded-md" />
                        <Skeleton className="h-5 w-20 shrink-0 rounded-md" />
                      </div>
                      <div className={styles.cellActions}>
                        <Skeleton className="h-5 w-16 rounded-md" />
                        <Skeleton className="h-5 w-20 rounded-md" />
                        <Skeleton className="size-4 rounded-sm" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </KanbanBoardSkeleton>

            {/* Risk section — risk-level donut + two gauge boards */}
            <div className={styles.threeCol}>
              <KanbanBoardSkeleton
                titleWidth="8rem"
                rows={0}
                showDescription
                className="flex-1"
              >
                <div className={styles.skelChartRow} aria-hidden="true">
                  <Skeleton className={styles.skelDonut} />
                  <div className={styles.skelLegend}>
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className={styles.skelLegendRow} />
                    ))}
                  </div>
                </div>
              </KanbanBoardSkeleton>

              {[FACTOR_LEGEND, GRADE_LEGEND].map((legendRows) => (
                <KanbanBoardSkeleton
                  key={legendRows}
                  titleWidth="9rem"
                  rows={0}
                  showDescription
                  className="flex-1"
                >
                  <div className="flex-1" aria-hidden="true">
                    <div className={styles.skelGaugeWrap}>
                      <Skeleton className={styles.skelGaugeArc} />
                    </div>
                    <div className={styles.skelGaugeLegend}>
                      {Array.from({ length: legendRows }).map((_, i) => (
                        <div key={i} className={styles.skelGaugeLegendItem}>
                          <Skeleton className={styles.skelSwatch} />
                          <Skeleton className="h-3 flex-1" />
                          <Skeleton className="h-3 w-12 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.footerSlot}>
                    <Skeleton className={styles.skelInterpretation} />
                  </div>
                </KanbanBoardSkeleton>
              ))}
            </div>

            {/* Caseload — referred-by-type donut + section trend line */}
            <div className={styles.twoCol}>
              <KanbanBoardSkeleton
                titleWidth="10rem"
                rows={0}
                showDescription
                className="flex-1"
              >
                <div className={styles.skelChartRow} aria-hidden="true">
                  <Skeleton className={styles.skelDonut} />
                  <div className={styles.skelLegend}>
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className={styles.skelLegendRow} />
                    ))}
                  </div>
                </div>
              </KanbanBoardSkeleton>

              <KanbanBoardSkeleton
                titleWidth="10rem"
                rows={0}
                showDescription
                className="flex-1"
              >
                <Skeleton className={styles.skelLine} aria-hidden="true" />
              </KanbanBoardSkeleton>
            </div>
          </div>

          {/* Detection flow — full-width panel under the charts */}
          <DetectionFlowSkeleton />
        </div>
      </section>
    </ShimmerGroup>
  );
}

/** The detection-flow panel's own placeholder while its board query lands. */
export function DetectionFlowSkeleton() {
  return (
    <div className={styles.skelFlow} aria-hidden="true">
      <div className={styles.skelFlowHeader}>
        <div className={styles.skelFlowHeaderText}>
          <Skeleton className={styles.skelEyebrow} />
          <Skeleton className={styles.skelFlowTitle} />
        </div>
        <Skeleton className={styles.skelFlowToggle} />
      </div>

      <div className={styles.skelFlowColumns}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={styles.skelFlowColumn}>
            <Skeleton className="h-3 w-14 max-w-full" />
            <Skeleton className={styles.skelFlowCount} />
            <Skeleton className="h-3 w-12 max-w-full" />
          </div>
        ))}
      </div>

      <Skeleton className={styles.skelFlowMesh} />

      <div className={styles.skelFlowTotalBox}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className={styles.skelFlowTotalValue} />
        <Skeleton className="h-3 w-40 max-w-full" />
      </div>

      <Skeleton className={styles.skelFlowFoot} />
    </div>
  );
}
