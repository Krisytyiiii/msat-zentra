"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { KanbanBoardSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import page from "./ClassWorkspace.module.css";

/**
 * Loading placeholder for the grading workspace. It mirrors the loaded page
 * 1:1 — the 12.5rem tool rail on the left and the centered tool panel on the
 * right (Subject info shape) — so swapping in real data never shifts layout.
 */
export function ClassWorkspaceSkeleton() {
  return (
    <section className={page.page} aria-busy="true" aria-label="Loading class workspace">
      <div className={page.layout} aria-hidden="true">
        <aside className={page.subjectsPanel}>
          <div className={page.subjects}>
            {/* Rail: one row per tool (Subject info, weights, add, record, lock). */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex w-full items-center gap-2 px-2 py-1.5"
              >
                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${6 + i}rem` }} />
              </div>
            ))}
          </div>
        </aside>

        <div className={page.main}>
          <div className="flex min-w-0 flex-1 items-center justify-center py-6">
            <div className="w-full max-w-2xl">
              <KanbanBoardSkeleton
                className={page.subjectBoard}
                titleWidth="10rem"
                showDescription
                actions={
                  <span className="flex items-center gap-1.5">
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-5 w-20 rounded-md" />
                  </span>
                }
                footer={
                  <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1">
                    <Skeleton className="h-7 w-36 rounded-md" />
                    <Skeleton className="h-7 w-28 rounded-md" />
                  </div>
                }
              >
                <div className="grid gap-5 px-1 py-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-center">
                  {/* Interactive weights donut + legend. */}
                  <div className="flex flex-col items-center gap-3">
                    <Skeleton className="h-32 w-32 rounded-full" />
                    <div className="flex w-full flex-col gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="flex items-center gap-2 px-2 py-1">
                          <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                          <Skeleton className="h-3 flex-1" />
                          <Skeleton className="h-3 w-8 shrink-0" />
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Info tiles: four facts + one wide enrolled tile. */}
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:bg-transparent"
                      >
                        <Skeleton className="h-2.5 w-16" />
                        <Skeleton className="h-3.5 w-20" />
                      </div>
                    ))}
                    <div className="col-span-2 flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:bg-transparent">
                      <Skeleton className="h-2.5 w-16" />
                      <Skeleton className="h-3.5 w-24" />
                    </div>
                  </div>
                </div>
              </KanbanBoardSkeleton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
