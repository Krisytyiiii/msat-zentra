"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import cascade from "@/components/shared/desk-cascade.module.css";
import listStyles from "../../list/components/advisory-list.module.css";
import styles from "./interventions.module.css";

/** Six placeholder rows — the same count the first page usually lands with. */
const ROWS = 6;

/** Live column budget, so the skeleton table keeps the same rhythm. */
const COLUMNS = [260, 90, 220, 150, 110, 100, 56];

/**
 * Loading state for the adviser's intervention desk — one shimmer sweep over a
 * pixel-for-pixel copy of the live layout: the header with its search field on
 * the right, then the same bordered case table (seven columns, header strip,
 * pager). Nothing shifts when data lands.
 */
export function InterventionsSkeleton() {
  return (
    <ShimmerGroup>
      <section
        className="flex min-w-0 flex-col gap-3"
        aria-busy="true"
        aria-label="Loading interventions"
      >
        <div className={styles.boardShell}>
          <header className={styles.header}>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <Skeleton className={styles.skelTitleIcon} />
                <Skeleton className={styles.skelTitle} />
              </div>
              <Skeleton className={styles.skelDescription} />
            </div>
            <Skeleton className={styles.skelSearch} />
          </header>

          <div
            className={listStyles.tableWrap}
            role="status"
            aria-label="Loading intervention cases"
          >
            <Table className={`${cascade.table} w-full table-fixed`}>
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:border-t-0">
                  {COLUMNS.map((width, index) => (
                    <TableHead key={index} style={{ width }} className="h-10">
                      {index < COLUMNS.length - 1 ? (
                        <Skeleton className={styles.skelHeadLabel} />
                      ) : null}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: ROWS }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <Skeleton className={styles.skelAvatar} />
                        <div className={styles.skelPersonLines}>
                          <Skeleton className={styles.skelBar} style={{ width: "8.5rem" }} />
                          <Skeleton className={styles.skelBar} style={{ width: "5.5rem" }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className={styles.skelPill} style={{ width: "3.75rem" }} />
                    </TableCell>
                    <TableCell>
                      <Skeleton className={styles.skelBar} style={{ width: "9rem" }} />
                    </TableCell>
                    <TableCell>
                      <Skeleton className={styles.skelPill} style={{ width: "5.5rem" }} />
                    </TableCell>
                    <TableCell>
                      <div className={styles.skelPersonLines}>
                        <Skeleton className={styles.skelBar} style={{ width: "3rem" }} />
                        <Skeleton className={styles.skelBar} style={{ width: "2.5rem" }} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className={styles.skelBar} style={{ width: "3.25rem" }} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Skeleton className="size-7 rounded-md" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      </section>
    </ShimmerGroup>
  );
}
