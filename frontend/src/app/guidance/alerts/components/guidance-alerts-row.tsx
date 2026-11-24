"use client";
import * as React from "react";
import {
  Bell,
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
import { Pill, type PillTone } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { anecdotalCategoryPillClass } from "@/lib/labels/anecdotal";
import type { GuidanceRiskLevel } from "@/services/guidance/guidance.types";
import type { AtRiskStudentItem } from "@/services/guidance/interventions.types";
import { rowStatusLabel } from "../../referrals/components/guidance-referrals-format";
import { GuidanceBookedSessionButton } from "./GuidanceAlertsRowActions";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import { pipelineStatus } from "../../interventions/components/intervention-row-helpers";
import { referralStatusVariant, rowLatest, type GuidanceAlertRow } from "./guidance-alerts-helpers";
import styles from "./guidance-alerts-table.module.css";

/* Rectangle pills (rounded-md) shared by the kanban rows — same values as the
   nurse alerts board, so both desks read identically. */
const PILL_BASE =
  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap";
const PILL_SECONDARY = "bg-secondary text-secondary-foreground";

export function RiskBadge({ level }: { level: GuidanceRiskLevel | undefined }) {
  if (!level) return <span className={styles.noRisk}>—</span>;
  const tone: PillTone =
    level === "High" ? "red" : level === "Moderate" ? "amber" : "green";
  return (
    <Pill tone={tone} label="Risk level">
      {level}
    </Pill>
  );
}

/** Row type lead — the Case column's rectangle pill, blue for ADM/Counseling,
    amber for Intervention (same recipe as the nurse board's ADM | Clinic). */
function RowTypeLabel({ type }: { type: "ADM" | "Counseling" | "Intervention" }) {
  const admLike = type === "ADM" || type === "Counseling";
  return (
    <span
      className={`${styles.caseTypePill} ${
        admLike
          ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      }`}
      aria-label="Case type"
      title={`Case type: ${type}`}
    >
      {type}
    </span>
  );
}

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

/**
 * Colour code for the latest-action glyph — same semantic palette as the nurse
 * alerts board (red = escalated/sent, green = done, blue = booked, amber =
 * waiting/follow-up).
 */
function actionTone(label: string): string {
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

/** Referral status variant → Pill tone (guidance referrals palette). */
function statusPillTone(
  variant: string,
): PillTone {
  switch (variant) {
    case "success":
      return "green";
    case "default":
      return "blue";
    case "amber":
      return "amber";
    case "destructive":
      return "red";
    case "secondary":
    case "outline":
    default:
      return "neutral";
  }
}

/** Pipeline status variant (interventions desk) → Pill tone. */
function pipelinePillTone(variant: string): PillTone {
  switch (variant) {
    case "green":
    case "success":
      return "green";
    case "default":
      return "blue";
    case "warning":
    case "amber":
      return "amber";
    case "destructive":
      return "red";
    case "secondary":
    case "outline":
    default:
      return "neutral";
  }
}

/** Concern chip for an auto-detected intervention — its active risk factors. */
function factorConcern(item: AtRiskStudentItem): { label: string; title: string } {
  const labels: string[] = [];
  if (item.factors.academic) labels.push("Academic");
  if (item.factors.attendance) labels.push("Attendance");
  if (item.factors.behavioral) labels.push("Behavioral");
  if (labels.length === 0) return { label: "Intervention", title: "Intervention" };
  return { label: labels[0], title: labels.join(" · ") };
}

/** Grade & section cell — two muted lines, same as the nurse board. */
function GradeSectionCell({ grade, section }: { grade: string; section: string }) {
  return (
    <div className={`${styles.cell} ${styles.cellStack} ${styles.colGrade}`}>
      <span className={styles.cellValue}>{grade || "—"}</span>
      <span className={styles.cellMuted}>{section || "—"}</span>
    </div>
  );
}

/** Concern cell — tinted category chip. */
function ConcernCell({ label, title }: { label: string; title: string }) {
  return (
    <div className={`${styles.cell} ${styles.colConcern}`}>
      <span
        className={`${styles.concernPill} ${anecdotalCategoryPillClass(label) ?? ""}`}
        title={title}
      >
        {label}
      </span>
    </div>
  );
}

/** Sessions cell — done / booked tally. */
function SessionsCell({ done, booked }: { done: number; booked: number }) {
  return (
    <div className={`${styles.cell} ${styles.cellStack} ${styles.colSessions}`}>
      <span className={styles.cellValue}>{done} done</span>
      <span className={styles.cellMuted}>{booked} booked</span>
    </div>
  );
}

/** Referred / detected cell — elapsed pill, right before the actions. */
function ElapsedCell({
  since,
  label,
}: {
  since: number | null;
  label: string;
}) {
  return (
    <div className={`${styles.cell} ${styles.colReferred}`}>
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`${PILL_BASE} ${PILL_SECONDARY} tabular-nums`}
              tabIndex={0}
              aria-label={
                since === null
                  ? `${label} time unknown`
                  : `${label} ${formatElapsedShort(since)} ago`
              }
            >
              <Clock size={11} aria-hidden />
              {since === null ? "—" : `${formatElapsedShort(since)} ago`}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            <span className="font-medium">{label} at</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/** Latest-action control + booking button, same shape as the nurse board.
    `latestLabel: null` hides the action button (an auto-detected case with no
    session has no action to report). */
function RowActions({
  latestLabel,
  children,
  onOpen,
}: {
  latestLabel: string | null;
  children?: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <div
      className={styles.caseActions}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {latestLabel ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-6 min-w-0 max-w-full gap-1 px-2 text-[12px] font-semibold"
          onClick={onOpen}
          title={latestLabel}
          aria-label={`${latestLabel} — open case`}
        >
          <ActionGlyph
            label={latestLabel}
            className={`${styles.actionIcon} ${actionTone(latestLabel)}`}
          />
          <span className="truncate">{latestLabel}</span>
        </Button>
      ) : null}
      {children}
    </div>
  );
}

/**
 * One case line on the guidance desk: case type, learner identity, grade &
 * section, concern, status, risk, session tally, referred time and the
 * latest-action + booking controls — the same nine-column data list as
 * /nurse/alerts.
 */
export function CaseKanbanRow({
  row,
  index = 0,
  riskLevel,
  now,
  onOpen,
  onBook,
}: {
  row: GuidanceAlertRow;
  index?: number;
  riskLevel: GuidanceRiskLevel | undefined;
  now: number;
  onOpen: () => void;
  onBook?: () => void;
}) {
  const latest = rowLatest(row);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  const interactiveProps = {
    className: `${styles.caseRow} ${styles.caseRowInteractive}`,
    style: { animationDelay: `${450 + Math.min(index, 11) * 140}ms` },
    onClick: onOpen,
    onKeyDown: handleKeyDown,
    tabIndex: 0,
  } as const;

  if (row.kind === "intervention") {
    const item = row.item;
    const iv = item.intervention;
    const detectedRaw = item.detectedAt || iv?.createdAt || "";
    const detectedMs = detectedRaw ? msSinceDate(detectedRaw, now) : null;
    const outcome = iv?.outcomeStatus ?? "ongoing";
    const doneCount = iv?.completedSessions ?? 0;
    const scheduledCount =
      iv?.sessions.filter((s) => s.status === "scheduled").length ?? 0;
    // Same pipeline labels as the Interventions desk, so an auto-flagged case
    // with no booked session reads "No action yet" instead of "Ongoing".
    const pipeline = pipelineStatus(item, iv, scheduledCount, doneCount);
    const concern = factorConcern(item);
    return (
      <li {...interactiveProps} aria-label={`Open case details for ${item.student}`}>
        <div className={`${styles.cell} ${styles.cellType}`}>
          <RowTypeLabel type="Intervention" />
        </div>

        <div className={`${styles.cell} ${styles.cellLearner}`}>
          <StudentMascot
            name={item.student}
            seed={item.lrn}
            character={item.mascot ?? undefined}
            size={32}
          />
          <div className={styles.caseIdentity}>
            <p className={styles.studentName}>{item.student}</p>
            <p className={styles.cellSub}>
              <Pill className="tabular-nums" label="LRN">
                {item.lrn}
              </Pill>
            </p>
          </div>
        </div>

        <GradeSectionCell grade={item.grade} section={item.section} />
        <ConcernCell label={concern.label} title={concern.title} />

        <div className={`${styles.cell} ${styles.cellStatus}`}>
          <Pill tone={pipelinePillTone(pipeline.variant)} label="Status">
            {pipeline.label}
          </Pill>
        </div>

        <div className={`${styles.cell} ${styles.colRisk}`}>
          <RiskBadge level={riskLevel} />
        </div>

        <SessionsCell done={doneCount} booked={scheduledCount} />
        <ElapsedCell since={detectedMs} label="Detected" />

        <RowActions
          latestLabel={
            latest.label === "Intervention opened" || latest.label === "Just detected"
              ? null
              : latest.label
          }
          onOpen={onOpen}
        >
          {doneCount > 0 && outcome === "ongoing" ? (
            <span className={`${PILL_BASE} bg-muted text-muted-foreground tabular-nums`}>
              {doneCount} session{doneCount === 1 ? "" : "s"} done
            </span>
          ) : null}
          <GuidanceBookedSessionButton item={item} onBeforeOpen={onBook} />
        </RowActions>
      </li>
    );
  }

  const r = row.referral;
  const doneCount = r.sessions.filter((s) => s.status === "completed").length;
  const bookedCount = r.sessions.filter((s) => s.status === "scheduled").length;
  const allDone = doneCount > 0 && bookedCount === 0;
  const statusText = allDone ? "Done" : rowStatusLabel(r.type, r.status, r);
  const statusVar = allDone ? "success" : referralStatusVariant(r.type, r.status);
  // The timestamp column reports when the case entered the desk (referral
  // filing time), not the anecdote's incident date — that stays on the record.
  const referredRaw = r.referredAt || r.date || "";
  const referredMs = referredRaw ? msSinceDate(referredRaw, now) : null;
  return (
    <li {...interactiveProps} aria-label={`Open case details for ${r.student}`}>
      <div className={`${styles.cell} ${styles.cellType}`}>
        <RowTypeLabel type={r.type === "ADM" ? "ADM" : "Counseling"} />
      </div>

      <div className={`${styles.cell} ${styles.cellLearner}`}>
        <StudentMascot
          name={r.student}
          seed={r.lrn}
          character={r.mascot ?? undefined}
          size={32}
        />
        <div className={styles.caseIdentity}>
          <p className={styles.studentName}>{r.student}</p>
          <p className={styles.cellSub}>
            <Pill className="tabular-nums" label="LRN">
              {r.lrn}
            </Pill>
          </p>
        </div>
      </div>

      <GradeSectionCell grade={r.grade} section={r.section} />
      <ConcernCell label={r.category} title={r.category} />

      <div className={`${styles.cell} ${styles.cellStatus}`}>
        <Pill tone={statusPillTone(statusVar)} label="Status">
          {statusText}
        </Pill>
      </div>

      <div className={`${styles.cell} ${styles.colRisk}`}>
        <RiskBadge level={riskLevel} />
      </div>

      <SessionsCell done={doneCount} booked={bookedCount} />
      <ElapsedCell since={referredMs} label="Referred" />

      <RowActions latestLabel={latest.label} onOpen={onOpen}>
        {doneCount > 0 && !allDone ? (
          <span className={`${PILL_BASE} bg-muted text-muted-foreground tabular-nums`}>
            {doneCount} session{doneCount === 1 ? "" : "s"} done
          </span>
        ) : null}
      </RowActions>
    </li>
  );
}
