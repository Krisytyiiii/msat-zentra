"use client";

import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import page from "./ClassWorkspace.module.css";

/**
 * Loading placeholder for the grading workspace. It mirrors the loaded page
 * 1:1 — the centered Subject info card (donut panel + icon-tile fact grid,
 * footer note and actions) beside the 12.5rem tool rail — so swapping in real
 * data never shifts layout.
 */
export function ClassWorkspaceSkeleton() {
  return (
    <section className={page.page} aria-busy="true" aria-label="Loading class workspace">
      <ShimmerGroup>
        <div className={page.layout} aria-hidden="true">
          <div className={page.main}>
            <div className="flex min-w-0 flex-1 items-center justify-center py-6">
              <div className="w-full max-w-3xl">
                <section className="w-full rounded-xl border border-border bg-card p-5 shadow-sm">
                  {/* Header: amber icon tile + subject name. */}
                  <div className="flex min-w-0 items-center gap-3">
                    <ShimmerSkeleton className="h-9 w-9 shrink-0 rounded-lg" />
                    <ShimmerSkeleton className="h-4 w-40" />
                  </div>

                  <div className="mt-4 border-t border-border pt-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-stretch">
                      {/* Weights donut panel + legend + balanced note. */}
                      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/20 p-4 dark:bg-transparent">
                        <ShimmerSkeleton className="h-32 w-32 rounded-full" />
                        <div className="flex w-full flex-col gap-0.5">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className="flex items-center gap-2 px-2 py-1.5">
                              <ShimmerSkeleton className="h-2 w-2 shrink-0 rounded-full" />
                              <ShimmerSkeleton className="h-3 flex-1" />
                              <ShimmerSkeleton className="h-3 w-8 shrink-0" />
                            </span>
                          ))}
                        </div>
                        <div className="w-full border-t border-border/70 pt-2">
                          <ShimmerSkeleton className="mx-auto h-3 w-40" />
                        </div>
                      </div>

                      {/* Icon-tile fact grid: four tiles + one wide enrolled tile. */}
                      <div className="grid grid-cols-2 gap-2">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5"
                          >
                            <ShimmerSkeleton className="h-8 w-8 shrink-0 rounded-md" />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <ShimmerSkeleton className="h-2.5 w-16" />
                              <ShimmerSkeleton className="h-3.5 w-20" />
                            </span>
                          </div>
                        ))}
                        <div className="col-span-2 flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5">
                          <ShimmerSkeleton className="h-8 w-8 shrink-0 rounded-md" />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <ShimmerSkeleton className="h-2.5 w-16" />
                            <ShimmerSkeleton className="h-3.5 w-24" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer: transmutation note + Manage weights / Class record. */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <ShimmerSkeleton className="h-3 w-56" />
                    <span className="flex items-center gap-2">
                      <ShimmerSkeleton className="h-7 w-28 rounded-md" />
                      <ShimmerSkeleton className="h-7 w-28 rounded-md" />
                    </span>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <aside className={page.subjectsPanel}>
            <div className={page.subjects}>
              {/* Rail header (collapse toggle) + one row per tool. */}
              <div className="flex w-full items-center justify-end">
                <ShimmerSkeleton className="h-7 w-6 rounded-md" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex w-full items-center gap-2 px-2 py-1.5">
                  <ShimmerSkeleton className="h-4 w-4 shrink-0 rounded" />
                  <ShimmerSkeleton className="h-3.5 flex-1" style={{ maxWidth: `${6 + i}rem` }} />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </ShimmerGroup>
    </section>
  );
}
