"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis } from "recharts";
import { ArrowRight, FileStack } from "lucide-react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { ChartTooltip, CHART_TOOLTIP_WRAPPER } from "@/components/ui/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { RegistryRequestDayRow } from "@/services/registry/overview.types";
import type { RegistryDesk } from "@/services/registry/overview.service";
import { registryBase, registryOverviewQuery } from "./registryOverviewQuery";
import styles from "./registry-overview.module.css";

const chartConfig = {
  pending: { label: "Pending", color: "#f59e0b" },
  approved: { label: "Approved", color: "#10b981" },
  reported: { label: "Reported", color: "#ef4444" },
  denied: { label: "Denied", color: "#8b5cf6" },
} satisfies ChartConfig;

const SERIES = ["pending", "approved", "reported", "denied"] as const;
type SeriesKey = (typeof SERIES)[number];

const WINDOWS = [7, 14, 30] as const;
type WindowDays = (typeof WINDOWS)[number];

function formatDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const dayTotal = (row: RegistryRequestDayRow) =>
  row.pending + row.approved + row.reported + row.denied;

/**
 * Adviser SF10 request activity. The window switcher (7/14/30d) and the
 * clickable legend make the figure explorable: totals, peak day and the chart
 * always describe the same slice, and hiding a series dims its counter.
 */
export function RegistryRequestsPanel({ desk }: { desk: RegistryDesk }) {
  const { data, isPending, isError } = useQuery(registryOverviewQuery(desk));
  const [days, setDays] = React.useState<WindowDays>(30);
  const [hidden, setHidden] = React.useState<Set<SeriesKey>>(new Set());
  const base = registryBase(desk);

  const allRows = React.useMemo(() => data?.sf10RequestsDaily ?? [], [data]);
  const rows = React.useMemo(() => allRows.slice(-days), [allRows, days]);

  const activityInWindow = rows.some((row) => dayTotal(row) > 0);
  const activityEver = allRows.some((row) => dayTotal(row) > 0);

  const totals = React.useMemo(() => {
    const sum = { pending: 0, approved: 0, reported: 0, denied: 0 };
    for (const row of rows) {
      for (const key of SERIES) sum[key] += row[key];
    }
    return sum;
  }, [rows]);

  const activeSeries = React.useMemo(
    () => SERIES.filter((key) => rows.some((row) => row[key] > 0)),
    [rows],
  );
  const visibleSeries = activeSeries.filter((key) => !hidden.has(key));

  const peak = React.useMemo(() => {
    let best: RegistryRequestDayRow | null = null;
    for (const row of rows) {
      if (!best || dayTotal(row) > dayTotal(best)) best = row;
    }
    return best && dayTotal(best) > 0 ? best : null;
  }, [rows]);

  const toggleSeries = (key: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const body = isPending ? (
    <Skeleton className="h-32 w-full rounded-lg" />
  ) : isError ? (
    <p className="px-1 py-4 text-center text-xs text-muted-foreground">
      Could not load access-request activity.
    </p>
  ) : !activityEver ? (
    <p className="px-1 py-4 text-center text-xs text-muted-foreground">
      No adviser SF10 access requests yet. Submissions, approvals, missing
      reports and denials will appear here day by day.
    </p>
  ) : !activityInWindow ? (
    <div className={styles.inlineEmpty}>
      <span>No activity in the last {days} days.</span>
      <button
        type="button"
        className={styles.inlineEmptyButton}
        onClick={() => setDays(30)}
      >
        Show 30 days
      </button>
    </div>
  ) : (
    <>
      <div className={styles.seriesRow}>
        {activeSeries.map((key) => {
          const pressed = !hidden.has(key);
          return (
            <button
              key={key}
              type="button"
              className={styles.seriesChip}
              aria-pressed={pressed}
              aria-label={`${pressed ? "Hide" : "Show"} ${chartConfig[key].label} series`}
              onClick={() => toggleSeries(key)}
            >
              <span
                className={styles.seriesDot}
                style={{ backgroundColor: chartConfig[key].color }}
                aria-hidden
              />
              {chartConfig[key].label}
              <span className={styles.seriesTotal}>{totals[key]}</span>
            </button>
          );
        })}
      </div>

      {visibleSeries.length === 0 ? (
        <div className={styles.inlineEmpty}>
          <span>All series hidden.</span>
          <button
            type="button"
            className={styles.inlineEmptyButton}
            onClick={() => setHidden(new Set())}
          >
            Show all
          </button>
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-32 w-full"
          aria-label={`Adviser SF10 requests, last ${days} days`}
        >
          <AreaChart data={rows} margin={{ left: 0, right: 8, top: 4 }}>
            <defs>
              {visibleSeries.map((key) => (
                <linearGradient
                  key={key}
                  id={`fill-registry-sf10-${desk}-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.1}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => formatDay(value as string)}
            />
            <Tooltip
              cursor={false}
              content={<ChartTooltip formatLabel={(value) => formatDay(String(value))} />}
              wrapperStyle={CHART_TOOLTIP_WRAPPER}
            />
            {visibleSeries.map((key) => (
              <Area
                key={key}
                dataKey={key}
                name={chartConfig[key].label}
                type="monotone"
                stackId="a"
                fill={`url(#fill-registry-sf10-${desk}-${key})`}
                stroke={`var(--color-${key})`}
                strokeWidth={1.5}
                animationDuration={500}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ChartContainer>
      )}

      <div className={styles.requestsFoot}>
        <span>
          Busiest day:{" "}
          <span className={styles.peak}>
            {peak ? `${formatDay(peak.date)} · ${dayTotal(peak)} events` : "—"}
          </span>
        </span>
        <Link
          href={`${base}/adviser-access`}
          className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
        >
          Open adviser access
          <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
    </>
  );

  return (
    <KanbanBoard
      className="flex-1"
      title="SF10 Access Requests"
      icon={
        <span className="text-amber-500" aria-hidden>
          <FileStack size={14} />
        </span>
      }
      description="Requests submitted, students approved or reported missing, and denials per day — adviser SF10 access."
      headerToolbar={
        <FilterTabs
          label="Request window"
          variant="tags"
          options={WINDOWS.map((option) => ({
            value: String(option),
            label: `${option}d`,
            tone: "neutral" as const,
          }))}
          value={String(days)}
          onChange={(next) => setDays(Number(next) as WindowDays)}
        />
      }
    >
      <div className={styles.panelBody}>{body}</div>
    </KanbanBoard>
  );
}
