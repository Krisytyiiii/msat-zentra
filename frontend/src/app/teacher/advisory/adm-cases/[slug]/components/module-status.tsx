"use client";

import { PieChart as PieChartIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AdmMonitoringCase } from "@/services/teacher/admMonitoring.service";

const STATUS_FILL: Record<string, string> = {
  submitted: "#16a34a",
  pending: "#f59e0b",
  overdue: "#dc2626",
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  pending: "Pending",
  overdue: "Overdue",
};

/** Slice order is fixed so the donut keeps the same colour for the same status. */
const STATUS_ORDER = ["submitted", "pending", "overdue"] as const;

interface StatusSlice {
  key: string;
  label: string;
  value: number;
  percent: number;
  fill: string;
}

/** Same tooltip shell as the teacher reports donut (reports-activity.tsx). */
function ModuleStatusTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: StatusSlice }[];
}) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  return (
    <div className="grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 font-sans text-xs shadow-xl">
      <div className="flex items-center gap-1.5 font-medium">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-[2px]"
          style={{ background: slice.fill }}
        />
        {slice.label}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Modules</span>
        <span className="font-sans font-medium tabular-nums text-foreground">
          {slice.value} ({slice.percent}%)
        </span>
      </div>
    </div>
  );
}

export function ModuleStatus({ data }: { data: AdmMonitoringCase }) {
  const { progress, modules } = data;

  // Status split drives the donut. Zero-count statuses stay out of the pie so
  // the ring never renders invisible slices.
  const statusCounts = STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_LABEL[key]!,
    value: modules.filter((m) => m.status === key).length,
    fill: STATUS_FILL[key]!,
  }));
  const countedTotal = statusCounts.reduce((sum, s) => sum + s.value, 0);
  const share = (value: number) =>
    countedTotal > 0 ? Math.round((value / countedTotal) * 100) : 0;
  const slices: StatusSlice[] = statusCounts
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, percent: share(s.value) }));

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
      aria-label="Module status"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <PieChartIcon size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="m-0 truncate text-sm font-bold tracking-[-0.01em] text-foreground">
            Module status
          </h2>
        </div>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
          {progress.percent}% complete
        </span>
      </header>

      {countedTotal === 0 ? (
        <p className="m-0 rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          No modules released yet.
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative mx-auto h-[140px] w-full max-w-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="64%"
                  outerRadius="100%"
                  paddingAngle={2}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive
                  animationDuration={700}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.fill} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  content={<ModuleStatusTooltip />}
                  wrapperStyle={{ outline: "none", zIndex: 80 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold leading-none tabular-nums text-foreground">
                {progress.percent}%
              </span>
              <span className="mt-0.5 text-[12px] uppercase tracking-wide text-muted-foreground">
                complete
              </span>
            </div>
          </div>

          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {statusCounts.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-[12px]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.fill }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
                <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
                <span className="w-8 text-right text-muted-foreground/70 tabular-nums">
                  {share(s.value)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
