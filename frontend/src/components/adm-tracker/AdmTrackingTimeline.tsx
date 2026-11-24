"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  buildAdmTrackSteps,
} from "./adm-track-data";
import {
  formatActionTime,
  latestActionByStage,
  type TrackerCaseInput,
} from "./adm-stage-activity";
import styles from "./adm-tracking-timeline.module.css";

export function AdmTrackingTimeline({
  input,
  reader = "teacher",
  variant = "timeline",
  showDescription = true,
}: {
  input: TrackerCaseInput;
  reader?: "teacher" | "coordinator";
  /** "cards" renders one compact kanban card per step (label + owner
      pill + state pill) instead of the rail timeline. */
  variant?: "timeline" | "cards";
  /** The rail timeline can drop the per-step explainer sentence when the
      card is already narrow. */
  showDescription?: boolean;
}) {
  const steps = buildAdmTrackSteps({
    stage: input.stage ?? null,
    referralStatus: input.referralStatus ?? null,
    consultReviewer: input.consultReviewer ?? null,
    referredBy: input.referredBy ?? null,
    anecdotalDate: input.anecdotalDate ?? null,
    referredDate: input.referredDate ?? null,
    meetingAttended: input.meetingAttended ?? null,
    hasHomeVisit: input.hasHomeVisit ?? false,
    approved: input.approved ?? false,
    approvedAt: input.approvedAt ?? null,
  });
  const latestByStage = latestActionByStage(input, reader);

  if (variant === "cards") {
    const dismissalRole = input.dismissedByRole ?? null;
    const withdrawn =
      !dismissalRole || dismissalRole === "adviser" || dismissalRole === "subject_teacher";
    return (
      <ol
        className="grid min-w-0 grid-cols-1 gap-1.5 md:grid-cols-2"
        aria-label="ADM pipeline steps"
      >
        {steps.map((step) => {
          const done = step.state === "done";
          const isCurrent = step.state === "current";
          // A pipeline that already ended at the current step shows its real
          // outcome instead of a perpetual "Current".
          const decision =
            isCurrent && input.referralStatus === "dismissed"
              ? { label: withdrawn ? "Cancelled" : "Rejected", color: "#ef4444" }
              : isCurrent && input.referralStatus === "resolved"
                ? { label: "Resolved", color: "#22c55e" }
                : null;
          // Flat one-surface steps: a numbered rail node carries the state,
          // the body carries label / detail / owner. No card-inside-a-card.
          const accent = decision?.color ?? (done ? "#22c55e" : isCurrent ? "var(--primary)" : null);
          return (
            <li
              key={step.stage}
              className={`relative flex min-w-0 items-start gap-2.5 overflow-hidden rounded-lg border px-3 py-2.5 ${
                accent ? "" : "border-border/80 bg-muted/30 dark:bg-muted/10"
              }`}
              style={
                accent
                  ? {
                      borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                      backgroundColor: `color-mix(in srgb, ${accent} 7%, transparent)`,
                    }
                  : undefined
              }
            >
              {isCurrent ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-0.5 bg-amber-500"
                />
              ) : null}
              <span
                className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums ${
                  done
                    ? "border-transparent bg-emerald-500 text-white"
                    : isCurrent
                      ? "border-transparent bg-amber-500 text-amber-950"
                      : "border-border bg-background text-muted-foreground"
                }`}
                style={
                  decision
                    ? {
                        backgroundColor: decision.color,
                        borderColor: "transparent",
                        color: "#fff",
                      }
                    : undefined
                }
              >
                {done || decision ? (
                  <Check size={12} strokeWidth={3} aria-hidden />
                ) : (
                  step.order
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p
                    className={`m-0 min-w-0 text-[12px] leading-snug font-semibold ${
                      done || isCurrent ? "text-foreground" : "text-muted-foreground"
                    }`}
                    title={step.label}
                  >
                    {step.label}
                  </p>
                  {decision ? (
                    <span
                      className="inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[12px] font-semibold leading-tight"
                      style={{
                        color: decision.color,
                        borderColor: `color-mix(in srgb, ${decision.color} 40%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${decision.color} 12%, transparent)`,
                      }}
                    >
                      {decision.label}
                    </span>
                  ) : done ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 text-[12px] font-semibold leading-tight text-emerald-600 dark:text-emerald-400">
                      Done
                    </span>
                  ) : isCurrent ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-amber-500 px-1.5 text-[12px] font-semibold leading-tight text-amber-950">
                      Current
                    </span>
                  ) : (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-md border border-border bg-background px-1.5 text-[12px] font-medium leading-tight text-muted-foreground">
                      Upcoming
                    </span>
                  )}
                </div>
                <p className="m-0 text-[12px] leading-snug text-muted-foreground">
                  {step.detail}
                </p>
                <p className="m-0 flex min-w-0 items-center gap-1 text-[12px] leading-snug text-muted-foreground/80">
                  <span className="truncate" title={step.owner}>
                    {step.owner}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={styles.timeline} aria-label="ADM pipeline with latest actions">
      {steps.map((step) => {
        const done = step.state === "done";
        const isCurrent = step.state === "current";
        const latest = latestByStage[step.stage];
        return (
          <li key={step.stage} className={styles.step}>
            <span className={styles.rail} aria-hidden>
              <span
                className={`${styles.dot} ${done ? styles.dotDone : ""} ${isCurrent ? styles.dotCurrent : ""}`}
              >
                {done ? <Check className={styles.dotIcon} /> : null}
              </span>
              <span className={`${styles.line} ${done ? styles.lineLit : ""}`} />
            </span>
            <div className={styles.body}>
              <div className={styles.topRow}>
                <span className={styles.order}>Step {step.order}</span>
                <p className={`${styles.label} ${!done && !isCurrent ? styles.labelTodo : ""}`}>
                  {step.label}
                </p>
                {done ? (
                  <Badge variant="green">Done</Badge>
                ) : isCurrent ? (
                  <Badge variant="default">Current</Badge>
                ) : (
                  <Badge variant="outline">Upcoming</Badge>
                )}
              </div>
              <p className={styles.detail}>{step.detail}</p>
              <p className={styles.owner}>Owner: {step.owner}</p>
              {showDescription ? <p className={styles.desc}>{step.description}</p> : null}
              {latest ? (
                <p className={styles.latestAction}>
                  <span className={styles.latestLabel}>Latest action</span>
                  {latest.actor && !/ by /i.test(latest.text) ? ` — ${latest.actor}` : ""} · {latest.text}
                  {latest.detail ? ` — ${latest.detail}` : ""}
                  {latest.at ? ` · ${formatActionTime(latest.at)}` : ""}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
