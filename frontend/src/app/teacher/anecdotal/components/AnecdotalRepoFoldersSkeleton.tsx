"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import glassStyles from "@/components/anecdotal/anecdotal-record-kanban-card.module.css";
import { PAGE_SIZE } from "@/components/shared/pagination";
import styles from "./anecdotal-repo.module.css";
import repoStyles from "./anecdotal-repo-folders.module.css";

/**
 * One filed-record folder card placeholder — same glass shell as
 * `AnecdotalRecordKanbanCard` (`variant="glass"`): amber-edged surface,
 * category header row, inner body with the student above the folder graphic.
 */
function RecordCardSkeleton() {
  return (
    <div
      className={`${glassStyles.glass} flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl p-2.5`}
    >
      <div className="-mx-2.5 flex items-center gap-1.5 border-b border-border px-3.5 pb-2">
        <Skeleton className="size-3.5 shrink-0 rounded-sm" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 ${glassStyles.glassBody}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Skeleton className="h-5 w-32 max-w-full rounded-md" />
            <Skeleton className="h-5 w-24 max-w-full rounded-md" />
          </div>
        </div>
        <div className="flex w-full justify-center">
          <Skeleton className="aspect-[50/40] w-full max-w-[220px] rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * Filed-records loading state — mirrors `/teacher/anecdotal`: the desk header
 * (title + search + actions), the glass summary strip, the record-card grid
 * and the pagination footer.
 */
export function AnecdotalRepoFoldersSkeleton() {
  return (
    <section className={styles.page} aria-busy="true" aria-label="Loading filed records">
      <ShimmerGroup>
        <div className={`${styles.main} flex min-w-0 flex-col`}>
          <div className={`${repoStyles.panel} flex flex-1 flex-col`}>
            <header className={repoStyles.deskHead}>
              <Skeleton className="size-8 shrink-0 rounded-[0.625rem]" />
              <div className={repoStyles.deskHeading}>
                <Skeleton className="h-4 w-52 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <div className={repoStyles.deskTools}>
                <Skeleton className="h-8 w-full max-w-56 shrink-0 rounded-full" />
                <Skeleton className="h-6 w-36 shrink-0 rounded-full" />
                <Skeleton className="h-6 w-20 shrink-0 rounded-md" />
                <Skeleton className="h-6 w-32 shrink-0 rounded-md" />
              </div>
            </header>

            <StatDeck
              items={[]}
              columns={6}
              loading
              ariaLabel="Record summary"
            />

            <div className={repoStyles.content}>
              <div className={repoStyles.scrollArea}>
                <div className={repoStyles.folderGrid}>
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ShimmerGroup>
    </section>
  );
}
