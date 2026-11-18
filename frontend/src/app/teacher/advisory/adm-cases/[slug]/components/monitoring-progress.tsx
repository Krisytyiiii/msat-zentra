"use client";

import type { ElementType } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

interface Stat {
  label: string;
  value: string;
  hint: string;
  icon: ElementType;
  tone: string;
  tile: string;
}

export function MonitoringProgress({
  progress,
}: {
  progress: AdmMonitoringCase["progress"];
}) {
  const { submitted, total, percent, overdueCount, nextDueAt } = progress;
  const remaining = Math.max(0, total - submitted);

  const stats: Stat[] = [
    {
      label: "Submitted",
      value: `${submitted} of ${total}`,
      hint: total === 0 ? "No modules released yet" : remaining === 0 ? "Everything is in" : `${remaining} still to submit`,
      icon: ListChecks,
      tone: "text-blue-600 dark:text-blue-400",
      tile: "bg-blue-500/10",
    },
    {
      label: "Completion",
      value: `${percent}%`,
      hint: total === 0 ? "Waiting for module release" : percent === 100 ? "All modules in" : "Of released modules",
      icon: CheckCircle2,
      tone: "text-emerald-600 dark:text-emerald-400",
      tile: "bg-emerald-500/10",
    },
    {
      label: "Past due",
      value: String(overdueCount),
      hint: overdueCount === 0 ? "Nothing overdue" : "Needs follow-up",
      icon: AlertTriangle,
      tone: overdueCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      tile: overdueCount > 0 ? "bg-red-500/10" : "bg-muted",
    },
    {
      label: "Next deadline",
      value: dateLabel(nextDueAt),
      hint: nextDueAt ? "Earliest pending module" : "No pending deadlines",
      icon: CalendarClock,
      tone: "text-violet-600 dark:text-violet-400",
      tile: "bg-violet-500/10",
    },
  ];

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-md border bg-card p-4"
      aria-label="Module progress"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <ListChecks size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="m-0 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
            Module progress
          </h2>
        </div>
        <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-blue-700 dark:text-blue-400">
          {percent}% complete
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon, tone, tile }) => (
          <div
            key={label}
            className="flex min-w-0 flex-col gap-1.5 rounded-md border bg-background p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md",
                  tile
                )}
              >
                <Icon size={14} className={tone} aria-hidden />
              </span>
              <span className="truncate text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
            </div>
            <p
              className="m-0 truncate text-xl font-bold leading-none tabular-nums text-foreground"
              title={value}
            >
              {value}
            </p>
            <p className="m-0 truncate text-[12px] text-muted-foreground" title={hint}>
              {hint}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Module completion"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="m-0 text-[12px] text-muted-foreground">
          {total === 0
            ? "No modules yet — release one from the advisory Modules desk."
            : `${submitted} of ${total} modules submitted · ${remaining} remaining`}
        </p>
      </div>
    </section>
  );
}
