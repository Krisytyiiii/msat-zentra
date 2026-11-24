"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import pageStyles from "./guidance-alerts.module.css";
import rowStyles from "./guidance-alerts-table.module.css";

/**
 * Loading shell for /guidance/alerts. It renders the same board chrome as the
 * loaded page — the full-width type/risk tabs + search toolbar, the column
 * head, the hairline case rows and the pager — so nothing moves when the
 * merged desk data lands. The whole tree shimmer-sweeps together (same
 * treatment as /nurse/alerts).
 */

const ROWS = 6;

function HeaderToolbarSkeleton() {
  return (
    <div
      className="flex w-full flex-wrap items-center justify-between gap-2"
      aria-hidden="true"
    >
      <div className={`${rowStyles.filterRow} ${rowStyles.filterRowScroll}`}>
        <Skeleton className={rowStyles.skelTab} />
        <Skeleton className={rowStyles.skelTab} />
        <Skeleton className={rowStyles.skelTab} />
        <Skeleton className={rowStyles.skelTab} />
      </div>
      <Skeleton className={rowStyles.skelSearch} />
    </div>
  );
}

/** One placeholder case row on the real `.caseRow` grid tracks. */
function CaseRowSkeleton() {
  return (
    <li className={rowStyles.skeletonRow} aria-hidden="true">
      <div className={`${rowStyles.cell} ${rowStyles.cellType}`}>
        <Skeleton className={rowStyles.skelTypePill} />
      </div>
      <div className={`${rowStyles.cell} ${rowStyles.cellLearner}`}>
        <Skeleton className={rowStyles.skelAvatar} />
        <div className={rowStyles.caseIdentity}>
          <Skeleton className={rowStyles.skelCaseName} />
          <div className={rowStyles.cellSub}>
            <Skeleton className={rowStyles.skelPillShort} />
          </div>
        </div>
      </div>
      <div className={`${rowStyles.cell} ${rowStyles.cellStack} ${rowStyles.colGrade}`}>
        <Skeleton className={rowStyles.skelLine} />
        <Skeleton className={rowStyles.skelLineShort} />
      </div>
      <div className={`${rowStyles.cell} ${rowStyles.colConcern}`}>
        <Skeleton className={rowStyles.skelConcernPill} />
      </div>
      <div className={`${rowStyles.cell} ${rowStyles.cellStatus}`}>
        <Skeleton className={rowStyles.skelPill} />
      </div>
      <div className={`${rowStyles.cell} ${rowStyles.colRisk}`}>
        <Skeleton className={rowStyles.skelPillShort} />
      </div>
      <div className={`${rowStyles.cell} ${rowStyles.cellStack} ${rowStyles.colSessions}`}>
        <Skeleton className={rowStyles.skelLineShort} />
        <Skeleton className={rowStyles.skelLineShort} />
      </div>
      <div className={`${rowStyles.cell} ${rowStyles.colReferred}`}>
        <Skeleton className={rowStyles.skelTimePill} />
      </div>
      <div className={rowStyles.caseActions}>
        <Skeleton className={rowStyles.skelBookPill} />
        <Skeleton className={rowStyles.skelBtnSm} />
      </div>
    </li>
  );
}

export function GuidanceAlertsSkeleton() {
  return (
    <section className={pageStyles.page} aria-busy="true" aria-label="Loading referred cases">
      <ShimmerGroup>
        <div className={`flex min-w-0 flex-col gap-3 ${rowStyles.boardIn}`}>
          <HeaderToolbarSkeleton />
          <div className={rowStyles.listPanel}>
            <div className={rowStyles.listHead} aria-hidden="true">
              <Skeleton className={rowStyles.skelHeadLabel} />
              <Skeleton className={rowStyles.skelHeadLabel} />
              <Skeleton className={`${rowStyles.skelHeadLabel} ${rowStyles.colGrade}`} />
              <Skeleton className={`${rowStyles.skelHeadLabel} ${rowStyles.colConcern}`} />
              <Skeleton className={rowStyles.skelHeadLabel} />
              <Skeleton className={rowStyles.skelHeadLabel} />
              <Skeleton className={`${rowStyles.skelHeadLabel} ${rowStyles.colSessions}`} />
              <Skeleton className={`${rowStyles.skelHeadLabel} ${rowStyles.colReferred}`} />
              <Skeleton className={rowStyles.skelHeadLabel} />
            </div>
            <ul className={rowStyles.caseList}>
              {Array.from({ length: ROWS }, (_, i) => (
                <CaseRowSkeleton key={i} />
              ))}
            </ul>
          </div>
          <ZentraPaginationSkeleton />
        </div>
      </ShimmerGroup>
    </section>
  );
}
