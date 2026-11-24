"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Building2, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { AdmTrackingTimeline } from "@/components/adm-tracker/AdmTrackingTimeline";
import { buildAdmTrackSteps } from "@/components/adm-tracker/adm-track-data";
import type { TrackerCaseInput } from "@/components/adm-tracker/adm-stage-activity";

export interface TrackableReferral {
  id: string;
  studentName: string;
  lrn: string;
  /** Persisted sprite mascot; null falls back to the derived one. */
  mascot?: string | null;
  targetRole: string;
  track: "adm" | "general";
  typeLabel: string;
  typeVariant: "amber" | "blue" | "green" | "outline";
  status: string;
  statusLabel: string;
  statusVariant: "amber" | "blue" | "green" | "red" | "outline";
  referredAt: string;
  reason: string;
  timeline: {
    label: string;
    detail?: string | null;
    date: string;
    at?: string;
    action?: string;
    byRole?: string | null;
    source?: "referrals" | "counseling_sessions" | "adm_parent_meetings" | "case";
    stage?: string | null;
    homeVisit?: boolean;
  }[];
  consultReviewer?: string | null;
  admStage?: string | null;
  dismissedByRole?: string | null;
  observationDate?: string | null;
  meetingAttended?: boolean | null;
  lastMeetingAt?: string | null;
  hasHomeVisit?: boolean;
  admApproved?: boolean;
  admApprovedAt?: string | null;
  modulesSubmitted?: number;
  modulesTotal?: number;
  lastModuleAt?: string | null;
  devicesReturned?: number;
  certificationAt?: string | null;
  resolvedAt?: string | null;
  bookedSession?: {
    scheduledAt: string;
    sessionType: string;
    venue: string | null;
  } | null;
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${d.toTimeString().slice(0, 5)}`;
}

/** Short pill text for a booked session slot. */
function formatSessionShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(
    "en-US",
    { hour: "numeric", minute: "2-digit" },
  )}`;
}

/** Full tooltip text for the booked-session pill. */
function bookedSessionTooltip(
  session: NonNullable<TrackableReferral["bookedSession"]>,
): string {
  const d = new Date(session.scheduledAt);
  const slot = Number.isFinite(d.getTime())
    ? `${d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : session.scheduledAt;
  const kind = humanize(session.sessionType);
  return `Session booked · ${slot}${kind ? ` · ${kind}` : ""}${
    session.venue?.trim() ? ` · ${session.venue.trim()}` : ""
  }`;
}

/** Status tone carried by the shared Pill, same map as the referrals table. */
const VARIANT_TONE: Record<
  TrackableReferral["statusVariant"],
  "amber" | "blue" | "green" | "red" | "neutral"
> = {
  amber: "amber",
  blue: "blue",
  green: "green",
  red: "red",
  outline: "neutral",
};

const REVIEWER_LABELS: Record<string, string> = {
  nurse: "School Nurse",
  guidance_counselor: "Guidance Counselor",
  lrpc: "LRPC",
};

/** ADM stages where the case still sits with the consultation reviewer. */
const EARLY_ADM_STAGES = new Set(["anecdotal", "consultation"]);

export function ReferralTrackDialog({
  referral,
  onClose,
}: {
  referral: TrackableReferral | null;
  onClose: () => void;
}) {
  const open = referral !== null;
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const isAdmTrack = referral?.track === "adm";
  const trackInput: TrackerCaseInput | null =
    referral && isAdmTrack
      ? {
          stage: referral.admStage ?? null,
          referralStatus: referral.status,
          dismissedByRole: referral.dismissedByRole ?? null,
          consultReviewer: referral.consultReviewer ?? null,
          referredBy: null,
          anecdotalDate: referral.observationDate ?? null,
          referredDate: referral.referredAt,
          meetingAttended: referral.meetingAttended ?? null,
          lastMeetingAt: referral.lastMeetingAt ?? null,
          hasHomeVisit: referral.hasHomeVisit ?? false,
          approved: referral.admApproved ?? false,
          approvedAt: referral.admApprovedAt ?? null,
          modulesSubmitted: referral.modulesSubmitted ?? 0,
          modulesTotal: referral.modulesTotal ?? 0,
          lastModuleAt: referral.lastModuleAt ?? null,
          devicesReturned: referral.devicesReturned ?? 0,
          certificationAt: referral.certificationAt ?? null,
          resolvedAt: referral.resolvedAt ?? null,
          timeline: (referral.timeline ?? []).map((t) => ({
            label: t.label,
            detail: t.detail ?? null,
            date: t.date,
            at: t.at ?? t.date,
            action: t.action ?? "",
            byRole: t.byRole ?? null,
            source: t.source ?? "case",
            stage: t.stage ?? null,
            homeVisit: t.homeVisit ?? false,
          })),
        }
      : null;

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted || !referral) return null;

  const withReviewer =
    referral.targetRole === "adm_coordinator" &&
    !!referral.consultReviewer &&
    EARLY_ADM_STAGES.has(referral.admStage ?? "consultation");
  const deskNow =
    withReviewer && referral.consultReviewer
      ? (REVIEWER_LABELS[referral.consultReviewer] ?? humanize(referral.consultReviewer))
      : humanize(referral.targetRole);
  const admSteps = trackInput ? buildAdmTrackSteps(trackInput) : [];
  const doneSteps = admSteps.filter((step) => step.state === "done").length;
  const progressPct =
    admSteps.length > 0 ? Math.round((doneSteps / admSteps.length) * 100) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[2px] animate-in fade-in-0 duration-150 dark:bg-black/70"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* One shared shell for both referral types — Other matters uses the
          same board width, header pills and card grid as ADM cases. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-track-title"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl min-w-0 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-muted p-2.5 shadow-xl [font-family:var(--font-inter)] animate-in fade-in-0 zoom-in-95 duration-150 dark:bg-background"
      >
        <div className="-mx-2.5 flex min-w-0 items-start gap-2 border-b border-border px-3.5 pb-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <StudentMascot
              name={referral.studentName}
              seed={referral.lrn}
              character={referral.mascot ?? undefined}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                Track referral
              </p>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                <h2
                  id="referral-track-title"
                  className="m-0 min-w-0 truncate text-[15px] font-semibold leading-tight text-foreground"
                  title={referral.studentName}
                >
                  {referral.studentName}
                </h2>
                <Pill className="tabular-nums" label="LRN">
                  {referral.lrn}
                </Pill>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-7 shrink-0 px-0"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={15} strokeWidth={1.8} aria-hidden />
          </Button>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-1">
          <Pill tone={VARIANT_TONE[referral.statusVariant]} label="Referral status">
            {referral.statusLabel}
          </Pill>
          <Pill tone={isAdmTrack ? "amber" : "blue"} label="Referral type">
            {referral.typeLabel}
          </Pill>
          {referral.bookedSession && referral.status !== "dismissed" ? (
            <Pill tone="teal" label={bookedSessionTooltip(referral.bookedSession)}>
              Session {formatSessionShort(referral.bookedSession.scheduledAt)}
            </Pill>
          ) : null}
          <span className="ml-auto inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
            <Building2 size={12} className="shrink-0 opacity-70" aria-hidden />
            <span className="truncate">With {deskNow}</span>
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-2 px-1">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="m-0 flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
              <History size={14} aria-hidden />
              {isAdmTrack ? "Pipeline tracking" : "Case history"}
            </p>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {isAdmTrack
                ? `${doneSteps} of ${admSteps.length} complete`
                : `${referral.timeline.length} update${
                    referral.timeline.length === 1 ? "" : "s"
                  }`}
            </span>
          </div>
          {isAdmTrack ? (
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-border/70"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="ADM pipeline progress"
            >
              <span
                className="block h-full rounded-full bg-amber-500 transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          ) : null}
          {isAdmTrack && trackInput ? (
            <AdmTrackingTimeline input={trackInput} variant="cards" />
          ) : referral.timeline.length > 0 ? (
            <ol
              className="grid min-w-0 grid-cols-1 gap-1.5 md:grid-cols-2"
              aria-label="Case history steps"
            >
              {referral.timeline.map((step, index) => (
                <li
                  key={`${step.label}-${step.at ?? step.date}-${index}`}
                  className="flex min-w-0 items-start gap-2.5 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 dark:bg-muted/10"
                >
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[12px] font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p
                        className="m-0 min-w-0 text-[12px] leading-snug font-semibold text-foreground"
                        title={step.label}
                      >
                        {step.label}
                      </p>
                      <span className="shrink-0 text-[12px] leading-snug text-muted-foreground">
                        {formatDateTime(step.at ?? step.date)}
                      </span>
                    </div>
                    {step.detail ? (
                      <p className="m-0 min-w-0 break-words text-[12px] leading-snug text-muted-foreground">
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              No history recorded yet.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
