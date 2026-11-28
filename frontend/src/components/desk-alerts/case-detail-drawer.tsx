"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  Clock,
  Info,
  MapPin,
  User,
  type LucideIcon,
} from "lucide-react";
import { SidePanel } from "@/components/ui/side-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { formatDate, formatTime } from "@/lib/labels/datetime";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import { cn } from "@/lib/utils";

/**
 * Shared case-detail drawer chrome for the guidance and nurse alert desks.
 *
 * Both desks used to carry a hand-copied version of this markup, which let the
 * two drift (different pills, different session buttons, different field
 * order). Everything presentational lives here now; each desk only supplies
 * its own data and session actions.
 */

export const PILL =
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** A counseling/clinic session as rendered by the shared drawer. */
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

/**
 * Pill whose tooltip names the field only (e.g. "Status") — the value is
 * already on the pill itself, so the tooltip stays label-only.
 */
export function LabeledPill({
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

export function riskTone(
  level: "High" | "Moderate" | "Low" | undefined,
): string {
  if (level === "High") return "bg-red-500/15 text-red-700 dark:text-red-400";
  if (level === "Moderate")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

export function statusTone(variant: string): string {
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

export function statusTextTone(variant: string): string {
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

export function statusToTone(variant: string): string {
  return variant === "green"
    ? "success"
    : variant === "warning"
      ? "amber"
      : variant;
}

function sessionBadge(status: string) {
  if (status === "completed")
    return (
      <LabeledPill
        label="Session status"
        className={cn(
          PILL,
          "bg-green-500/15 text-green-700 dark:text-green-400",
        )}
      >
        Done
      </LabeledPill>
    );
  if (status === "cancelled")
    return (
      <LabeledPill
        label="Session status"
        className={cn(PILL, "bg-muted text-muted-foreground")}
      >
        Cancelled
      </LabeledPill>
    );
  return (
    <LabeledPill
      label="Session status"
      className={cn(PILL, "bg-blue-500/15 text-blue-700 dark:text-blue-400")}
    >
      Scheduled
    </LabeledPill>
  );
}

/** Session list — identical ordering, rows, notes and action strip per desk. */
export function SessionList({
  sessions,
  renderActions,
  emptyAction,
  emptyTitle = "No counseling sessions booked yet",
  emptyHint = "Counseling sessions booked from this case will appear here.",
}: {
  sessions: CaseDetailSession[];
  /** Optional per-session action strip (e.g. mark done / reschedule). */
  renderActions?: (session: CaseDetailSession) => React.ReactNode;
  /** Optional booking control shown when the case has no sessions yet. */
  emptyAction?: React.ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Calendar className="size-4" aria-hidden />
        </span>
        <p className="text-[13px] font-medium text-foreground">{emptyTitle}</p>
        <p className="text-[12px] text-muted-foreground">{emptyHint}</p>
        {emptyAction ? <div className="mt-1.5">{emptyAction}</div> : null}
      </div>
    );
  }
  const sorted = [...sessions].sort(
    (a, b) =>
      new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );
  const amberPill = cn(
    PILL,
    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  );
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
                className={cn(
                  PILL,
                  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                )}
              >
                {sessionTypeLabel(s.sessionType)}
              </LabeledPill>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <LabeledPill
                  label="Date"
                  className={cn(amberPill, "tabular-nums")}
                >
                  <Calendar className="size-3" aria-hidden />
                  <time dateTime={s.scheduledAt}>{formatDate(s.date)}</time>
                </LabeledPill>
                <LabeledPill
                  label="Time"
                  className={cn(amberPill, "tabular-nums")}
                >
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
export function SectionHeading({
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

export function DetailField({
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
    <div
      className={cn("flex items-start gap-2.5 bg-card px-3.5 py-3", className)}
    >
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
 * The drawer itself: a right-hand SidePanel with the learner header, the pill
 * strip, the scrolling body and the footer. Callers pass the body sections and
 * footer actions they own; the chrome is always identical.
 */
export function CaseDetailDrawer({
  student,
  lrn,
  mascot,
  grade,
  section,
  detectedLabel,
  detectedText,
  headerPills,
  body,
  footer,
  onClose,
}: {
  student: string;
  lrn: string;
  mascot?: string | null;
  grade: string;
  section: string;
  /** "Referred" or "Detected" — the timestamp label in the header. */
  detectedLabel: string;
  detectedText: string;
  /** Pills rendered in the strip under the header (case type + status/risk). */
  headerPills: React.ReactNode;
  body: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
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
                <span className="font-semibold text-foreground">
                  {grade || "—"}
                </span>
              </span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>
                Section:{" "}
                <span className="font-semibold text-foreground">
                  {section || "—"}
                </span>
              </span>
              <span aria-hidden className="text-border">
                |
              </span>
              <span>
                {detectedLabel}:{" "}
                <span className="font-semibold text-foreground">
                  {detectedText}
                </span>
              </span>
            </p>
          </div>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 bg-muted/25 px-4 py-2.5">
          {headerPills}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
        <footer className="shrink-0 border-t border-border px-4 py-3">
          {footer}
        </footer>
      </div>
    </SidePanel>
  );
}

/** Footer action row: caller actions followed by the round open-full-case link. */
export function CaseDetailFooter({
  actions,
  fullCaseHref,
  showOpenFullCase = true,
}: {
  actions?: React.ReactNode;
  fullCaseHref: string;
  showOpenFullCase?: boolean;
}) {
  return (
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
}

/** Amber "mark done early" notice shown above a session list. */
export function SessionNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-4 text-amber-800 dark:text-amber-200">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
