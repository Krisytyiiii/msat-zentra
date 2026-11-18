"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Columns3,
  FileText,
  History,
  Loader2,
  NotebookPen,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightCallout } from "@/components/ui/insight-callout";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { OcForm01PreviewDialog } from "@/components/ocform01/OcForm01PreviewDialog";
import { fetchOcForm01Detail } from "@/components/ocform01/ocform01";
import { GcForm03PreviewDialog } from "@/app/guidance/adm/components/GcForm03PreviewDialog";
import { buildGcForm03Data } from "@/services/guidance/gcform03.service";
import type { GcForm03Data } from "@/services/guidance/gcform03.types";
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import { formatManilaDateLong } from "@/services/coordinator/labels";
import type { HistoryTarget } from "../../components/CaseHistoryDialog";
import { historyTargetFor } from "../../components/CaseHistoryDialog";
import { CoordinatorEmptyCard } from "../../components/CoordinatorEmptyCard";
import { toSlug } from "@/lib/slug";
import { cn } from "@/lib/utils";
import styles from "./coordinator-enrolled-board.module.css";

interface CoordinatorEnrolledBoardProps {
  rows: AdmCaseRow[];
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  hasActiveFilters: boolean;
  completingId: string | null;
  query: string;
  onQueryChange: (v: string) => void;
  onRetry: () => void;
  onHistory: (target: HistoryTarget) => void;
  onComplete: (row: AdmCaseRow) => void;
}

type LaneKey = "not_released" | "in_progress" | "complete";
type LaneFilter = "all" | LaneKey;

interface Lane {
  key: LaneKey;
  title: string;
  tone: PillTone;
}

const LANES: Record<LaneKey, Lane> = {
  not_released: { key: "not_released", title: "Not released", tone: "neutral" },
  in_progress: { key: "in_progress", title: "In progress", tone: "blue" },
  complete: { key: "complete", title: "Complete", tone: "green" },
};

const LANE_ICONS: Record<LaneKey, React.ReactNode> = {
  not_released: <CircleDashed size={12} aria-hidden="true" />,
  in_progress: <Clock size={12} aria-hidden="true" />,
  complete: <CheckCircle2 size={12} aria-hidden="true" />,
};

/** Status is derived from module counts — the monitoring signal.
    A case the coordinator already completed always reads "Complete". */
function laneFor(row: AdmCaseRow): LaneKey {
  if (row.stage === "completion") return "complete";
  const hasData =
    typeof row.modulesSubmitted === "number" &&
    typeof row.modulesTotal === "number";
  if (!hasData) return "not_released";
  const total = row.modulesTotal ?? 0;
  const submitted = row.modulesSubmitted ?? 0;
  if (total === 0) return "not_released";
  return submitted >= total ? "complete" : "in_progress";
}

function moduleProgress(row: AdmCaseRow) {
  const hasData =
    typeof row.modulesSubmitted === "number" &&
    typeof row.modulesTotal === "number";
  const submitted = row.modulesSubmitted ?? 0;
  const total = row.modulesTotal ?? 0;
  const percent =
    hasData && total > 0
      ? Math.min(100, Math.round((submitted / total) * 100))
      : 0;
  const text = !hasData
    ? "Module progress syncing…"
    : total === 0
      ? "No modules released yet"
      : submitted >= total
        ? `All ${total} module${total === 1 ? "" : "s"} submitted`
        : `${submitted} of ${total} modules submitted`;
  return { submitted, total, percent, text, hasData };
}

/** Circular module-progress ring — the card's headline number. */
function ProgressRing({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const size = 58;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <svg
      className={styles.ring}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className={styles.ringTrack}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={styles.ringFill}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className={styles.ringText}
      >
        {percent}%
      </text>
    </svg>
  );
}

function LearnerCard({
  row,
  index,
  onHistory,
  onComplete,
  completing,
}: {
  row: AdmCaseRow;
  /** Card position — drives the entrance stagger. */
  index: number;
  onHistory: (target: HistoryTarget) => void;
  onComplete: (row: AdmCaseRow) => void;
  completing: boolean;
}) {
  const { submitted, total, percent, text } = moduleProgress(row);
  const approvedBy = row.approvedBy ?? "the Principal";
  const isCompleted = row.stage === "completion";
  const laneKey = laneFor(row);
  const lane = LANES[laneKey];
  // The coordinator may only complete a case once every module is submitted.
  const modulesReady = total > 0 && submitted >= total;

  // Pre-profile referrals have no ADM case yet, so they can't open a detail page.
  const router = useRouter();
  const canOpen = !row.id.startsWith("referral:");
  const openCase = React.useCallback(() => {
    if (!canOpen) return;
    router.push(`/coordinator/enrolled/${toSlug(row.student)}`);
  }, [canOpen, router, row.student]);

  const anecdotalRecordId = row.anecdotalRecordId ?? null;
  const [anecdotalPreviewId, setAnecdotalPreviewId] = React.useState<
    string | null
  >(null);
  const [gcOpen, setGcOpen] = React.useState(false);
  const [gcData, setGcData] = React.useState<GcForm03Data | null>(null);
  const [gcLoading, setGcLoading] = React.useState(false);

  // GCForm-03 is generated from the linked OCForm-01 report, so both icon
  // shortcuts depend on the case's anecdotal record.
  const openGcForm = React.useCallback(async () => {
    if (!anecdotalRecordId || gcLoading) return;
    setGcLoading(true);
    try {
      const report = await fetchOcForm01Detail(anecdotalRecordId).catch(
        () => null,
      );
      setGcData(
        buildGcForm03Data(
          {
            student: row.student,
            grade: row.grade,
            section: row.section ?? "",
            reason: "",
            referredBy: row.preparedBy,
            date: row.datePrepared ?? "",
          },
          report,
          "",
        ),
      );
      setGcOpen(true);
    } finally {
      setGcLoading(false);
    }
  }, [
    anecdotalRecordId,
    gcLoading,
    row.student,
    row.grade,
    row.section,
    row.preparedBy,
    row.datePrepared,
  ]);

  return (
    <article
      className={cn(styles.card, canOpen && styles.cardClickable)}
      style={{ animationDelay: `${120 + Math.min(index, 11) * 60}ms` }}
      onClick={canOpen ? openCase : undefined}
      onKeyDown={
        canOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openCase();
              }
            }
          : undefined
      }
      tabIndex={canOpen ? 0 : undefined}
      role={canOpen ? "link" : undefined}
      aria-label={
        canOpen ? `Open monitoring details for ${row.student}` : undefined
      }
      data-lane={laneKey}
    >
      <header className={styles.cardHead}>
        <span className={styles.avatar}>
          <StudentMascot
            name={row.student}
            seed={row.lrn}
            character={row.mascot ?? undefined}
            size={40}
          />
        </span>
        <span className={styles.identity}>
          <span className={styles.name} title={row.student}>
            {row.student}
          </span>
          <span className={styles.meta}>
            {row.grade}
            {row.section ? ` · ${row.section}` : ""}
          </span>
        </span>
        <Pill tone={lane.tone} label="Module status" className={styles.lanePill}>
          {LANE_ICONS[lane.key]}
          {lane.title}
        </Pill>
      </header>

      <div className={styles.cardBody}>
        <ProgressRing
          percent={percent}
          label={`${percent}% of modules submitted for ${row.student}`}
        />
        <div className={styles.numbers}>
          <span className={styles.progressText}>{text}</span>
          <span className={styles.progressHint}>
            <Pill tone="amber" label="LRN">
              {row.lrn}
            </Pill>
            <span className={styles.progressAux}>
              {row.approvalDate
                ? `Approved ${formatManilaDateLong(row.approvalDate)}`
                : `Approved by ${approvedBy}`}
            </span>
          </span>
          <span
            className={styles.track}
            role="progressbar"
            aria-label={`Modules submitted for ${row.student}`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={submitted}
            aria-valuetext={text}
          >
            <span
              className={styles.trackFill}
              style={{ width: `${percent}%` }}
            />
          </span>
        </div>
      </div>

      <footer
        className={styles.cardFooter}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <TooltipProvider delayDuration={100}>
          <button
            type="button"
            className={styles.openBtn}
            onClick={canOpen ? openCase : undefined}
            disabled={!canOpen}
            aria-label={`Open monitoring for ${row.student}`}
          >
            Monitoring
            <ChevronRight size={13} aria-hidden="true" />
          </button>

          <div className={styles.quickActions}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={styles.iconTrigger}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() =>
                      anecdotalRecordId &&
                      setAnecdotalPreviewId(anecdotalRecordId)
                    }
                    disabled={!anecdotalRecordId}
                    aria-label={`View anecdotal record for ${row.student}`}
                  >
                    <NotebookPen size={13} aria-hidden="true" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {anecdotalRecordId
                  ? "Anecdotal record (OCForm-01)"
                  : "No anecdotal record linked to this case"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className={styles.iconTrigger}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => void openGcForm()}
                    disabled={!anecdotalRecordId || gcLoading}
                    aria-label={`View GC Form 03 for ${row.student}`}
                    aria-busy={gcLoading || undefined}
                  >
                    {gcLoading ? (
                      <Loader2
                        size={13}
                        className={styles.spin}
                        aria-hidden="true"
                      />
                    ) : (
                      <FileText size={13} aria-hidden="true" />
                    )}
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {anecdotalRecordId
                  ? "GC Form 03 (referral form)"
                  : "No anecdotal record linked to this case"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className={styles.iconTrigger}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => onHistory(historyTargetFor(row))}
                    aria-label={`Track case for ${row.student}`}
                  >
                    <History size={13} aria-hidden="true" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Open the case timeline</TooltipContent>
            </Tooltip>

            {!isCompleted ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={styles.iconTrigger}>
                    <button
                      type="button"
                      className={cn(styles.iconBtn, styles.iconBtnAccent)}
                      onClick={() => onComplete(row)}
                      disabled={completing || !modulesReady}
                      aria-busy={completing || undefined}
                      aria-label={`Mark ${row.student} as completed`}
                    >
                      {completing ? (
                        <Loader2
                          size={13}
                          className={styles.spin}
                          aria-hidden="true"
                        />
                      ) : (
                        <CheckCircle2 size={13} aria-hidden="true" />
                      )}
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {modulesReady
                    ? "Complete this ADM case"
                    : "All released modules must be submitted first"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className={styles.doneChip} title="Case completed">
                <CheckCircle2 size={13} aria-hidden="true" />
                Done
              </span>
            )}
          </div>
        </TooltipProvider>

        <OcForm01PreviewDialog
          recordId={anecdotalPreviewId}
          onClose={() => setAnecdotalPreviewId(null)}
        />
        <GcForm03PreviewDialog
          open={gcOpen}
          data={gcData}
          confirming={false}
          onClose={() => setGcOpen(false)}
          onConfirm={() => setGcOpen(false)}
          viewOnly
        />
      </footer>
    </article>
  );
}

export function CoordinatorEnrolledBoard({
  rows,
  isPending,
  isError,
  isRefetching,
  hasActiveFilters,
  completingId,
  query,
  onQueryChange,
  onRetry,
  onHistory,
  onComplete,
}: CoordinatorEnrolledBoardProps) {
  const searchTerm = query.trim().toLowerCase();
  const [laneFilter, setLaneFilter] = React.useState<LaneFilter>("all");

  // Filter the loaded page instantly as the clerk types (same feel as the
  // referrals desk); the debounced server query then swaps in matches from the
  // rest of the desk.
  const searchedRows = React.useMemo(() => {
    if (searchTerm === "") return rows;
    return rows.filter((row) =>
      `${row.student} ${row.lrn} ${row.grade} ${row.section ?? ""} ${row.id}`
        .toLowerCase()
        .includes(searchTerm),
    );
  }, [rows, searchTerm]);

  const counts = React.useMemo(() => {
    const out: Record<LaneFilter, number> = {
      all: searchedRows.length,
      not_released: 0,
      in_progress: 0,
      complete: 0,
    };
    for (const row of searchedRows) out[laneFor(row)] += 1;
    return out;
  }, [searchedRows]);

  const visibleRows = React.useMemo(
    () =>
      laneFilter === "all"
        ? searchedRows
        : searchedRows.filter((row) => laneFor(row) === laneFilter),
    [searchedRows, laneFilter],
  );

  if (isPending) {
    return <CoordinatorEnrolledBoardSkeleton />;
  }

  if (isError) {
    return (
      <div className={styles.errorBlock} role="alert">
        <p className={styles.errorText}>
          We couldn&apos;t load the enrolled students. Please check your
          internet connection and try again.
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

  if (rows.length === 0 && !hasActiveFilters && searchTerm === "") {
    return (
      <CoordinatorEmptyCard
        icon={Columns3}
        title="No enrolled learners yet"
        hint="Approved cases appear here automatically once the Principal signs them."
        label="Enrolled ADM learners"
        centered
      />
    );
  }

  const filterTabs: { key: LaneFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "in_progress", label: LANES.in_progress.title },
    { key: "complete", label: LANES.complete.title },
    { key: "not_released", label: LANES.not_released.title },
  ];

  return (
    <section
      className={cn(styles.boardShell, styles.boardIn)}
      aria-label="Enrolled ADM learners board"
    >
      <div className={styles.boardHeader}>
        <span className={styles.boardTitle}>
          <span className={styles.boardIcon} aria-hidden="true">
            <Columns3 size={14} />
          </span>
          Monitoring roster
        </span>

        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter learners by monitoring status"
            options={filterTabs.map((tab) => ({
              value: tab.key,
              label: tab.label,
              count: counts[tab.key],
            }))}
            value={laneFilter}
            onChange={setLaneFilter}
          />
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search name, LRN, or case ID…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label="Search enrolled students"
            />
          </div>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div className={styles.emptyCallout}>
          <InsightCallout role="status">
            {searchTerm !== "" || hasActiveFilters
              ? "No enrolled learners match your search. Try a different name, LRN, or grade level."
              : "No learners in this view."}
          </InsightCallout>
        </div>
      ) : (
        <ul
          className={styles.grid}
          aria-label="Enrolled ADM learners"
          key={`${laneFilter}-${visibleRows.map((r) => r.id).join("|")}`}
        >
          {visibleRows.map((row, index) => (
            <li key={row.id} className={styles.gridItem}>
              <LearnerCard
                row={row}
                index={index}
                completing={completingId === row.id}
                onHistory={onHistory}
                onComplete={onComplete}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Card-shaped loading mirror for the page Suspense. */
export function CoordinatorEnrolledBoardSkeleton() {
  return (
    <section className={styles.boardShell} aria-label="Loading enrolled students">
      <div className={styles.boardHeader}>
        <span className={styles.boardTitle}>
          <span className={styles.boardIcon} aria-hidden="true">
            <Columns3 size={14} />
          </span>
          Monitoring roster
        </span>
      </div>
      <div className={styles.grid} aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.skelCard} aria-hidden="true">
            <div className={styles.skelHead}>
              <Skeleton className={styles.skelAvatar} />
              <div className={styles.skelLines}>
                <Skeleton className={styles.skelName} />
                <Skeleton className={styles.skelMeta} />
              </div>
            </div>
            <div className={styles.skelBody}>
              <Skeleton className={styles.skelRing} />
              <div className={styles.skelLines}>
                <Skeleton className={styles.skelText} />
                <Skeleton className={styles.skelTrack} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
