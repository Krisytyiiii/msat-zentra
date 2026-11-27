"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Laptop,
} from "lucide-react";
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
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import cascade from "@/components/shared/desk-cascade.module.css";
import listStyles from "../../list/components/advisory-list.module.css";
import styles from "./adm-cases.module.css";

/** The four figures the overview deck shows — labels/hints shape the skeleton. */
const OVERVIEW_STATS: StatDeckItem[] = [
  { key: "cases", label: "Cases", unit: "cases", value: 0, hint: "This school year", icon: ClipboardList },
  { key: "approved", label: "Approved", unit: "signed", value: 0, hint: "Signed by the Principal", icon: CheckCircle2 },
  { key: "modules", label: "Modules in", unit: "", value: "0/0", hint: "No modules released", icon: BookOpenCheck },
  { key: "devices", label: "Devices out", unit: "devices", value: 0, hint: "On loan to learners", icon: Laptop },
];

/** One placeholder row — same cells and spacing as the live case row. */
function CaseRowSkeleton() {
  return (
    <TableRow className="hover:bg-transparent" aria-hidden>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-[13px] w-32 max-w-full" />
            <Skeleton className="h-[12px] w-24" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-[12px] w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-[12px] w-20" />
        <Skeleton className="mt-1 block h-1 w-full max-w-[7rem] rounded-full" />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end">
          <Skeleton className="size-3.5 rounded-sm" />
        </div>
      </TableCell>
    </TableRow>
  );
}

/** One placeholder card in the "Latest referrals" grid. */
function RecentCardSkeleton() {
  return (
    <li className="min-w-0">
      <div className={`${styles.recentCard} pointer-events-none`} aria-hidden>
        <span className={styles.recentHead}>
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <span className={styles.recentIdentity}>
            <Skeleton className="h-[14px] w-28 max-w-full" />
          </span>
        </span>
        <span className={styles.recentFoot}>
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-[12px] w-20" />
        </span>
      </div>
    </li>
  );
}

/**
 * Split ADM desk loading state — a pixel-for-pixel copy of the live layout: the
 * case table (header strip, rows, pager) in the left pane and the adviser
 * overview (lead copy, stat deck, latest referrals) in the right one. One
 * shimmer sweep, so nothing shifts when the data lands.
 */
export function AdmCasesSkeleton() {
  return (
    <ShimmerGroup>
      <div className={styles.page} aria-busy="true" aria-label="Loading ADM cases">
        <section className={`${styles.panel} ${styles.listPane}`} aria-hidden>
          <div className={styles.panelHead}>
            <div className={styles.titleRow}>
              <Skeleton className="size-[1.625rem] shrink-0 rounded-lg" />
              <Skeleton className="h-[15px] w-28" />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
          </div>
          <div className={styles.panelToolbar}>
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>

          <div className={`${styles.panelScroll} ${styles.listPanel}`}>
            <div className={listStyles.tableWrap}>
              <Table className={`${cascade.table} w-full table-fixed`}>
                <TableHeader>
                  <TableRow className="bg-muted/50 [&>th]:border-t-0">
                    <TableHead className="h-10">
                      <Skeleton className="h-2.5 w-14" />
                    </TableHead>
                    <TableHead className="h-10" style={{ width: 148 }}>
                      <Skeleton className="h-2.5 w-16" />
                    </TableHead>
                    <TableHead className="h-10" style={{ width: 124 }}>
                      <Skeleton className="h-2.5 w-14" />
                    </TableHead>
                    <TableHead className="h-10" style={{ width: 44 }} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <CaseRowSkeleton key={index} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <footer className={styles.panelFoot}>
            <div className={styles.skelPager}>
              <Skeleton className="h-3.5 w-24" />
              <div className={styles.skelPagerBtns}>
                <Skeleton className="size-7 rounded-md" />
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="size-7 rounded-md" />
              </div>
            </div>
          </footer>
        </section>

        <section className={styles.panel} aria-hidden>
          <div className={styles.panelScroll}>
            <div className={styles.overview}>
              <div className={styles.overviewLead}>
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-[17px] w-40" />
                <Skeleton className="h-3 w-full max-w-md" />
                <Skeleton className="h-3 w-3/4 max-w-sm" />
              </div>

              <StatDeck columns={4} loading items={OVERVIEW_STATS} ariaLabel="ADM figures" />

              <section className={styles.card}>
                <header className={styles.cardHead}>
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-16" />
                </header>
                <ul className={styles.recentGrid}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <RecentCardSkeleton key={index} />
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </section>
      </div>
    </ShimmerGroup>
  );
}
