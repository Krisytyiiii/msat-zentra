"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  FileText,
  Flag,
  Hourglass,
  Send,
} from "lucide-react";
import { NurseEmptyState } from "../../components/NurseEmptyCard";
import { Pill, type PillTone } from "@/components/ui/pill";
import { anecdotalCategoryPillClass } from "@/lib/labels/anecdotal";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { ZentraPaginationSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import { SearchField } from "@/components/ui/search-field";
import { InsightCallout } from "@/components/ui/insight-callout";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { useNowMs } from "../../overview/components/use-now-ms";
import { NurseStartHandlingDialog } from "../../overview/components/NurseStartHandlingDialog";
import { ScheduleSessionDialog } from "../../referrals/components/NurseSessionDialogs";
import {
  activeSessionOf,
  caseStage,
  latestActionOf,
} from "../../referrals/components/nurse-referrals-format";
import { deriveActionStatus } from "@/services/nurse/labels";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import { Pagination } from "@/components/shared/pagination";
import type {
  NurseAlertItem,
  NurseQueueRow,
  NurseRiskLevel,
} from "@/services/nurse/nurse.types";
import styles from "./nurse-alerts.module.css";

/* Rectangle pills (rounded-md) shared by the kanban rows — same values as the
   guidance alerts board, so both desks read identically. */
const PILL_BASE =
  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";
const PILL_SECONDARY = "bg-secondary text-secondary-foreground";

/** Server-side case-type filter — matches the API's ?track= param. `all`
    drops the param so the desk returns both ADM and clinic cases. */
export type TypeTrack = "all" | "adm" | "clinic";

/**
 * Search + type-tab row predicate. Exported because the desk page also uses it
 * to decide when the board will render its no-match callout: the page must add
 * `pageFit` on the same render the callout appears, otherwise the message first
 * lands inline and hops to the page center once the debounced server query
 * comes back empty.
 */
export function matchesAlertFilters(
  alert: NurseAlertItem,
  query: string,
  track: TypeTrack
) {
  if (track !== "all" && alert.row.type.toLowerCase() !== track) return false;
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return `${alert.row.student} ${alert.row.lrn} ${alert.row.section} ${alert.row.reason} ${alert.row.category}`
    .toLowerCase()
    .includes(q);
}

export function statusVariant(
  status: string
): "amber" | "blue" | "green" | "red" | "secondary" | "outline" {
  switch (status) {
    case "pending":
      return "amber";
    case "in_progress":
      return "blue";
    case "follow_up":
      return "blue";
    case "info_requested":
      return "outline";
    case "escalated":
      return "red";
    case "resolved":
      return "green";
    case "dismissed":
      return "red";
    default:
      return "outline";
  }
}

export const ACTION_STATUS_VARIANT: Record<
  string,
  "amber" | "blue" | "green" | "red" | "secondary" | "outline"
> = {
  endorsed: "green",
  done: "green",
  done_session: "green",
  booked: "blue",
  followup: "blue",
  rejected: "red",
  needs_review: "amber",
  escalated: "red",
};

export function RiskBadge({
  level,
  loading = false,
}: {
  level: NurseRiskLevel | undefined;
  loading?: boolean;
}) {
  if (loading && !level)
    return (
      <span className={styles.noRisk} role="status" aria-label="Loading risk level">
        …
      </span>
    );
  if (!level) return <span className={styles.noRisk}>—</span>;

  const tone = level === "High" ? "red" : level === "Moderate" ? "amber" : "green";
  return (
    <Pill tone={tone} label="Risk level">
      {level}
    </Pill>
  );
}

export type ActionIcon = React.ComponentType<{ className?: string }>;

export function actionIconFor(label: string): ActionIcon {
  const text = label.toLowerCase();
  if (text.includes("booked")) return CalendarPlus;
  if (text.includes("moved")) return CalendarClock;
  if (text.includes("done") || text.includes("resolv")) return CircleCheck;
  if (text.includes("cancel") || text.includes("reject")) return CircleX;
  if (text.includes("documentation") || text.includes("filed")) return FileText;
  if (text.includes("follow")) return Flag;
  if (text.includes("accept")) return Check;
  if (
    text.includes("escalat") ||
    text.includes("sent") ||
    text.includes("endors") ||
    text.includes("ready") ||
    text.includes("forward")
  )
    return Send;
  if (text.includes("review") || text.includes("needs")) return Eye;
  if (text.includes("waiting") || text.includes("information")) return Hourglass;
  return Bell;
}

/** Renders the latest-action glyph from its label. Branches inline (like the
    guidance board's ActionGlyph) so no component is created during render. */
export function ActionGlyph({ label, className }: { label: string; className?: string }) {
  const text = label.toLowerCase();
  const props = { className, "aria-hidden": true } as const;
  if (text.includes("booked")) return <CalendarPlus {...props} />;
  if (text.includes("moved")) return <CalendarClock {...props} />;
  if (text.includes("done") || text.includes("resolv")) return <CircleCheck {...props} />;
  if (text.includes("cancel") || text.includes("reject")) return <CircleX {...props} />;
  if (text.includes("documentation") || text.includes("filed") || text.includes("note"))
    return <FileText {...props} />;
  if (text.includes("follow")) return <Flag {...props} />;
  if (text.includes("accept")) return <Check {...props} />;
  if (
    text.includes("escalat") ||
    text.includes("sent") ||
    text.includes("endors") ||
    text.includes("ready") ||
    text.includes("forward") ||
    text.includes("specialist") ||
    text.includes("adm process") ||
    text.includes("intervention")
  )
    return <Send {...props} />;
  if (text.includes("review") || text.includes("needs")) return <Eye {...props} />;
  if (text.includes("waiting") || text.includes("information")) return <Hourglass {...props} />;
  return <Bell {...props} />;
}

/** Kanban-shaped loading placeholder — the board shell with its rows as
    shimmer bars, mirroring the loaded board's header (tabs left, search right),
    column head, row grid and pager, so the load and the loaded page read as one
    surface with no layout shift. */
export function NurseAlertsBoardSkeleton() {
  return (
    <ShimmerGroup>
      <KanbanBoard
        className={styles.boardSurface}
        ariaLabel="Loading referred cases"
        headerDivider={false}
        headerToolbar={
          <div
            className="flex w-full flex-wrap items-center justify-between gap-2"
            aria-hidden="true"
          >
            <div className={`${styles.filterRow} ${styles.filterRowScroll}`}>
              <Skeleton className={styles.skelTab} />
              <Skeleton className={styles.skelTab} />
              <Skeleton className={styles.skelTab} />
            </div>
            <Skeleton className={styles.skelSearch} />
          </div>
        }
        footer={<ZentraPaginationSkeleton />}
      >
        <div className={styles.listPanel}>
          <div className={styles.listHead} aria-hidden="true">
            <Skeleton className={styles.skelHeadLabel} />
            <Skeleton className={styles.skelHeadLabel} />
            <Skeleton className={styles.skelHeadLabel} />
            <Skeleton className={styles.skelHeadLabel} />
            <Skeleton className={styles.skelHeadLabel} />
            <Skeleton className={`${styles.skelHeadLabel} ${styles.colRisk}`} />
            <Skeleton className={`${styles.skelHeadLabel} ${styles.colSessions}`} />
            <Skeleton className={`${styles.skelHeadLabel} ${styles.colReferred}`} />
            <Skeleton className={styles.skelHeadLabel} />
          </div>
          <ul className={styles.caseList}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className={styles.skeletonRow} aria-hidden="true">
                <div className={`${styles.cell} ${styles.cellType}`}>
                  <Skeleton className={styles.skelTypePill} />
                </div>
                <div className={`${styles.cell} ${styles.cellLearner}`}>
                  <Skeleton className={styles.skelAvatar} />
                  <div className={styles.caseIdentity}>
                    <Skeleton className={styles.skelCaseName} />
                    <div className={styles.cellSub}>
                      <Skeleton className={styles.skelPillShort} />
                    </div>
                  </div>
                </div>
                <div className={`${styles.cell} ${styles.cellStack} ${styles.colGrade}`}>
                  <Skeleton className={styles.skelLine} />
                  <Skeleton className={styles.skelLineShort} />
                </div>
                <div className={`${styles.cell} ${styles.colConcern}`}>
                  <Skeleton className={styles.skelConcernPill} />
                </div>
                <div className={`${styles.cell} ${styles.cellStatus}`}>
                  <Skeleton className={styles.skelPill} />
                </div>
                <div className={`${styles.cell} ${styles.colRisk}`}>
                  <Skeleton className={styles.skelPillShort} />
                </div>
                <div className={`${styles.cell} ${styles.cellStack} ${styles.colSessions}`}>
                  <Skeleton className={styles.skelLineShort} />
                  <Skeleton className={styles.skelLineShort} />
                </div>
                <div className={`${styles.cell} ${styles.colReferred}`}>
                  <Skeleton className={styles.skelPillShort} />
                </div>
                <div className={styles.caseActions}>
                  <Skeleton className={styles.skelBtnSm} />
                  <Skeleton className={styles.skelBtnSm} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </KanbanBoard>
    </ShimmerGroup>
  );
}

/** Colour code for the latest-action glyph — same semantic palette as the
    guidance alerts board's `actionTone` (red = escalated/sent, green = done,
    blue = booked, amber = waiting/follow-up). */
function latestActionTone(label: string): string {
  const text = label.toLowerCase();
  if (text.includes("cancel") || text.includes("reject") || text.includes("escalat") || text.includes("sent"))
    return "text-red-600 dark:text-red-400";
  if (text.includes("done") || text.includes("resolv") || text.includes("accept") || text.includes("ready"))
    return "text-green-600 dark:text-green-400";
  if (text.includes("booked")) return "text-blue-600 dark:text-blue-400";
  if (
    text.includes("waiting") ||
    text.includes("information") ||
    text.includes("follow") ||
    text.includes("moved") ||
    text.includes("review") ||
    text.includes("needs")
  )
    return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

/** Track lead pill — ADM (blue) or Clinic (amber), the row's first column. */
function RowTypeLabel({ type }: { type: string }) {
  const adm = type === "ADM";
  return (
    <span
      className={`${styles.caseTypePill} ${
        adm
          ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      }`}
      aria-label="Case type"
    >
      {adm ? "ADM" : "Clinic"}
    </span>
  );
}

/** Pill tone for the derived action status (same palette as the split pill). */
function statusPillTone(key: string): PillTone {
  switch (key) {
    case "endorsed":
    case "done":
    case "done_session":
      return "green";
    case "booked":
    case "followup":
      return "blue";
    case "rejected":
    case "escalated":
    case "cancelled":
      return "red";
    case "needs_review":
      return "amber";
    default:
      return "neutral";
  }
}

/**
 * Clinic booking control — the nurse equivalent of the guidance board's
 * "Book session" button. Pending/escalated cases open the review overlay
 * (accept + optional first session); an already-handled case with no live
 * booking opens the plain schedule dialog. A live booking is already surfaced
 * by the row's status pill, so no extra control is shown (guidance parity).
 */
function ClinicBookingControl({
  row,
  onChanged,
}: {
  row: NurseQueueRow;
  onChanged: () => void;
}) {
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const stage = caseStage(row);
  const closed = stage.key === "done" || stage.key === "cancelled" || stage.key === "reject";
  if (row.type === "ADM" || closed) return null;

  // Guidance drops the booking control once a session is scheduled — the
  // status pill already says "Booked session".
  if (activeSessionOf(row.sessions)) return null;

  const needsReview = row.status === "pending" || row.status === "escalated";
  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="default"
        className="h-6 shrink-0 gap-1 px-2 text-[12px] font-semibold"
        onClick={(event) => {
          event.stopPropagation();
          if (needsReview) setReviewOpen(true);
          else setScheduleOpen(true);
        }}
        aria-label={`Book a session for ${row.student}`}
      >
        <CalendarPlus size={13} aria-hidden />
        Book session
      </Button>
      {needsReview ? (
        <NurseStartHandlingDialog
          row={row}
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          onChanged={onChanged}
        />
      ) : (
        <ScheduleSessionDialog
          row={row}
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

/** One case line in the desk's data list: case type, learner identity,
    grade/section, concern, status, risk, session tally, referred time and the
    latest-action + booking controls. */
function NurseAlertRow({
  alert,
  index,
  riskLevel,
  riskLoading,
  nowMs,
  onChanged,
}: {
  alert: NurseAlertItem;
  index: number;
  riskLevel: NurseRiskLevel | undefined;
  riskLoading: boolean;
  nowMs: number;
  onChanged: () => void;
}) {
  const router = useRouter();
  const row = alert.row;
  const status = deriveActionStatus(
    row.type,
    row.status,
    row.sessions,
    row.dismissedByRole,
  );
  const latest = latestActionOf(row, alert);
  const doneCount = row.sessions.filter((s) => s.status === "completed").length;
  const bookedCount = row.sessions.filter((s) => s.status === "scheduled").length;
  const referredMs = msSinceDate(row.referredAt, nowMs);
  const homeBase =
    row.type === "ADM" ? "/nurse/referrals/adm" : "/nurse/referrals/clinic";
  const seeMoreHref = `${homeBase}?highlight=${row.id}`;

  const open = () => router.push(seeMoreHref);

  return (
    <li
      className={`${styles.caseRow} ${styles.caseRowInteractive}`}
      style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
      tabIndex={0}
      aria-label={`Open case details for ${row.student}`}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
    >
      <div className={`${styles.cell} ${styles.cellType}`}>
        <RowTypeLabel type={row.type} />
      </div>

      <div className={`${styles.cell} ${styles.cellLearner}`}>
        <StudentMascot
          name={row.student}
          seed={row.lrn}
          character={row.mascot ?? undefined}
          size={32}
        />
        <div className={styles.caseIdentity}>
          <p className={styles.studentName}>{row.student}</p>
          <p className={styles.cellSub}>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Pill className="tabular-nums" tabIndex={0} aria-label="LRN">
                    {row.lrn}
                  </Pill>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  <span className="font-medium">LRN</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.cellStack} ${styles.colGrade}`}>
        <span className={styles.cellValue}>{row.grade}</span>
        <span className={styles.cellMuted}>{row.section}</span>
      </div>

      <div className={`${styles.cell} ${styles.cellStack} ${styles.colConcern}`}>
        <span
          className={`${styles.concernPill} ${
            anecdotalCategoryPillClass(row.category) ?? ""
          }`}
          title={row.category}
        >
          {row.category}
        </span>
      </div>

      <div className={`${styles.cell} ${styles.cellStatus}`}>
        <Pill tone={statusPillTone(status.key)} label="Status">
          {status.label}
        </Pill>
      </div>

      <div className={`${styles.cell} ${styles.colRisk}`}>
        <RiskBadge level={riskLevel} loading={riskLoading} />
      </div>

      <div className={`${styles.cell} ${styles.cellStack} ${styles.colSessions}`}>
        <span className={styles.cellValue}>{doneCount} done</span>
        <span className={styles.cellMuted}>{bookedCount} booked</span>
      </div>

      <div className={`${styles.cell} ${styles.colReferred}`}>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`${PILL_BASE} ${PILL_SECONDARY} tabular-nums`}
                tabIndex={0}
                aria-label={
                  referredMs === null
                    ? "Referred time unknown"
                    : `Referred ${formatElapsedShort(referredMs)} ago`
                }
              >
                <Clock size={11} aria-hidden />
                {referredMs === null ? "—" : `${formatElapsedShort(referredMs)} ago`}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              <span className="font-medium">Referred at</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div
        className={styles.caseActions}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-6 min-w-0 max-w-full gap-1 px-2 text-[12px] font-semibold"
          onClick={open}
          title={latest.label}
          aria-label={`${latest.label} — open case for ${row.student}`}
        >
          <ActionGlyph
            label={latest.label}
            className={`${styles.actionIcon} ${latestActionTone(latest.label)}`}
          />
          <span className="truncate">{latest.label}</span>
        </Button>
        <ClinicBookingControl row={row} onChanged={onChanged} />
      </div>
    </li>
  );
}

export function NurseAlertsBoard({
  alerts,
  riskByStudent,
  riskLoading = false,
  onChanged,
  query: controlledQuery,
  onQueryChange,
  track,
  onTrackChange,
  page,
  total: totalProp,
  onPageChange,
  serverPaged = false,
}: {
  alerts: NurseAlertItem[];
  riskByStudent: Record<string, NurseRiskLevel>;
  riskLoading?: boolean;
  onChanged: () => void;

  query?: string;
  onQueryChange?: (v: string) => void;

  track: TypeTrack;
  onTrackChange: (track: TypeTrack) => void;

  page?: number;
  total?: number;
  unfilteredTotal?: number;
  onPageChange?: (p: number) => void;
  serverPaged?: boolean;
}) {
  const [internalQuery, setInternalQuery] = React.useState("");
  const nowMs = useNowMs();
  const query = controlledQuery ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;

  const filtered = React.useMemo(() => {
    // Both the type tabs and the search narrow the rows already loaded — no
    // refetch, no URL, so switching is instant. The debounced server query
    // then swaps in matches from the rest of the desk.
    return alerts.filter((a) => matchesAlertFilters(a, query, track));
  }, [alerts, query, track]);

  const total = serverPaged ? (totalProp ?? filtered.length) : filtered.length;
  const hasActiveFilters = query.trim() !== "" || track !== "all";
  const emptyFiltered = (alerts.length === 0 || filtered.length === 0) && hasActiveFilters;
  const isEmpty = alerts.length === 0 || filtered.length === 0;

  return (
    <KanbanBoard
      sectionClassName={isEmpty ? styles.emptyFill : undefined}
      className={`${styles.boardSurface}${isEmpty ? ` ${styles.emptyFill}` : ""}`}
      ariaLabel="Referred cases"
      headerDivider={false}
      headerToolbar={
        /* Type tabs on the left, search on the right — one full-width row. */
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className={`${styles.filterRow} ${styles.filterRowScroll}`}>
            <FilterTabs
              label="Filter cases by desk"
              variant="tags"
              value={track}
              onChange={onTrackChange}
              options={[
                { value: "all", label: "All", tone: "neutral" },
                { value: "adm", label: "ADM", tone: "blue" },
                { value: "clinic", label: "Clinic", tone: "amber" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SearchField
              className="w-60"
              placeholder="Search cases..."
              value={query}
              onChange={setQuery}
              aria-label="Search referred cases"
            />
          </div>
        </div>
      }
      footer={
        <Pagination
          currentPage={page ?? 1}
          totalItems={serverPaged ? total : filtered.length}
          onPageChange={(p) => onPageChange?.(p)}
        />
      }
    >
      {alerts.length > 0 && filtered.length > 0 ? (
        <div className={styles.listPanel}>
          <div className={styles.listHead} aria-hidden="true">
            <span>Case</span>
            <span>Learner</span>
            <span className={styles.colGrade}>Grade &amp; section</span>
            <span className={`${styles.colConcern}`}>Concern</span>
            <span>Status</span>
            <span className={styles.colRisk}>Risk</span>
            <span className={styles.colSessions}>Sessions</span>
            <span className={styles.colReferred}>Referred</span>
            <span className={styles.headActions}>Actions</span>
          </div>
          <ul className={styles.caseList}>
            {filtered.map((alert, i) => (
              <NurseAlertRow
                key={alert.key}
                alert={alert}
                index={i}
                riskLevel={
                  alert.studentId ? riskByStudent[alert.studentId] : undefined
                }
                riskLoading={riskLoading}
                nowMs={nowMs}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </div>
      ) : emptyFiltered ? (
        <div className={styles.emptyCenter}>
          <InsightCallout role="status" className="w-full max-w-xl text-left">
            {(query ?? "").trim() !== "" ? (
              <>
                <strong>No cases match your search.</strong> Try a different
                name, LRN, or category — or clear the search to see every
                referred case.
              </>
            ) : (
              <>
                <strong>No cases match the selected filter.</strong> Pick a
                different filter above the board, or show every case.
              </>
            )}
          </InsightCallout>
        </div>
      ) : (
        <NurseEmptyState
          icon={BellRing}
          title="No referred cases"
          hint="No referred cases — nothing needs your attention right now."
        />
      )}
    </KanbanBoard>
  );
}
