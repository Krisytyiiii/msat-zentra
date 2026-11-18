"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { PrincipalEmptyState } from "../../components/PrincipalEmptyCard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { apiClient } from "@/lib/api/client";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { useTerm } from "@/lib/term/TermContext";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import type { RiskTrendData } from "@/services/principal/risk.types";
import styles from "./RiskTrend.module.css";

const RISK_LEVELS = {
  high: "#dc2626",
  moderate: "#f59e0b",
  low: "#16a34a",
} as const;

const chartConfig = {
  high: { label: "High risk", color: RISK_LEVELS.high },
  moderate: { label: "Moderate risk", color: RISK_LEVELS.moderate },
  low: { label: "Low risk", color: RISK_LEVELS.low },
} satisfies ChartConfig;

const SERIES = [
  { key: "low", label: "Low risk", color: RISK_LEVELS.low },
  { key: "moderate", label: "Moderate risk", color: RISK_LEVELS.moderate },
  { key: "high", label: "High risk", color: RISK_LEVELS.high },
] as const;

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "all", label: "All" },
] as const;

type RangeKey = (typeof RANGES)[number]["value"];

export function RiskTrend() {
  // Server-scoped: the trend follows the active school year/term. Daily vs
  // per-term rows are inferred from the response, not from client state.
  const { activeSchoolYear } = useTerm();

  const [range, setRange] = usePersistentState<RangeKey>(
    "zentra.risk.trend.range",
    "all",
  );

  const { data, isPending } = useQuery({
    queryKey: ["risk-trend"],
    queryFn: async () => {
      const res = await apiClient.get<RiskTrendData>("/api/risk/trend");
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const trend = data?.trend ?? [];
  const isDaily = trend.some((point) => Boolean(point.date));
  let chartData = trend.map((point) => ({
    date: point.date,
    term: point.term,
    high: isPending ? 0 : point.high,
    moderate: isPending ? 0 : point.moderate,
    low: isPending ? 0 : point.low,
  }));

  if (isDaily && range !== "all") {
    const count = Number(range);
    const dates = chartData.map((point) => point.date).filter(Boolean);
    if (dates.length > 0) {
      const max = dates.reduce((a, b) => (a > b ? a : b));
      const maxDate = new Date(`${max}T00:00:00`);
      maxDate.setDate(maxDate.getDate() - (count - 1));
      const cutoff = maxDate.getTime();
      chartData = chartData.filter(
        (point) =>
          !!point.date && new Date(`${point.date}T00:00:00`).getTime() >= cutoff,
      );
    }
  }

  const hasData = chartData.length > 0;

  const latest = chartData[chartData.length - 1];
  const previous = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const latestTotal = latest ? latest.high + latest.moderate + latest.low : 0;
  const latestHighShare =
    latest && latestTotal > 0 ? Math.round((latest.high / latestTotal) * 100) : 0;
  const deltaTotal = latest && previous
    ? latest.high + latest.moderate + latest.low -
      (previous.high + previous.moderate + previous.low)
    : null;
  const peak = chartData.reduce<{ label: string; total: number } | null>(
    (best, point) => {
      const total = point.high + point.moderate + point.low;
      if (!best || total > best.total) return { label: point.term, total };
      return best;
    },
    null,
  );

  const rangeControl = isDaily ? (
    <FilterTabs
      label="Trend range"
      options={RANGES}
      value={range}
      onChange={setRange}
    />
  ) : undefined;

  return (
    <KanbanBoard
      title="Risk History"
      icon={<TrendingUp size={14} aria-hidden="true" />}
      description={
        isDaily
          ? "Daily flagged learners shared by their advisers for the active term."
          : "Flagged learners shared by their advisers, aggregated per term."
      }
      actions={
        <>
          <Pill tone="green" label="Data source">
            Adviser-shared
          </Pill>
          {rangeControl}
        </>
      }
    >
      {!isPending && !hasData ? (
        <PrincipalEmptyState
          icon={TrendingUp}
          title="No shared trend data yet"
          hint="No risk history is available for adviser-shared learners in the active school year and term."
        />
      ) : isPending ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Latest checkpoint</span>
              <span className={styles.statValue}>{latestTotal.toLocaleString()}</span>
              <span className={styles.statHint}>
                {deltaTotal === null
                  ? "first snapshot"
                  : deltaTotal === 0
                    ? "unchanged"
                    : `${deltaTotal > 0 ? "+" : ""}${deltaTotal} vs previous`}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>High risk share</span>
              <span className={styles.statValue}>{latestHighShare}%</span>
              <span className={styles.statHint}>
                {latest?.high.toLocaleString() ?? 0} of{" "}
                {latestTotal.toLocaleString()} flagged
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Peak checkpoint</span>
              <span className={styles.statValue}>{peak?.total.toLocaleString() ?? 0}</span>
              <span className={styles.statHint}>{peak?.label ?? "—"}</span>
            </div>
          </div>

          <ChartContainer
            config={chartConfig}
            className={styles.chartContainer}
            style={{ height: 280, width: "100%", aspectRatio: "auto" }}
          >
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            >
              <defs>
                {SERIES.map((series) => (
                  <linearGradient
                    key={series.key}
                    id={`riskTrendFill-${series.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={series.color} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={series.color} stopOpacity={0.06} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="term"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={isDaily ? 24 : 0}
                tick={{ fontSize: 12 }}
                interval={isDaily ? "preserveStartEnd" : 0}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              {SERIES.map((series, index) => (
                <Area
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stackId="risk"
                  stroke={series.color}
                  strokeWidth={1.4}
                  fill={`url(#riskTrendFill-${series.key})`}
                  isAnimationActive
                  animationBegin={120 + index * 140}
                  animationDuration={900}
                  animationEasing="ease-out"
                  activeDot={{ r: 3, strokeWidth: 1.5 }}
                />
              ))}
              <ChartLegend
                verticalAlign="top"
                align="right"
                content={<ChartLegendContent />}
              />
            </AreaChart>
          </ChartContainer>

          {latest ? (
            <p className={styles.insight}>
              Latest checkpoint: <strong>{latestTotal}</strong> learners flagged,{" "}
              <strong>{latest.high}</strong> high risk ({latestHighShare}%).{" "}
              {deltaTotal !== null && deltaTotal !== 0 ? (
                <>
                  That is <strong>{deltaTotal > 0 ? "+" : ""}{deltaTotal}</strong>{" "}
                  against the previous checkpoint.{" "}
                </>
              ) : null}
              {activeSchoolYear ? `Scoped to ${activeSchoolYear.name}.` : ""}
            </p>
          ) : null}
        </>
      )}
    </KanbanBoard>
  );
}
