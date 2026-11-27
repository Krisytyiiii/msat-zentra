"use client";

import { CalendarClock } from "lucide-react";
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

const TABLE_ROWS = 8;

/** Live column budget, so the skeleton table keeps the same rhythm. */
const COLUMNS = [250, 100, 150, 130, 120, 50];

/**
 * Advisory attendance loading state — mirrors the loaded page: one full-width
 * board with the search/section controls and the same bordered roster table
 * (identical column widths and cell padding), so nothing shifts when the
 * attendance matrix lands.
 */
export function AdvisoryAttendanceSkeleton() {
  return (
    <ShimmerGroup>
      <section
        aria-busy="true"
        aria-label="Loading advisory attendance"
        className="flex min-w-0 flex-col gap-3"
      >
        <div className="flex min-w-0 flex-col" aria-hidden>
          <header className={listStyles.boardHead}>
            <span className={listStyles.boardIcon}>
              <CalendarClock size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-56 rounded-[16px] sm:w-64" />
              <Skeleton className="h-8 w-36 rounded-md" />
            </div>
          </header>

          <div className={listStyles.body}>
            <div className={listStyles.tableWrap}>
              <Table className={`${cascade.table} w-full table-fixed`}>
                <TableHeader>
                  <TableRow className="bg-muted/50 [&>th]:border-t-0">
                    {COLUMNS.map((width, index) => (
                      <TableHead key={index} style={{ width }} className="h-10">
                        {index < COLUMNS.length - 1 ? (
                          <Skeleton className="h-3 w-16" />
                        ) : null}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: TABLE_ROWS }).map((_, index) => (
                    <TableRow key={index} className="hover:bg-transparent">
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <Skeleton className="size-8 shrink-0 rounded-full" />
                          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-10" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-1.5 w-14 rounded-full" />
                          <Skeleton className="h-3 w-8" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3 w-20" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <Skeleton className="size-6 rounded" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </section>
    </ShimmerGroup>
  );
}
