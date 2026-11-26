"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import { KanbanBoardSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import type { RegistryDesk } from "@/services/registry/overview.service";
import styles from "./registry-overview-skeleton.module.css";

/** Folder cards the SF10 rail shows once loaded. */
const FEED_CARDS = 3;

/**
 * Loading state for a registry overview — one shimmer sweep over an exact copy
 * of the live page: the four-figure attention deck, the 70/30 split (SF10 rail
 * left, grade / requests / finals boards right) and the records ledger.
 * Every placeholder uses the shared deck + board skeleton shells, so nothing
 * shifts when the data lands.
 */
export function RegistryOverviewSkeleton({ desk }: { desk: RegistryDesk }) {
  return (
    <ShimmerGroup>
      <div
        className={styles.stack}
        aria-busy="true"
        aria-label={`Loading ${
          desk === "registrar" ? "registrar" : "record keeper"
        } overview`}
      >
        <StatDeck columns={4} loading items={[]} />

        <div className={styles.split}>
          {/* Left — latest SF10 files attached. */}
          <section className={styles.feed} aria-hidden="true">
            <div className={styles.feedHead}>
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <div className={styles.folderGrid}>
              {Array.from({ length: FEED_CARDS }).map((_, index) => (
                <Skeleton key={index} className={styles.folder} />
              ))}
            </div>
          </section>

          {/* Right — grade spread, request activity, finals queue. */}
          <div className={styles.splitStack} aria-hidden="true">
            <KanbanBoardSkeleton titleWidth="9rem" rows={2} showDescription />
            <KanbanBoardSkeleton titleWidth="8rem" rows={1} showDescription />
            <KanbanBoardSkeleton titleWidth="10rem" rows={2} showDescription />
          </div>
        </div>

        <KanbanBoardSkeleton titleWidth="7rem" rows={0} showDescription>
          <div className={styles.ledgerGrid} aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={styles.ledgerCell}>
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-[3px] w-full" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            ))}
          </div>
        </KanbanBoardSkeleton>
      </div>
    </ShimmerGroup>
  );
}
