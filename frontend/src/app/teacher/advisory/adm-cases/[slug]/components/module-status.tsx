"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AdmMonitoredModule } from "@/services/teacher/admMonitoring.service";

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

/** Status split drives the donut. Zero-count statuses stay out of the pie so
 *  the ring never renders invisible slices. */
export function buildModuleStatusSlices(modules: AdmMonitoredModule[]): StatusSlice[] {
  const counts = STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_LABEL[key]!,
    value: modules.filter((m) => m.status === key).length,
    fill: STATUS_FILL[key]!,
  }));
  const total = counts.reduce((sum, s) => sum + s.value, 0);
  return counts
    .filter((s) => s.value > 0)
    .map((s) => ({
      ...s,
      percent: total > 0 ? Math.round((s.value / total) * 100) : 0,
    }));
}

/**
 * Small module-status donut sized for a StatDeck tile: the ring is ~64px and
 * the legend sits beside it, so the whole chart reads inside one stat tile
 * instead of taking a full card of its own.
 */
export function ModuleStatusDonut({
  modules,
  percent,
  size = 64,
}: {
  modules: AdmMonitoredModule[];
  percent: number;
  size?: number;
}) {
  const slices = buildModuleStatusSlices(modules);

  if (slices.length === 0) {
    return <p className="m-0 text-xs text-muted-foreground">No modules released yet.</p>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
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
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums text-foreground">
          {percent}%
        </span>
      </div>

      <ul className="m-0 flex min-w-0 list-none flex-col gap-0.5 p-0">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[12px] leading-tight">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.fill }}
              aria-hidden
            />
            <span className="min-w-0 truncate text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-foreground">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
