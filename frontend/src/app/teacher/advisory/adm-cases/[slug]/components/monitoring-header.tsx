"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays, Check, ShieldCheck } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import {
  admStageTone,
  eligibilityLabel,
  eligibilityTone,
} from "@/lib/labels/status-tone";
import { StudentMascot } from "../../../referrals/components/StudentMascot";
import { ADM_JOURNEY } from "@/services/teacher/admCases.labels";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const dateLabel = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/**
 * The ADM journey in plain language. The backend stage machine is the source
 * of truth; this list only shortens the labels so a non-technical reader can
 * scan the whole path at a glance.
 */
const JOURNEY = ADM_JOURNEY;

function JourneySteps({ stage }: { stage: string }) {
  const currentIndex = Math.max(
    0,
    JOURNEY.findIndex((step) => step.key === stage)
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Case journey
        </p>
        <p className="m-0 text-[12px] font-medium text-muted-foreground">
          Step {currentIndex + 1} of {JOURNEY.length}
        </p>
      </div>

      <ol className="m-0 flex w-full list-none gap-1 p-0">
        {JOURNEY.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          return (
            <li
              key={step.key}
              aria-current={active ? "step" : undefined}
              className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 text-center"
            >
              <span className="flex w-full items-center gap-1">
                <span
                  className={cn(
                    "h-px flex-1",
                    index === 0 ? "bg-transparent" : done || active ? "bg-foreground/20" : "bg-border"
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors duration-150",
                    done && "border-transparent bg-emerald-500 text-white",
                    active && "border-transparent bg-blue-500 text-white ring-4 ring-blue-500/15",
                    !done && !active && "border-border bg-background text-muted-foreground"
                  )}
                >
                  {done ? <Check size={12} aria-hidden /> : index + 1}
                </span>
                <span
                  className={cn(
                    "h-px flex-1",
                    index === JOURNEY.length - 1
                      ? "bg-transparent"
                      : done
                        ? "bg-foreground/20"
                        : "bg-border"
                  )}
                  aria-hidden
                />
              </span>
              <span
                className={cn(
                  "w-full break-words text-[12px] leading-tight",
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function MonitoringHeader({
  header,
  backHref = "/teacher/advisory/adm-cases",
  backLabel = "Back to ADM cases",
  compact = false,
}: {
  header: AdmMonitoringCase["header"];
  /** Where the back link points — the coordinator desk reuses this view. */
  backHref?: string;
  backLabel?: string;
  /** Split desk pane: no back link, facts stacked above the journey. */
  compact?: boolean;
}) {
  const facts = [
    {
      label: "Principal approved",
      value: dateLabel(header.approvedAt) ?? "Not yet",
      icon: ShieldCheck,
    },
    {
      label: "Monitoring since",
      value: dateLabel(header.monitoringSince) ?? "—",
      icon: CalendarDays,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {compact ? null : (
        <Link
          href={backHref}
          className="-ml-2 inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden /> {backLabel}
        </Link>
      )}

      <section
        className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:p-5"
        aria-label="Learner case summary"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <StudentMascot
              name={header.studentName}
              seed={header.lrn}
              character={header.mascot ?? undefined}
              size={56}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                ADM learner
              </p>
              <h1
                className="m-0 truncate text-lg font-bold tracking-[-0.01em] text-foreground sm:text-xl"
                title={header.studentName}
              >
                {header.studentName}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone="neutral" label="LRN" className="tabular-nums">
                  {header.lrn}
                </Pill>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
            <Pill tone={admStageTone(header.stage)} label="ADM stage">
              {header.stageLabel}
            </Pill>
            <Pill tone={eligibilityTone(header.eligibilityStatus)} label="Eligibility">
              {eligibilityLabel(header.eligibilityStatus)}
            </Pill>
          </div>
        </div>

        {/* Facts and journey share one row on desktop; the journey takes the
            wide side so all eight steps fit without wrapping. The split desk
            pane stacks them, because it is only half the viewport wide. */}
        <div
          className={
            compact
              ? "flex flex-col gap-3 border-t pt-3"
              : "flex flex-col gap-4 border-t pt-3 lg:flex-row lg:items-center lg:gap-5"
          }
        >
          <div
            className={
              compact
                ? "grid shrink-0 grid-cols-2 gap-2"
                : "grid shrink-0 grid-cols-2 gap-2 lg:w-[22rem]"
            }
          >
            {facts.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2"
              >
                <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                  <span
                    className="truncate text-xs font-semibold text-foreground"
                    title={value}
                  >
                    {value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <span
            className={compact ? "hidden" : "hidden h-14 w-px shrink-0 bg-border lg:block"}
            aria-hidden
          />

          <div className="min-w-0 flex-1">
            <JourneySteps stage={header.stage} />
          </div>
        </div>
      </section>
    </div>
  );
}
