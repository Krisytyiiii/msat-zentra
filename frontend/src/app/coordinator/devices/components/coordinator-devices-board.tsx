"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Laptop,
  Loader2,
  Monitor,
  Plus,
  Search,
  Smartphone,
  Tablet,
  TabletSmartphone,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pill } from "@/components/ui/pill";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { stageLabel } from "@/services/coordinator/labels";
import type { AdmDeviceRow } from "@/services/coordinator/coordinator.types";
import { cn } from "@/lib/utils";
import styles from "./coordinator-devices-table.module.css";

export type DeviceFilter = "all" | "issued" | "returned";

/* Status tabs in the board header — same centered pill-tab pattern as the
   certifications and referrals desks. */
const STATUS_TABS: { value: DeviceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issued", label: "Issued" },
  { value: "returned", label: "Returned" },
];

/** Device silhouette for the shelf tile — the row reads as hardware at a
    glance instead of another table line. */
function DeviceGlyph({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t.includes("phone") || t.includes("mobile")) return <Smartphone />;
  if (t.includes("laptop") || t.includes("chromebook")) return <Laptop />;
  if (t.includes("desktop") || t.includes("monitor") || t.includes("pc"))
    return <Monitor />;
  if (t.includes("tablet") || t.includes("ipad")) return <Tablet />;
  return <TabletSmartphone />;
}

/* Hover/click asset card — every device field grouped into learner / device /
   timeline sections. Kept from the previous ledger, now a secondary detail
   view instead of the only way to read a row. */
function DeviceInfoBoard({ row }: { row: AdmDeviceRow }) {
  const issued = row.status === "issued";
  return (
    <div className={styles.infoCard}>
      <div className={styles.infoHead}>
        <StudentMascot
          name={row.student}
          seed={row.lrn}
          character={row.mascot ?? undefined}
          size={28}
        />
        <p className={styles.infoName} title={row.student}>
          {row.student}
        </p>
        <Pill
          tone={issued ? "amber" : "green"}
          label="Status"
          className="ml-auto"
        >
          {issued ? "Issued" : "Returned"}
        </Pill>
      </div>

      <div className={styles.infoBody}>
        <p className={styles.infoLabel}>Learner</p>
        <div className={styles.deviceChips}>
          <Pill tone="neutral" label="LRN" className="tabular-nums">
            LRN {row.lrn}
          </Pill>
          <Pill tone="neutral" label="Grade level">
            {row.grade}
          </Pill>
          <Pill
            tone={row.stage === "completion" ? "green" : "amber"}
            label="ADM stage"
            title={stageLabel(row.stage)}
          >
            {stageLabel(row.stage)}
          </Pill>
        </div>

        <p className={styles.infoLabel}>Device</p>
        <div className={styles.deviceChips}>
          <Pill tone="neutral" label="Device type">
            {row.deviceType}
          </Pill>
          <Pill tone="neutral" label="Serial number" className="tabular-nums">
            {row.deviceSerial}
          </Pill>
        </div>

        <p className={styles.infoLabel}>Timeline</p>
        <div className={styles.deviceChips}>
          <Pill tone="neutral" label="Issued" className="tabular-nums">
            <CalendarDays size={11} aria-hidden />
            Issued {row.issuedDate}
          </Pill>
          <Pill tone="neutral" label="Issued by">
            by {row.issuedBy}
          </Pill>
          {row.returnedDate ? (
            <Pill tone="neutral" label="Returned" className="tabular-nums">
              <Undo2 size={11} aria-hidden />
              Returned {row.returnedDate}
            </Pill>
          ) : null}
        </div>

        {row.conditionNotes ? (
          <>
            <p className={styles.infoLabel}>Condition</p>
            <p className={styles.infoNotePill}>{row.conditionNotes}</p>
          </>
        ) : null}
      </div>
    </div>
  );
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
  onClear: () => void;
  returningId?: string | null;
  /** Desk-wide counters (all pages), used by the shelf summary. */
  issuedCount?: number;
  returnedCount?: number;
  onRetry: () => void;
  onRecordReturn: (row: AdmDeviceRow) => void;
  onIssueDevice: () => void;
}

function DeviceSlip({
  row,
  index,
  returning,
  onRecordReturn,
}: {
  row: AdmDeviceRow;
  /** Row position — drives the entrance stagger. */
  index: number;
  returning: boolean;
  onRecordReturn: (row: AdmDeviceRow) => void;
}) {
  const issued = row.status === "issued";
  const overdue = issued && row.stage === "completion";
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [infoPinned, setInfoPinned] = React.useState(false);

  const handleInfoOpenChange = (next: boolean) => {
    if (!next && infoPinned) return;
    setInfoOpen(next);
  };

  const toggleInfo = () => {
    if (infoPinned) {
      setInfoPinned(false);
      setInfoOpen(false);
      return;
    }
    setInfoPinned(true);
    setInfoOpen(true);
  };

  return (
    <li
      className={cn(
        styles.slip,
        issued ? styles.slipIssued : styles.slipReturned,
        overdue && styles.slipOverdue,
      )}
      style={{ animationDelay: `${120 + Math.min(index, 11) * 45}ms` }}
      data-status={row.status}
    >
      <span className={styles.glyphTile} aria-hidden="true">
        <DeviceGlyph type={row.deviceType} />
        <span
          className={cn(
            styles.glyphDot,
            issued ? styles.glyphDotIssued : styles.glyphDotReturned,
          )}
        />
      </span>

      <div className={styles.slipMain}>
        <div className={styles.slipTop}>
          <span className={styles.deviceName} title={row.deviceType}>
            {row.deviceType}
          </span>
          <Pill label="Serial number" className="tabular-nums">
            {row.deviceSerial}
          </Pill>
          {overdue ? (
            <Pill tone="red" label="Return overdue">
              <TriangleAlert size={11} aria-hidden />
              Return overdue
            </Pill>
          ) : null}
        </div>

        <div className={styles.learnerLine}>
          <span className={styles.miniMascot}>
            <StudentMascot
              name={row.student}
              seed={row.lrn}
              character={row.mascot ?? undefined}
              size={22}
            />
          </span>
          <span className={styles.learnerName} title={row.student}>
            {row.student}
          </span>
          <Pill tone="neutral" label="LRN" className="tabular-nums">
            {row.lrn}
          </Pill>
          <Pill tone="neutral" label="Grade level">
            {row.grade || "—"}
          </Pill>
        </div>
      </div>

      <div className={styles.slipTimeline}>
        <span className={styles.timelineStep}>
          <span className={styles.timelineDot} aria-hidden="true" />
          <span className={styles.timelineText}>
            <span className={styles.timelineLabel}>Issued</span>
            <span className={styles.timelineValue}>{row.issuedDate}</span>
          </span>
        </span>
        <span className={styles.timelineStep}>
          <span
            className={cn(
              styles.timelineDot,
              !row.returnedDate && styles.timelineDotPending,
            )}
            aria-hidden="true"
          />
          <span className={styles.timelineText}>
            <span className={styles.timelineLabel}>Returned</span>
            <span
              className={cn(
                styles.timelineValue,
                !row.returnedDate && styles.timelineValuePending,
              )}
            >
              {row.returnedDate ?? "Not yet"}
            </span>
          </span>
        </span>
        <span className={styles.issuer}>Issued by {row.issuedBy}</span>
      </div>

      <div className={styles.slipSide}>
        <Pill tone={issued ? "amber" : "green"} label="Status">
          {issued ? (
            <CircleDashed size={11} aria-hidden />
          ) : (
            <CheckCircle2 size={11} aria-hidden />
          )}
          {issued ? "Issued" : "Returned"}
        </Pill>

        <div className={styles.actions}>
          <HoverCard
            open={infoOpen}
            onOpenChange={handleInfoOpenChange}
            openDelay={120}
            closeDelay={80}
          >
            <HoverCardTrigger asChild>
              <button
                type="button"
                className={styles.ctaSecondary}
                onClick={toggleInfo}
                aria-label={`View details of ${row.deviceSerial}`}
              >
                Details
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              align="end"
              side="top"
              className="w-80 p-0"
              onPointerDownOutside={() => {
                setInfoPinned(false);
                setInfoOpen(false);
              }}
            >
              <DeviceInfoBoard row={row} />
            </HoverCardContent>
          </HoverCard>

          {issued ? (
            <button
              type="button"
              className={styles.cta}
              disabled={returning}
              onClick={() => onRecordReturn(row)}
              aria-busy={returning || undefined}
              aria-label={`Record return of ${row.deviceSerial}`}
            >
              {returning ? (
                <Loader2 className={styles.spin} aria-hidden="true" />
              ) : (
                <ArrowRightLeft size={11} aria-hidden="true" />
              )}
              {returning ? "Recording…" : "Record return"}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Device shelf — one slip per issued learning device instead of a table/grid.
 * A document-like row reads top-to-bottom: hardware glyph, asset tag + learner,
 * the issue/return timeline, then status and actions. Search, status tabs and
 * the issue action share the board header; pagination sits under the board.
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
  onClear,
  returningId = null,
  issuedCount,
  returnedCount,
  onRetry,
  onRecordReturn,
  onIssueDevice,
}: CoordinatorDevicesBoardProps) {
  const searchTerm = query.trim().toLowerCase();

  // Filter the loaded page instantly as the clerk types (same feel as the
  // enrolled desk); the debounced server query then swaps in matches from the
  // rest of the ledger.
  const filteredRows = React.useMemo(() => {
    if (searchTerm === "") return rows;
    return rows.filter((row) =>
      `${row.student} ${row.lrn} ${row.deviceType} ${row.deviceSerial} ${row.grade}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [rows, searchTerm]);

  if (isPending) {
    return <CoordinatorDevicesBoardSkeleton />;
  }

  if (isError) {
    return (
      <div className={styles.errorBlock} role="alert">
        <p className={styles.errorText}>
          We couldn&apos;t load the device shelf. Please check your internet
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
      className={cn(styles.shelfShell, styles.boardIn)}
      aria-label="Learning devices"
    >
      <div className={styles.shelfHeader}>
        <span className={styles.shelfTitle}>
          <span className={styles.boardIcon} aria-hidden="true">
            <TabletSmartphone size={14} />
          </span>
          Device shelf
        </span>

        <FilterTabs
          label="Filter devices by status"
          options={STATUS_TABS.map((tab) => ({
            value: tab.value,
            label: tab.label,
          }))}
          value={filter}
          onChange={onFilterChange}
        />

        <div className={styles.shelfActions}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search serial, student, or LRN…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label="Search serial, student, or LRN"
            />
          </div>

          {filter !== "all" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClear}
            >
              Clear
            </Button>
          ) : null}

          <Button
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onIssueDevice}
          >
            <Plus className="size-3.5" aria-hidden />
            Issue device
          </Button>
        </div>
      </div>

      {typeof issuedCount === "number" && typeof returnedCount === "number" ? (
        <div className={styles.stats} aria-label="Device summary">
          <span className={styles.stat}>
            <span className={styles.statValue}>{issuedCount}</span>
            <span className={styles.statLabel}>Out with learners</span>
          </span>
          <span className={styles.statDivider} aria-hidden="true" />
          <span className={styles.stat}>
            <span className={styles.statValue}>{returnedCount}</span>
            <span className={styles.statLabel}>Returned</span>
          </span>
          <span className={styles.statDivider} aria-hidden="true" />
          <span className={cn(styles.stat, styles.statMuted)}>
            <span className={styles.statValue}>
              {issuedCount + returnedCount}
            </span>
            <span className={styles.statLabel}>Total tracked</span>
          </span>
        </div>
      ) : null}

      {filteredRows.length === 0 ? (
        <div className={styles.emptyCallout}>
          <InsightCallout role="status">
            {searchTerm !== ""
              ? "No devices match your search. Try a different serial, learner, or LRN."
              : "No devices match the current filters. Try a different status."}
          </InsightCallout>
        </div>
      ) : (
        <ul
          className={styles.shelf}
          aria-label="Device shelf"
          key={filteredRows.map((r) => r.id).join("|")}
        >
          {filteredRows.map((row, index) => (
            <DeviceSlip
              key={row.id}
              row={row}
              index={index}
              returning={returningId === row.id}
              onRecordReturn={onRecordReturn}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Slip-shaped loading mirror for the page Suspense. */
export function CoordinatorDevicesBoardSkeleton() {
  return (
    <section className={styles.shelfShell} aria-label="Loading devices">
      <div className={styles.shelfHeader}>
        <span className={styles.shelfTitle}>
          <span className={styles.boardIcon} aria-hidden="true">
            <TabletSmartphone size={14} />
          </span>
          Device shelf
        </span>
      </div>
      <div className={styles.shelf} aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.skelSlip} aria-hidden="true">
            <Skeleton className={styles.skelTile} />
            <div className={styles.skelMain}>
              <Skeleton className={styles.skelName} />
              <Skeleton className={styles.skelMeta} />
            </div>
            <Skeleton className={styles.skelDates} />
            <Skeleton className={styles.skelCta} />
          </div>
        ))}
      </div>
    </section>
  );
}
