"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { KanbanBoardSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import charts from "./teacher-overview-charts.module.css";
import layout from "./teacher-overview.module.css";
import skeleton from "./teacher-overview-skeleton.module.css";

/** Reserves the "What it means" footer so the boards keep their real height. */
function InterpretationSkeleton() {
  return (
    <div className={skeleton.footerRail} aria-hidden="true">
      <Skeleton className={skeleton.footerLine} style={{ width: "88%" }} />
      <Skeleton className={skeleton.footerLine} style={{ width: "62%" }} />
    </div>
  );
}

/**
 * Mirrors the loaded overview exactly: Risk mix + Students by risk factor across,
 * the two full-width day-by-day boards, Subject averages beside the Assessment
 * pipeline, and the "My day" right rail (Profile + Needs attention).
 */
export function TeacherOverviewSkeleton() {
  return (
    <section className={layout.page} aria-busy="true" aria-label="Loading overview">
      <ShimmerGroup>
        <div className={layout.body}>
          <div className={layout.mainCol}>
            <div className={charts.stack}>
              {/* Risk mix · Students by risk factor */}
              <div className={charts.gridWide}>
                <KanbanBoardSkeleton
                  titleWidth="6rem"
                  showDescription
                  footer={<InterpretationSkeleton />}
                >
                  <div className={skeleton.body}>
                    <div className={skeleton.donutRow}>
                      <Skeleton className={skeleton.donut} />
                      <div className={skeleton.legendCol}>
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className={skeleton.legendRow} />
                        ))}
                      </div>
                    </div>
                  </div>
                </KanbanBoardSkeleton>

                <KanbanBoardSkeleton
                  titleWidth="11.5rem"
                  showDescription
                  footer={<InterpretationSkeleton />}
                >
                  <div className={skeleton.body}>
                    <div className={skeleton.bars}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className={skeleton.barRow} />
                      ))}
                    </div>
                  </div>
                </KanbanBoardSkeleton>
              </div>

              {/* At-risk detection · Attendance, day by day — one board per row */}
              <div className={charts.gridStack}>
                {["12.5rem", "11.5rem"].map((titleWidth) => (
                  <KanbanBoardSkeleton
                    key={titleWidth}
                    titleWidth={titleWidth}
                    showDescription
                    footer={<InterpretationSkeleton />}
                  >
                    <div className={skeleton.body}>
                      <Skeleton className={skeleton.chartPlate} />
                      <div className={skeleton.legendCol}>
                        {Array.from({ length: 2 }).map((_, i) => (
                          <Skeleton key={i} className={skeleton.legendRow} />
                        ))}
                      </div>
                    </div>
                  </KanbanBoardSkeleton>
                ))}
              </div>

              {/* Subject averages · Assessment pipeline */}
              <div className={charts.gridWide}>
                <KanbanBoardSkeleton
                  titleWidth="8rem"
                  showDescription
                  footer={<InterpretationSkeleton />}
                >
                  <div className={skeleton.body}>
                    <div className={skeleton.donutCenter}>
                      <Skeleton className={skeleton.donutLarge} />
                    </div>
                  </div>
                </KanbanBoardSkeleton>

                <KanbanBoardSkeleton
                  titleWidth="9.5rem"
                  showDescription
                  footer={<InterpretationSkeleton />}
                >
                  <div className={skeleton.body}>
                    <Skeleton className={skeleton.chartPlate} style={{ height: "176px" }} />
                    <div className={skeleton.legendCol}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className={skeleton.legendRow} />
                      ))}
                    </div>
                  </div>
                </KanbanBoardSkeleton>
              </div>
            </div>
          </div>

          <aside
            className={layout.sideCol}
            style={{ top: "calc(4rem + var(--term-banner-offset, 0rem))" }}
          >
            <div className={skeleton.railStack}>
              {/* Profile */}
              <KanbanBoardSkeleton titleWidth="4.5rem">
                <div className={skeleton.profilePane}>
                  <div className={skeleton.profileTop}>
                    <Skeleton className={skeleton.avatar} />
                    <div className={skeleton.profileText}>
                      <Skeleton className={skeleton.nameLine} />
                      <Skeleton className={skeleton.roleLine} />
                    </div>
                  </div>
                  <Skeleton className={skeleton.advisoryLine} />
                  <div className={skeleton.profileStats}>
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className={skeleton.statCell}>
                        <Skeleton className={skeleton.statValue} />
                        <Skeleton className={skeleton.statLabel} />
                      </div>
                    ))}
                  </div>
                </div>
              </KanbanBoardSkeleton>

              {/* Needs attention */}
              <KanbanBoardSkeleton
                titleWidth="7.5rem"
                showDescription
                actions={<Skeleton className={skeleton.dragHint} />}
              >
                <Skeleton className={skeleton.riskSummary} />
                <div className={skeleton.riskCards}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className={skeleton.riskCard} />
                  ))}
                </div>
              </KanbanBoardSkeleton>
            </div>
          </aside>
        </div>
      </ShimmerGroup>
    </section>
  );
}
