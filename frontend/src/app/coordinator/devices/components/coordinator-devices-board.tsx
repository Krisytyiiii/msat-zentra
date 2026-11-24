"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  CheckCircle2,
  CircleDashed,
  Laptop,
  Loader2,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  TabletSmartphone,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { Pill, type PillTone } from "@/components/ui/pill";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { SearchField } from "@/components/ui/search-field";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { stageLabel } from "@/services/coordinator/labels";
import { toSlug } from "@/lib/slug";
import type { AdmDeviceRow } from "@/services/coordinator/coordinator.types";
import { cn } from "@/lib/utils";
import styles from "./coordinator-devices-table.module.css";

export type DeviceFilter = "all" | "issued" | "returned";

const STATUS_TABS: { value: DeviceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issued", label: "Issued" },
  { value: "returned", label: "Returned" },
];

const STATUS_TAB_TONE: Record<
  DeviceFilter,
  "neutral" | "amber" | "blue" | "red" | "green"
> = {
  all: "neutral",
  issued: "amber",
  returned: "green",
};

const ROW_ACCENT: Record<AdmDeviceRow["status"], string> = {
  issued: styles.rowIssued,
  returned: styles.rowReturned,
};

const STATUS_TONE: Record<AdmDeviceRow["status"], PillTone> = {
  issued: "amber",
  returned: "green",
};

/** Device silhouette — the row reads as hardware at a glance. */
function DeviceGlyph({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t.includes("phone") || t.includes("mobile")) return <Smartphone />;
  if (t.includes("laptop") || t.includes("chromebook")) return <Laptop />;
  if (t.includes("desktop") || t.includes("monitor") || t.includes("pc"))
    return <Monitor />;
  if (t.includes("tablet") || t.includes("ipad")) return <Tablet />;
  return <TabletSmartphone />;
}

interface CoordinatorDevicesBoardProps {
  rows: AdmDeviceRow[];
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  filter: DeviceFilter;
  onFilterChange: (v: DeviceFilter) => void;
  returningId?: string | null;
  /** Desk-wide counters (all pages) — shown as tab counts. */
  issuedCount?: number;
  returnedCount?: number;
  onRetry: () => void;
  onRecordReturn: (row: AdmDeviceRow) => void;
  onIssueDevice: () => void;
  /** Opens the full-record overlay for a row. */
  onOpenDetail: (row: AdmDeviceRow) => void;
}

/**
 * Device ledger — the same glass list panel as the Files desk: one row per
 * issued learning device, with every important column read left-to-right
 * (learner, grade, ADM stage, device, issue/return dates, status, action).
 * Search, status tags and the issue action share the board header; pagination
 * sits under the board.
 */
export function CoordinatorDevicesBoard({
  rows,
  isPending,
  isError,
  isRefetching,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  returningId = null,
  issuedCount,
  returnedCount,
  onRetry,
  onRecordReturn,
  onIssueDevice,
  onOpenDetail,
}: CoordinatorDevicesBoardProps) {
  const searchTerm = query.trim().toLowerCase();

  // Filter the loaded page instantly as the clerk types; the debounced server
  // query then swaps in matches from the rest of the ledger.
  const filteredRows = React.useMemo(() => {
    if (searchTerm === "") return rows;
    return rows.filter((row) =>
      `${row.student} ${row.lrn} ${row.deviceType} ${row.deviceSerial} ${row.grade}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [rows, searchTerm]);

  const counts = React.useMemo<Record<DeviceFilter, number>>(() => {
    const issued =
      typeof issuedCount === "number"
        ? issuedCount
        : rows.filter((r) => r.status === "issued").length;
    const returned =
      typeof returnedCount === "number"
        ? returnedCount
        : rows.filter((r) => r.status === "returned").length;
    return { all: issued + returned, issued, returned };
  }, [issuedCount, returnedCount, rows]);

  if (isPending) {
    return <CoordinatorDevicesBoardSkeleton />;
  }

  if (isError) {
    return (
      <div className={styles.errorBlock} role="alert">
        <p className={styles.errorText}>
          We couldn&apos;t load the device ledger. Please check your internet
          connection and try again.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={isRefetching}
          onClick={onRetry}
        >
          {isRefetching ? (
            <Loader2 className={styles.spin} aria-hidden="true" />
          ) : null}
          {isRefetching ? "Loading…" : "Try again"}
        </Button>
      </div>
    );
  }

  return (
    <section
      className={cn(styles.boardShell, styles.boardIn)}
      aria-label="Learning devices"
    >
      <div className={styles.boardHeader}>
        <span className={styles.boardTitle}>
          <span className="text-amber-500" aria-hidden>
            <TabletSmartphone size={14} />
          </span>
          Devices
        </span>

        <div className={styles.filterRow}>
          <FilterTabs
            label="Filter devices by status"
            variant="tags"
            options={STATUS_TABS.map((tab) => ({
              value: tab.value,
              label: tab.label,
              count: counts[tab.value],
              tone: STATUS_TAB_TONE[tab.value],
            }))}
            value={filter}
            onChange={onFilterChange}
          />
        </div>

        <div className={styles.headerActions}>
          <SearchField
            className="w-60 max-w-full"
            placeholder="Search serial, student, or LRN…"
            value={query}
            onChange={onQueryChange}
            aria-label="Search serial, student, or LRN"
          />
          <Button size="sm" onClick={onIssueDevice}>
            <Plus aria-hidden />
            Issue device
          </Button>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <PageEmptyCallout>
          {searchTerm !== ""
            ? "No devices match your search. Try a different serial, learner, or LRN."
            : "No devices match the current filters. Try a different status."}
        </PageEmptyCallout>
      ) : (
        <div className={styles.listPanel}>
          <div className={styles.listHead} aria-hidden="true">
            <span>Learner</span>
            <span>Grade</span>
            <span>ADM stage</span>
            <span>Device</span>
            <span className={styles.headIssued}>Issued</span>
            <span className={styles.headReturned}>Returned</span>
            <span>Status</span>
            <span />
          </div>
          <ul className={styles.listBody} aria-label="Device ledger">
            {filteredRows.map((row, index) => {
              const issued = row.status === "issued";
              const overdue = issued && row.stage === "completion";
              const returning = returningId === row.id;
              const statusHint = row.conditionNotes
                ? row.conditionNotes
                : issued
                  ? "Out with learner"
                  : row.returnedDate
                    ? "Returned"
                    : "In inventory";

              return (
                <li
                  key={row.id}
                  className={cn(
                    styles.row,
                    styles.rowClickable,
                    ROW_ACCENT[row.status],
                    overdue && styles.rowOverdue,
                  )}
                  style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}
                  data-status={row.status}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open device record for ${row.student}`}
                  onClick={() => onOpenDetail(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenDetail(row);
                    }
                  }}
                >
                  <div className={`${styles.cell} ${styles.cellPerson}`}>
                    <StudentMascot
                      name={row.student}
                      seed={row.lrn}
                      character={row.mascot ?? undefined}
                      size={30}
                    />
                    <div className={styles.personText}>
                      <p className={styles.personName} title={row.student}>
                        {row.student}
                      </p>
                      <span className={styles.personLrn}>
                        {row.lrn || "—"}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`${styles.cell} ${styles.cellPill} ${styles.cellGrade}`}
                  >
                    <Pill tone="blue" label="Grade level">
                      {row.grade || "—"}
                    </Pill>
                  </div>

                  <div
                    className={`${styles.cell} ${styles.cellPill} ${styles.cellStage}`}
                  >
                    <Pill
                      tone={row.stage === "completion" ? "green" : "amber"}
                      label="ADM stage"
                      title={stageLabel(row.stage)}
                    >
                      {stageLabel(row.stage)}
                    </Pill>
                  </div>

                  <div className={`${styles.cell} ${styles.cellDevice}`}>
                    <span className={styles.deviceGlyph} aria-hidden="true">
                      <DeviceGlyph type={row.deviceType} />
                    </span>
                    <div className={styles.personText}>
                      <p
                        className={styles.personName}
                        title={row.deviceType}
                      >
                        {row.deviceType}
                      </p>
                      <span
                        className={styles.personLrn}
                        title={row.deviceSerial}
                      >
                        {row.deviceSerial}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellIssued}`}
                  >
                    <span className={styles.cellLabel}>Issued</span>
                    <span className={styles.cellValue}>{row.issuedDate}</span>
                    <span className={styles.cellMuted}>by {row.issuedBy}</span>
                  </div>

                  <div
                    className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellReturned}`}
                  >
                    <span className={styles.cellLabel}>Returned</span>
                    <span className={styles.cellValue}>
                      {row.returnedDate ?? "Not yet"}
                    </span>
                  </div>

                  <div className={`${styles.cell} ${styles.cellStatus}`}>
                    <Pill
                      tone={STATUS_TONE[row.status]}
                      label="Device status"
                    >
                      {issued ? (
                        <CircleDashed size={12} aria-hidden />
                      ) : (
                        <CheckCircle2 size={12} aria-hidden />
                      )}
                      {issued ? "Issued" : "Returned"}
                      {overdue ? (
                        <TriangleAlert size={12} aria-hidden />
                      ) : null}
                    </Pill>
                    <span
                      className={styles.cellMuted}
                      title={statusHint}
                    >
                      {statusHint}
                    </span>
                  </div>

                  <div
                    className={`${styles.cell} ${styles.cellAction}`}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {issued ? (
                      <Button
                        size="xs"
                        variant="outline"
                        className="gap-1 bg-card px-2 text-xs text-foreground"
                        disabled={returning}
                        aria-busy={returning || undefined}
                        aria-label={`Record return of ${row.deviceSerial}`}
                        onClick={() => onRecordReturn(row)}
                      >
                        {returning ? (
                          <Loader2 className="animate-spin" aria-hidden />
                        ) : (
                          <ArrowRightLeft aria-hidden />
                        )}
                        {returning ? "Recording…" : "Record return"}
                      </Button>
                    ) : (
                      <Button
                        asChild
                        variant="outline"
                        className="gap-1 bg-card px-2 text-xs text-foreground"
                      >
                        <Link
                          href={`/coordinator/enrolled/${encodeURIComponent(
                            toSlug(row.student),
                          )}`}
                        >
                          View case
                        </Link>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Ledger-shaped loading mirror for the page Suspense. */
export function CoordinatorDevicesBoardSkeleton() {
  return (
    <ShimmerGroup>
      <section className={styles.boardShell} aria-label="Loading devices">
      <div className={styles.boardHeader}>
        <Skeleton className="h-4 w-24" />
        <div className={styles.filterRow}>
          <Skeleton className="h-[30px] w-16 rounded-full" />
          <Skeleton className="h-[30px] w-20 rounded-full" />
          <Skeleton className="h-[30px] w-24 rounded-full" />
        </div>
        <div className={styles.headerActions}>
          <Skeleton className="h-8 w-60 max-w-full rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      <div className={styles.listPanel}>
        <div className={styles.listHead} aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i}>
              <Skeleton className={styles.skelHeadLabel} />
            </span>
          ))}
        </div>
        <ul className={styles.listBody}>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className={styles.skelRow} aria-hidden="true">
              <div className={`${styles.cell} ${styles.cellPerson}`}>
                <Skeleton className={styles.skelAvatar} />
                <div className={styles.skelPersonLines}>
                  <Skeleton className={`${styles.skelBar} w-36`} />
                  <Skeleton className={`${styles.skelMeta} w-20`} />
                </div>
              </div>
              <div className={`${styles.cell} ${styles.cellGrade}`}>
                <Skeleton className={`${styles.skelPill} w-10`} />
              </div>
              <div className={`${styles.cell} ${styles.cellStage}`}>
                <Skeleton className={`${styles.skelPill} w-20`} />
              </div>
              <div className={`${styles.cell} ${styles.cellDevice}`}>
                <Skeleton className={`${styles.skelBar} w-28`} />
              </div>
              <div className={`${styles.cell} ${styles.cellIssued}`}>
                <Skeleton className={`${styles.skelMeta} w-16`} />
              </div>
              <div className={`${styles.cell} ${styles.cellReturned}`}>
                <Skeleton className={`${styles.skelMeta} w-16`} />
              </div>
              <div className={`${styles.cell} ${styles.cellStatus}`}>
                <Skeleton className={`${styles.skelPill} w-20`} />
              </div>
              <div className={`${styles.cell} ${styles.cellAction}`}>
                <Skeleton className={styles.skelAction} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      </section>
    </ShimmerGroup>
  );
}
