"use client";
import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  Info,
  Lightbulb,
  Loader2,
  Lock,
  MapPin,
  MessagesSquare,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { SidePanel } from "@/components/ui/side-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { fetchOcForm01Detail } from "@/components/ocform01/ocform01";
import { formatDate, formatTime, toDateInputValue } from "@/lib/labels/datetime";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import { cn } from "@/lib/utils";
import type { GuidanceReferralItem, GuidanceRiskLevel } from "@/services/guidance/guidance.types";
import type { AtRiskStudentItem } from "@/services/guidance/interventions.types";
import {
  buildGcForm03Data,
  consultRecommendation,
} from "@/services/guidance/gcform03.service";
import type { GcForm03Data } from "@/services/guidance/gcform03.types";
import { GcForm03PreviewDialog } from "../adm/components/GcForm03PreviewDialog";
import {
  formatActionTime,
  rowStatusLabel,
  statusVariant as referralStatusVariant,
} from "../referrals/components/guidance-referrals-format";
import { EngineBreakdown } from "../interventions/components/intervention-engine-breakdown";
import { outcomeLabel, pipelineStatus } from "../interventions/components/intervention-row-helpers";

/** One case shown in the shared guidance detail overlay. */
export type CaseDetailRow =
  | { kind: "referral"; referral: GuidanceReferralItem }
  | { kind: "intervention"; item: AtRiskStudentItem };

/** A counseling session as rendered by the detail overlay. */
export interface CaseDetailSession {
  id: string;
  sessionType: string;
  scheduledAt: string;
  date: string;
  venue: string;
  status: string;
  sessionNotes: string;
  outcome: string;
  cancelReason: string;
}

const PILL =
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/**
 * Pill whose tooltip names the field only (e.g. "Status") — the value is
 * already on the pill itself, so the tooltip stays label-only.
 */
function LabeledPill({
  label,
  className,
  tooltip,
  children,
}: {
  label: string;
  className?: string;
  /** Overrides the tooltip body (defaults to the label only). */
  tooltip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className} tabIndex={0} aria-label={label}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <span className="font-medium">{tooltip ?? label}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function riskTone(level: GuidanceRiskLevel | undefined): string {
  if (level === "High") return "bg-red-500/15 text-red-700 dark:text-red-400";
  if (level === "Moderate") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

function statusTone(variant: string): string {
  switch (variant) {
    case "amber":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "success":
      return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "destructive":
      return "bg-red-500/15 text-red-700 dark:text-red-400";
    case "secondary":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-primary/10 text-primary";
  }
}

function statusTextTone(variant: string): string {
  switch (variant) {
    case "amber":
      return "text-amber-600 dark:text-amber-400";
    case "success":
      return "text-green-600 dark:text-green-400";
    case "destructive":
      return "text-red-600 dark:text-red-400";
    case "secondary":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

function statusToTone(variant: string): string {
  return variant === "green" ? "success" : variant === "warning" ? "amber" : variant;
}

function sessionBadge(status: string) {
  if (status === "completed")
    return (
      <LabeledPill label="Session status" className={cn(PILL, "bg-green-500/15 text-green-700 dark:text-green-400")}>
        Done
      </LabeledPill>
    );
  if (status === "cancelled")
    return (
      <LabeledPill label="Session status" className={cn(PILL, "bg-muted text-muted-foreground")}>
        Cancelled
      </LabeledPill>
    );
  return (
    <LabeledPill label="Session status" className={cn(PILL, "bg-blue-500/15 text-blue-700 dark:text-blue-400")}>
      Scheduled
    </LabeledPill>
  );
}

function SessionList({
  sessions,
  renderActions,
  emptyAction,
}: {
  sessions: CaseDetailSession[];
  /** Optional per-session action strip (e.g. mark done / reschedule). */
  renderActions?: (session: CaseDetailSession) => React.ReactNode;
  /** Optional booking control shown when the case has no sessions yet. */
  emptyAction?: React.ReactNode;
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Calendar className="size-4" aria-hidden />
        </span>
        <p className="text-[13px] font-medium text-foreground">
          No counseling sessions booked yet
        </p>
        <p className="text-[12px] text-muted-foreground">
          Counseling sessions booked from this case will appear here.
        </p>
        {emptyAction ? <div className="mt-1.5">{emptyAction}</div> : null}
      </div>
    );
  }
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );
  const amberPill = cn(PILL, "bg-amber-500/15 text-amber-700 dark:text-amber-400");
  return (
    <ul className="overflow-hidden rounded-xl border border-border bg-card p-1">
      {sorted.map((s) => (
        <li
          key={s.id}
          className="border-b border-border/60 last:border-b-0 transition-colors hover:bg-muted/40"
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <User className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <LabeledPill
                label="Session type"
                className={cn(PILL, "bg-blue-500/15 text-blue-700 dark:text-blue-400")}
              >
                {sessionTypeLabel(s.sessionType)}
              </LabeledPill>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <LabeledPill label="Date" className={cn(amberPill, "tabular-nums")}>
                  <Calendar className="size-3" aria-hidden />
                  <time dateTime={s.scheduledAt}>{formatDate(s.date)}</time>
                </LabeledPill>
                <LabeledPill label="Time" className={cn(amberPill, "tabular-nums")}>
                  <Clock className="size-3" aria-hidden />
                  {formatTime(s.scheduledAt)}
                </LabeledPill>
                {s.venue ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden />
                    {s.venue}
                  </span>
                ) : null}
              </p>
            </div>
            {sessionBadge(s.status)}
          </div>
          {(s.status === "completed" && (s.sessionNotes || s.outcome)) ||
          (s.status === "cancelled" && s.cancelReason) ? (
            <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-border/60 bg-muted/40 px-2.5 py-3 text-[13px]">
              {s.status === "completed" && s.sessionNotes ? (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="text-foreground">{s.sessionNotes}</dd>
                </>
              ) : null}
              {s.status === "completed" && s.outcome ? (
                <>
                  <dt className="text-muted-foreground">Outcome</dt>
                  <dd className="text-foreground">{s.outcome}</dd>
                </>
              ) : null}
              {s.status === "cancelled" && s.cancelReason ? (
                <>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd className="text-foreground">{s.cancelReason}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {renderActions ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-muted/20 px-2.5 py-2">
              {renderActions(s)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Section heading with a small icon — keeps every drawer block on one rhythm. */
function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      {children}
    </h3>
  );
}

function DetailField({
  label,
  value,
  icon: Icon,
  className,
  valueClassName,
}: {
  label: string;
  value: string | null | undefined;
  icon: LucideIcon;
  className?: string;
  /** Colour override for the value text (status chips, …). */
  valueClassName?: string;
}) {
  if (!value) return null;
  return (
    <div className={cn("flex items-start gap-2.5 bg-card px-3.5 py-3", className)}>
      <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5">
        <dt className="text-[12px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
          {label}
        </dt>
        <dd
          className={cn(
            "break-words text-[13px] leading-5 text-foreground first-letter:uppercase",
            valueClassName,
          )}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

/**
 * Endorsed ADM referrals carry a GCForm-03. The drawer shows it as a full-width
 * banner; clicking builds the form (queue row first, then refined with the
 * filed OCForm-01 report) and opens the same preview overlay the referral desk
 * uses.
 */
function GcFormBanner({ referral }: { referral: GuidanceReferralItem }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<GcForm03Data | null>(null);
  const [loading, setLoading] = React.useState(false);

  const stamp = (form: GcForm03Data): GcForm03Data => {
    const day = toDateInputValue(
      referral.lastActionAt || referral.referredAt || referral.date || "",
    );
    if (day) {
      form.receivedDate = day;
      form.counselorDate = day;
    }
    return form;
  };

  async function openForm() {
    if (loading) return;
    setOpen(true);
    if (!data) {
      setData(stamp(buildGcForm03Data(referral, null, consultRecommendation(referral.notes))));
    }
    if (!referral.anecdotalId) return;
    setLoading(true);
    try {
      const report = await fetchOcForm01Detail(referral.anecdotalId).catch(() => null);
      if (report) {
        setData(stamp(buildGcForm03Data(referral, report, consultRecommendation(referral.notes))));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openForm()}
        disabled={loading}
        aria-label={`Open the GCForm-03 referral form for ${referral.student}`}
        className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <FileText className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-foreground">
            GCForm-03 — Referral form
          </span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {loading ? "Preparing the form…" : "Click to open the endorsed referral form"}
          </span>
        </span>
        {loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </button>
      {open && data ? (
        <GcForm03PreviewDialog
          open
          data={data}
          confirming={false}
          onClose={() => setOpen(false)}
          onConfirm={() => {}}
          viewOnly
        />
      ) : null}
    </>
  );
}

/**
 * Shared case-detail overlay used by the guidance alerts board and the
 * interventions queue — same header, pills, sections and footer everywhere.
 */
export function GuidanceCaseDetailDialog({
  row,
  riskLevel,
  onClose,
  actions,
  sessionActions,
  emptyFollowUpAction,
  emptySessionAction,
  recordsBanner,
  sessionNotice,
  showOpenFullCase = true,
  presentation = "overlay",
}: {
  row: CaseDetailRow | null;
  riskLevel: GuidanceRiskLevel | undefined;
  onClose: () => void;
  /** Optional record banners (e.g. the OCForm-01 report) above the details. */
  recordsBanner?: React.ReactNode;
  /** Optional note shown above the session list (e.g. mark-done behaviour). */
  sessionNotice?: React.ReactNode;
  /** Optional footer actions (start/book, approve, record outcome, …). */
  actions?: React.ReactNode;
  /** Optional per-session action buttons (mark done, reschedule, docs). */
  sessionActions?: (session: CaseDetailSession) => React.ReactNode;
  /** Optional control shown inside the "No follow-up yet" empty state. */
  emptyFollowUpAction?: React.ReactNode;
  /** Optional booking control shown inside the "No sessions booked yet" state. */
  emptySessionAction?: React.ReactNode;
  /** Hide the "Open full case" link when the overlay is already on that page. */
  showOpenFullCase?: boolean;
  /** `drawer` slides the same detail in from the right (teacher advisory
      pattern) instead of a centered modal. */
  presentation?: "overlay" | "drawer";
}) {
  if (!row) return null;

  const isIntervention = row.kind === "intervention";
  const student = isIntervention ? row.item.student : row.referral.student;
  const lrn = isIntervention ? row.item.lrn : row.referral.lrn;
  const mascot = isIntervention ? row.item.mascot : row.referral.mascot;
  const grade = isIntervention ? row.item.grade : row.referral.grade;
  const section = isIntervention ? row.item.section : row.referral.section;
  const type = isIntervention ? "Intervention" : row.referral.type === "ADM" ? "ADM" : "Counseling";
  const typeTone =
    type === "Intervention"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : "bg-blue-500/15 text-blue-700 dark:text-blue-400";
  const TypeIcon =
    type === "Intervention"
      ? Activity
      : type === "ADM"
        ? ClipboardList
        : MessagesSquare;

  let statusText: string;
  let statusVariant: string;
  let detectedText: string;
  let fullCaseHref: string;
  let sessions: CaseDetailSession[] = [];
  let meetings: GuidanceReferralItem["meetings"] = [];
  let note: string | null = null;
  let outcome: string | null = null;

  if (isIntervention) {
    const item = row.item;
    const iv = item.intervention;
    detectedText = item.detectedAt || iv?.createdAt ? formatActionTime(item.detectedAt || iv?.createdAt || "") : "Just now";
    const doneCount = iv?.completedSessions ?? 0;
    const scheduledCount =
      iv?.sessions.filter((s) => s.status === "scheduled").length ?? 0;
    const pipeline = pipelineStatus(item, iv, scheduledCount, doneCount);
    statusText = pipeline.label;
    statusVariant = statusToTone(pipeline.variant);
    sessions = iv?.sessions ?? [];
    note = [iv?.recommendedAction, iv?.intakeNotes].filter((t) => t && t.trim() !== "").join(" — ") || null;
    outcome = iv && iv.outcomeNotes ? iv.outcomeNotes : null;
    fullCaseHref = `/guidance/interventions?highlight=${encodeURIComponent(item.studentKey)}`;
  } else {
    const r = row.referral;
    const doneCount = r.sessions.filter((s) => s.status === "completed").length;
    const allDone = doneCount > 0 && !r.sessions.some((s) => s.status === "scheduled");
    statusText = allDone ? "Done" : rowStatusLabel(r.type, r.status, r);
    statusVariant = allDone ? "success" : referralStatusVariant(r.status, r.type, r);
    detectedText = formatActionTime(r.referredAt || r.date);
    sessions = r.sessions;
    meetings = r.meetings ?? [];
    note = [r.reason, r.recommendations].filter((t) => t && t.trim() !== "").join(" — ") || null;
    fullCaseHref =
      r.type === "ADM"
        ? `/guidance/referrals/adm?highlight=${r.id}`
        : `/guidance/referrals/counseling?highlight=${r.id}`;
  }

  /* Endorsed ADM cases carry a GCForm-03; it shares a row with the record
     banner a caller passes in (e.g. the ADM desk's OCForm-01 report). */
  const gcFormBanner =
    !isIntervention &&
    row.referral.type === "ADM" &&
    row.referral.status === "in_progress" ? (
      <GcFormBanner referral={row.referral} />
    ) : null;

  /* One notice above the session list — the desks explain that "Mark done"
     closes a booking even when its slot is still in the future. */
  const sessionNoticeNode = sessionNotice ? (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-4 text-amber-800 dark:text-amber-200">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{sessionNotice}</span>
    </div>
  ) : null;

  const body = (
    <div className="space-y-5 px-1 py-1">
      {note ? (
        <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
          <span className="mt-px flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <FileText className="size-[15px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
              Note
            </p>
            <p className="mt-1 text-[13px] leading-5 text-foreground">{note}</p>
          </div>
        </div>
      ) : null}

      {isIntervention ? (
        <>
          <section className="space-y-3">
            <SectionHeading icon={Activity}>Why at risk</SectionHeading>
            <EngineBreakdown
              studentKey={row.item.studentKey}
              factors={row.item.factors}
              openReferrals={row.item.referralContext.open}
              closedReferrals={row.item.referralContext.closed}
              highPriority={row.item.intervention?.priority === "high"}
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionHeading icon={MessagesSquare}>Counseling plan</SectionHeading>
              <div className="flex flex-wrap items-center gap-1.5">
                {outcome ? (
                  <LabeledPill label="Outcome" className={cn(PILL, "bg-muted text-muted-foreground")}>
                    {outcome}
                  </LabeledPill>
                ) : null}
                {sessions.length > 0 ? (
                  <LabeledPill
                    label="Plan status"
                    className={cn(PILL, "bg-muted text-muted-foreground")}
                  >
                    {outcomeLabel(row.item.intervention?.outcomeStatus ?? "ongoing")}
                  </LabeledPill>
                ) : (
                  <LabeledPill
                    label="Plan status"
                    className={cn(PILL, "bg-muted text-muted-foreground")}
                  >
                    No sessions booked yet
                  </LabeledPill>
                )}
              </div>
            </div>
            {row.item.intervention ? (
              <>
                {sessionNoticeNode}
                <SessionList
                  sessions={sessions}
                  renderActions={sessionActions}
                  emptyAction={emptySessionAction}
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Calendar className="size-4" aria-hidden />
                </span>
                <p className="text-[13px] font-medium text-foreground">
                  No follow-up yet
                </p>
                <p className="text-[12px] text-muted-foreground">
                  A counseling session will appear here once it is booked.
                </p>
                {emptyFollowUpAction ? (
                  <div className="mt-1.5">{emptyFollowUpAction}</div>
                ) : null}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {recordsBanner || gcFormBanner ? (
            <div
              className={`grid grid-cols-1 gap-3 ${
                recordsBanner && gcFormBanner ? "sm:grid-cols-2" : ""
              }`}
            >
              {recordsBanner}
              {gcFormBanner}
            </div>
          ) : null}
          <section className="space-y-3">
            <SectionHeading icon={ClipboardList}>
              Referral details
            </SectionHeading>
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/50 sm:grid-cols-2">
              <DetailField icon={ClipboardList} label="Category" value={row.referral.category} />
              <DetailField icon={User} label="Referred by" value={row.referral.referredBy} />
              <DetailField icon={Calendar} label="Date referred" value={formatActionTime(row.referral.referredAt || row.referral.date)} />
              <DetailField icon={MapPin} label="Location" value={row.referral.location} />
              <DetailField icon={Flag} label="Priority" value={row.referral.priority} />
              <DetailField icon={Lock} label="Confidentiality" value={row.referral.confidentiality} />
              <DetailField
                icon={CheckCircle2}
                label="Status"
                value={statusText}
                valueClassName={statusTextTone(statusVariant)}
              />
              <DetailField
                icon={Lightbulb}
                label="Recommendations"
                value={row.referral.recommendations}
                className="sm:col-span-2"
              />
              <DetailField
                icon={CheckCircle2}
                label="Resolution"
                value={row.referral.resolutionSummary}
                className="sm:col-span-2"
              />
            </dl>
          </section>

          <section className="space-y-3">
            <SectionHeading icon={Calendar}>Sessions</SectionHeading>
            {sessionNoticeNode}
            <SessionList
              sessions={sessions}
              renderActions={sessionActions}
              emptyAction={emptySessionAction}
            />
          </section>

          {/* Parent meetings are `AdmParentMeeting` rows, not counseling
              sessions — without this block an ADM case with a booked
              conference looked like it had no booking at all. */}
          {meetings && meetings.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading icon={Users}>Parent meetings</SectionHeading>
              <ul className="overflow-hidden rounded-xl border border-border bg-card p-1">
                {meetings.map((meeting) => (
                  <li
                    key={meeting.id}
                    className="border-b border-border/60 last:border-b-0 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3 px-2.5 py-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Users className="size-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-foreground">
                          Parent conference
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Calendar className="size-3.5" aria-hidden />
                            <time dateTime={meeting.scheduledAt}>
                              {formatDate(meeting.date)}
                            </time>
                          </span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Clock className="size-3.5" aria-hidden />
                            {formatTime(meeting.scheduledAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden />
                            {meeting.venue || "Venue to be confirmed"}
                          </span>
                        </p>
                      </div>
                      <LabeledPill
                        label="Meeting status"
                        className={cn(
                          PILL,
                          meeting.attended
                            ? "bg-green-500/15 text-green-700 dark:text-green-400"
                            : "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                        )}
                      >
                        {meeting.attended ? "Attended" : "Scheduled"}
                      </LabeledPill>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );

  const headerActionsNode = (
    <span className="flex flex-wrap items-center gap-1.5">
      <LabeledPill label="Case type" className={cn(PILL, typeTone)}>
        <TypeIcon className="size-3 shrink-0" aria-hidden />
        {type}
      </LabeledPill>
      {/* Referral status now lives inside the Referral details grid; the
          intervention pipeline status has no details grid, so it stays here. */}
      {isIntervention ? (
        <LabeledPill
          label="Status"
          className={cn(
            PILL,
            statusText.toLowerCase().includes("booked")
              ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
              : statusTone(statusVariant)
          )}
        >
          {statusText}
        </LabeledPill>
      ) : null}
      <LabeledPill label="Risk level" className={cn(PILL, riskTone(riskLevel))}>
        {riskLevel ? `${riskLevel} risk` : "No risk"}
      </LabeledPill>
    </span>
  );

  const footerNode = (
    <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1">
      {actions}
      {showOpenFullCase ? (
        <Link
          href={fullCaseHref}
          aria-label="Open full case"
          title="Open full case"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );

  if (presentation === "drawer") {
    return (
      <SidePanel
        open
        onClose={onClose}
        label={`${student} — case details`}
        width="2xl"
        showCloseButton
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3.5 pr-12">
            <StudentMascot
              name={student}
              seed={lrn}
              character={mascot ?? undefined}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">
                {student}
              </h2>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                <span>
                  LRN:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {lrn || "—"}
                  </span>
                </span>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span>
                  Grade level:{" "}
                  <span className="font-semibold text-foreground">{grade || "—"}</span>
                </span>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span>
                  Section:{" "}
                  <span className="font-semibold text-foreground">{section || "—"}</span>
                </span>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span>
                  Detected:{" "}
                  <span className="font-semibold text-foreground">{detectedText}</span>
                </span>
              </p>
            </div>
          </header>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 bg-muted/25 px-4 py-2.5">
            {headerActionsNode}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
          <footer className="shrink-0 border-t border-border px-4 py-3">
            {footerNode}
          </footer>
        </div>
      </SidePanel>
    );
  }

  return (
    <KanbanOverlay
      open
      onClose={onClose}
      width="xl"
      title={
        <span className="flex flex-col items-start gap-1">
          <span className="text-sm">{student}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <LabeledPill
              label="LRN"
              className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-secondary-foreground"
            >
              {lrn || "—"}
            </LabeledPill>
            <LabeledPill
              label="Section"
              className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
              tooltip={grade || "—"}
            >
              {section || "—"}
            </LabeledPill>
          </span>
        </span>
      }
      icon={<StudentMascot name={student} seed={lrn} character={mascot ?? undefined} size={24} />}
      description={
        <span className="flex w-full items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          Detected {detectedText}
        </span>
      }
      headerActions={headerActionsNode}
      footer={footerNode}
    >
      {body}
    </KanbanOverlay>
  );
}
