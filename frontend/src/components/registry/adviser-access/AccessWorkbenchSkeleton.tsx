"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAGE_SIZE } from "@/components/shared/pagination";
import styles from "./adviser-access.module.css";

/* Loading mirrors for the registry adviser-access page (both desks). They
   render the real page chrome (deck, request strip, workbench) out of the same
   CSS module as the loaded page, so the skeleton can't drift from what
   actually swaps in: same stat deck, same request-card grid, same 8-column
   table, same page size. Each mirror sits in a `ShimmerGroup`, so the whole
   board sweeps left-to-right on one sheen instead of pulsing shape by shape. */

const COLUMNS = [
  "Learner",
  "LRN",
  "Grade",
  "Section",
  "Adviser",
  "SF10 record",
  "Status",
  "Actions",
] as const;

/** "Access requests at a glance" deck — the shared stat strip in loading mode. */
export function AdviserAccessDeckSkeleton() {
  return (
    <ShimmerGroup>
      <StatDeck ariaLabel="Access request stats" items={[]} loading />
    </ShimmerGroup>
  );
}

/** "Pending requests" strip: header line + three request cards. */
export function AdviserAccessStripSkeleton() {
  return (
    <ShimmerGroup>
      <section className={styles.requestStrip} aria-hidden="true">
        <div className={styles.stripHead}>
          <span className={styles.stripTitle}>Pending requests</span>
        </div>
        <div className={styles.requestCards}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.requestCard}>
              <span className={styles.requestCardHead}>
                <Skeleton className="size-7 rounded-full" />
                <span className={styles.requestCardWho}>
                  <Skeleton className="h-3 w-32 max-w-full" />
                  <Skeleton className="h-2.5 w-20 max-w-full" />
                </span>
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              </span>
              <Skeleton className="h-2.5 w-full" />
              <span className={styles.progress}>
                <span className={styles.progressFill} style={{ width: "50%" }} />
              </span>
              <span className={styles.requestCardFoot}>
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-2.5 w-20" />
              </span>
            </div>
          ))}
        </div>
      </section>
    </ShimmerGroup>
  );
}

/** "Requests workbench": title row, tag filters, search, and the real table grid. */
export function AdviserAccessWorkbenchSkeleton({ rows = PAGE_SIZE }: { rows?: number }) {
  return (
    <ShimmerGroup>
      <section
        className={styles.board}
        aria-busy="true"
        aria-label="Loading adviser access requests"
        role="status"
      >
        <div className={styles.boardHead}>
          <div className={styles.boardTitleRow}>
            <span className={styles.boardTitle}>
              <Skeleton className="h-3.5 w-40" />
            </span>
            <div className={styles.bulkActions}>
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-6 w-36 rounded-md" />
            </div>
          </div>

          <div className={styles.toolbar}>
            <div className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[1.875rem] w-24 rounded-full" />
              ))}
            </div>
            <div className={styles.toolbarRight}>
              <Skeleton className="h-8 w-60 rounded-lg" />
            </div>
          </div>
        </div>

        <AdviserAccessTableSkeleton rows={rows} />

        <div className={styles.boardFoot}>
          <Skeleton className="h-2.5 w-44" />
          <Skeleton className="h-7 w-52 rounded-full" />
        </div>
      </section>
    </ShimmerGroup>
  );
}

/**
 * The 8-column workbench table on its own — header plus `rows` placeholder
 * rows, inside the loaded table's wrapper. Used by the page skeleton and,
 * swapped in place of the rows, when a page switch has to wait on a fetch.
 */
export function AdviserAccessTableSkeleton({ rows = PAGE_SIZE }: { rows?: number }) {
  return (
    <ShimmerGroup>
      <div className={`${styles.tableWrap} ${styles.tableWrapSkeleton}`}>
        <Table className={styles.table} aria-hidden="true">
        <TableHeader className={styles.thead}>
          <TableRow>
            {COLUMNS.map((label, i) => (
              <TableHead key={label} className={i === COLUMNS.length - 1 ? "text-right" : undefined}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, row) => (
            <TableRow key={row}>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Skeleton className="size-[1.375rem] shrink-0" />
                  <Skeleton className="size-[30px] shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-28 max-w-full" />
                </div>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="size-[1.125rem] shrink-0" />
                </span>
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-10 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-3.5 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell className="text-right">
                <span className="inline-flex justify-end">
                  <Skeleton className="h-6 w-16 rounded-md" />
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </ShimmerGroup>
  );
}
