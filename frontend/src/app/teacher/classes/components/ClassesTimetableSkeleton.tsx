"use client";

import * as React from "react";
import { ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";

const DAYS = 5;
const PERIODS = 8;
const LUNCH_AFTER = 4;

const GRID = "grid grid-cols-[7rem_repeat(5,minmax(0,1fr))]";

/**
 * Loading placeholder for the My Classes week grid. It mirrors the real
 * timetable's shape exactly — the time rail, five day columns, eight period
 * rows and the lunch band after period 4 — so the shimmer does not jump when
 * the data lands. Every bar is the shared `ShimmerSkeleton` (the sheen
 * variant), not the plain pulse.
 */
export function ClassesTimetableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card dark:bg-transparent"
      aria-busy="true"
      aria-label="Loading classes"
    >
      <div className={`${GRID} border-b border-border/60 bg-muted/30`}>
        <div className="p-2">
          <ShimmerSkeleton className="h-3 w-10" />
        </div>
        {Array.from({ length: DAYS }).map((_, day) => (
          <div key={day} className="border-l border-border/60 p-2">
            <ShimmerSkeleton className="mx-auto h-3 w-12" />
          </div>
        ))}
      </div>

      {Array.from({ length: PERIODS }).map((_, period) => (
        <React.Fragment key={period}>
          <div className={`${GRID} border-b border-border/60`}>
            <div className="p-2">
              <ShimmerSkeleton className="h-3 w-14" />
              <ShimmerSkeleton className="mt-1.5 h-3 w-20" />
            </div>
            {Array.from({ length: DAYS }).map((__, day) => (
              <div key={day} className="border-l border-border/60 p-1">
                <ShimmerSkeleton className="h-14 w-full" />
              </div>
            ))}
          </div>
          {period === LUNCH_AFTER - 1 ? (
            <div className="flex justify-center border-b border-border/60 bg-muted/30 px-2 py-1.5">
              <ShimmerSkeleton className="h-3 w-44" />
            </div>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}
