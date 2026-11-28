"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import cascade from "@/components/shared/desk-cascade.module.css";
import pageStyles from "./nurse-alerts.module.css";
import rowStyles from "./nurse-alerts-table.module.css";

/**
 * Loading shell for /nurse/alerts — the same chrome as the loaded page (type
 * tabs + search toolbar, the case data table with the same column widths and
 * the pager), so nothing moves when the desk data lands.
 */

const ROWS = 6;

export function NurseAlertsSkeleton() {
  return (
    <section
      className={pageStyles.page}
      aria-busy="true"
      aria-label="Loading referred cases"
    >
      <ShimmerGroup>
        <div className={`flex min-w-0 flex-col gap-3 ${rowStyles.boardIn}`}>
          <div
            className="flex w-full flex-wrap items-center justify-between gap-2"
            aria-hidden="true"
          >
            <div className={`${rowStyles.filterRow} ${rowStyles.filterRowScroll}`}>
              <Skeleton className={rowStyles.skelTab} />
              <Skeleton className={rowStyles.skelTab} />
              <Skeleton className={rowStyles.skelTab} />
            </div>
            <Skeleton className={rowStyles.skelSearch} />
          </div>
          <div className={rowStyles.tableWrap}>
            <Table className={`${cascade.table} w-full table-fixed`}>
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:border-t-0">
                  <TableHead style={{ width: 120 }} className="h-10">
                    <Skeleton className="h-3 w-10" />
                  </TableHead>
                  <TableHead style={{ width: 240 }} className="h-10">
                    <Skeleton className="h-3 w-14" />
                  </TableHead>
                  <TableHead style={{ width: 150 }} className="h-10">
                    <Skeleton className="h-3 w-24" />
                  </TableHead>
                  <TableHead style={{ width: 150 }} className="h-10">
                    <Skeleton className="h-3 w-14" />
                  </TableHead>
                  <TableHead style={{ width: 100 }} className="h-10">
                    <Skeleton className="h-3 w-10" />
                  </TableHead>
                  <TableHead style={{ width: 120 }} className="h-10">
                    <Skeleton className="h-3 w-16" />
                  </TableHead>
                  <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: ROWS }, (_, i) => (
                  <TableRow key={i} aria-hidden="true">
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <span className="flex min-w-0 items-center gap-2">
                        <Skeleton className="size-7 shrink-0 rounded-full" />
                        <span className="flex min-w-0 flex-col gap-1">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-2.5 w-20" />
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex min-w-0 flex-col gap-1">
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="h-2.5 w-16" />
                      </span>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-md" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="size-4 rounded-sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ZentraPaginationSkeleton />
        </div>
      </ShimmerGroup>
    </section>
  );
}
