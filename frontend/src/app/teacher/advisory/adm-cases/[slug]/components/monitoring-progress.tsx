"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";
import { ModuleStatusDonut } from "./module-status";

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function MonitoringProgress({
  data,
}: {
  data: AdmMonitoringCase;
  /** Kept for call-site compatibility; the deck is responsive already. */
  compact?: boolean;
}) {
  const { progress, modules } = data;
  const { submitted, total, percent, overdueCount, nextDueAt } = progress;
  const remaining = Math.max(0, total - submitted);

  const stats: StatDeckItem[] = [
    {
      key: "submitted",
      label: "Submitted",
      unit: "modules",
      value: submitted,
      hint:
        total === 0
          ? "No modules released yet"
          : remaining === 0
            ? "Everything is in"
            : `${submitted} of ${total} · ${remaining} still to submit`,
      icon: ListChecks,
    },
    {
      key: "completion",
      label: "Completion",
      unit: "",
      value: `${percent}%`,
      hint:
        total === 0
          ? "Waiting for module release"
          : percent === 100
            ? "All modules in"
            : "Of released modules",
      icon: CheckCircle2,
      meter: percent,
    },
    {
      key: "past-due",
      label: "Past due",
      unit: "modules",
      value: overdueCount,
      hint: overdueCount === 0 ? "Nothing overdue" : "Needs follow-up",
      icon: AlertTriangle,
      tone: overdueCount > 0 ? "amber" : undefined,
    },
    {
      key: "next-deadline",
      label: "Next deadline",
      unit: "",
      value: dateLabel(nextDueAt),
      hint: nextDueAt ? "Earliest pending module" : "No pending deadlines",
      icon: CalendarClock,
    },
    {
      key: "status",
      label: "Module status",
      unit: "",
      value: percent,
      hint:
        total === 0
          ? "No modules yet — release one from the advisory Modules desk"
          : `${submitted} of ${total} submitted · ${remaining} remaining`,
      icon: ListChecks,
      body: <ModuleStatusDonut modules={modules} percent={percent} />,
    },
  ];

  return (
    <StatDeck
      title="Module progress"
      icon={ListChecks}
      columns={3}
      ariaLabel="Module progress"
      items={stats}
      headerExtra={
        <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-blue-700 dark:text-blue-400">
          {percent}% complete
        </span>
      }
    />
  );
}
