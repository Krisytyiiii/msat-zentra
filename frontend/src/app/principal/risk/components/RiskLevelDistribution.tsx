"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Layers } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import type { RiskBoardData, RiskLevelKey } from "@/services/principal/risk.types";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { PrincipalEmptyState } from "../../components/PrincipalEmptyCard";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useRiskFocus } from "./risk-focus";
import styles from "./RiskLevelDistribution.module.css";

// Red / amber / green scale for the whole chart family — High reads as an
// alarm, Moderate as a caution, Low as healthy.
const RISK_LEVELS: Record<RiskLevelKey, string> = {
  High: "#dc2626",
  Moderate: "#f59e0b",
  Low: "#16a34a",
};

const LEVELS: RiskLevelKey[] = ["High", "Moderate", "Low"];

const chartConfig = {
  High: { label: "High risk", color: RISK_LEVELS.High },
  Moderate: { label: "Moderate risk", color: RISK_LEVELS.Moderate },
  Low: { label: "Low risk", color: RISK_LEVELS.Low },
} satisfies ChartConfig;

const gradeNum = (name: string) => {
  const match = String(name).match(/(\d+)/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  return Number.isNaN(value) ? 0 : value;
};

type ViewMode = "section" | "grade";

interface Row {
  key: string;
  label: string;
  detail: string;
  High: number;
  Moderate: number;
  Low: number;
  total: number;
}

export function RiskLevelDistribution() {
  const { activeTerm } = useTerm();
  const focus = useRiskFocus();
  const [view, setView] = usePersistentState<ViewMode>(
    "zentra.risk.distribution.view",
    "section",
  );

  const { data, isPending } = useQuery({
    queryKey: ["risk-board", activeTerm?.termId ?? null, activeTerm?.schoolYearId ?? null],
    queryFn: async () => {
      const res = await apiClient.get<RiskBoardData>("/api/risk/board");
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Section rows keep the G7 → G12 order the board serves; grade rows are one
  // bar per grade level so leadership can scan the whole school at once.
  const rows = React.useMemo<Row[]>(() => {
    if (view === "grade") {
      return [...(data?.byGrade ?? [])]
        .sort((a, b) => gradeNum(a.grade) - gradeNum(b.grade))
        .map((row) => ({
          key: row.grade,
          label: row.grade,
          detail: `${row.total} learner${row.total === 1 ? "" : "s"}`,
          High: row.High,
          Moderate: row.Moderate,
          Low: row.Low,
          total: row.total,
        }));
    }
    return [...(data?.bySection ?? [])]
      .sort((a, b) => {
        const gradeDiff = gradeNum(a.gradeLevel) - gradeNum(b.gradeLevel);
        if (gradeDiff !== 0) return gradeDiff;
        return a.section.localeCompare(b.section, undefined, { numeric: true });
      })
      .map((row) => ({
        key: row.section,
        label: row.section,
        detail: row.gradeLevel,
        High: row.High,
        Moderate: row.Moderate,
        Low: row.Low,
        total: row.total,
      }));
  }, [data, view]);

  const totals = React.useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.High += row.High;
          acc.Moderate += row.Moderate;
          acc.Low += row.Low;
          acc.total += row.total;
          return acc;
        },
        { High: 0, Moderate: 0, Low: 0, total: 0 },
      ),
    [rows],
  );

  const isEmpty = !isPending && rows.every((row) => row.total === 0);

  const peak = React.useMemo(() => {
    if (rows.length === 0) return null;
    return [...rows].sort(
      (a, b) => b.High + b.Moderate - (a.High + a.Moderate),
    )[0] ?? null;
  }, [rows]);

  const handleBarClick = (entry: { payload?: Row }) => {
    if (view !== "section" || !entry?.payload) return;
    focus.toggleSection(entry.payload.key);
    requestAnimationFrame(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document
        .getElementById("risk-learners")
        ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
  };

  const fill = (level: RiskLevelKey) =>
    focus.level && focus.level !== level
      ? `color-mix(in oklch, ${RISK_LEVELS[level]} 22%, var(--card))`
      : RISK_LEVELS[level];

  const viewToggle = (
    <FilterTabs
      label="Break down risk by"
      options={[
        { value: "section", label: "Sections", count: data?.bySection?.length ?? 0 },
        { value: "grade", label: "Grade levels", count: data?.byGrade?.length ?? 0 },
      ]}
      value={view}
      onChange={(next) => setView(next as ViewMode)}
    />
  );

  return (
    <KanbanBoard
      title={view === "section" ? "Risk by Section" : "Risk by Grade Level"}
      icon={<Layers size={14} aria-hidden="true" />}
      description={
        view === "section"
          ? "Three bars per section — High, Moderate and Low. Click a bar to focus that section on the learner board."
          : "Three bars per grade level, G7 to G12. Adviser-shared learners only."
      }
      actions={
        <>
          <Pill tone="green" label="Data source">
            Adviser-shared
          </Pill>
          {viewToggle}
        </>
      }
    >
      {isPending ? (
        <div className={styles.skeletonWrap} aria-hidden="true">
          <Skeleton className="h-[240px] w-full" />
        </div>
      ) : isEmpty ? (
        <PrincipalEmptyState
          icon={Layers}
          title="No connected learner data"
          hint="No sections with adviser-shared learners were found for the active term."
        />
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            className={styles.chart}
            style={{ height: 260, width: "100%", aspectRatio: "auto" }}
          >
            <BarChart
              accessibilityLayer
              data={rows}
              barCategoryGap={18}
              barGap={2}
              margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={8}
                interval={view === "grade" ? 0 : "equidistantPreserveStart"}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip
                cursor={{ fill: "color-mix(in oklch, #f59e0b, transparent 93%)" }}
                content={<ChartTooltipContent />}
              />
              {LEVELS.map((level, index) => (
                <Bar
                  key={level}
                  dataKey={level}
                  name={chartConfig[level].label as string}
                  fill={fill(level)}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive
                  animationBegin={index * 120}
                  animationDuration={900}
                  animationEasing="ease-out"
                  onClick={handleBarClick}
                  className={view === "section" ? styles.clickableBar : undefined}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.key}
                      fill={fill(level)}
                      opacity={
                        focus.section && focus.section !== row.key ? 0.3 : 1
                      }
                    />
                  ))}
                </Bar>
              ))}
              <ChartLegend
                verticalAlign="top"
                align="right"
                content={<ChartLegendContent />}
              />
            </BarChart>
          </ChartContainer>

          <p className={styles.insight}>
            {focus.section ? (
              <>
                Focused on <strong>{focus.section}</strong> — the learner board
                below now lists only that section. Click the bar again to clear.
              </>
            ) : peak && peak.High + peak.Moderate > 0 ? (
              <>
                <strong>{peak.label}</strong>{" "}
                {view === "section" ? "carries" : "has"} the most at-risk learners
                — <strong>{peak.High}</strong> high and{" "}
                <strong>{peak.Moderate}</strong> moderate. School-wide:{" "}
                <strong>{totals.High}</strong> high, <strong>{totals.Moderate}</strong>{" "}
                moderate, <strong>{totals.Low}</strong> low across{" "}
                <strong>{rows.length}</strong>{" "}
                {view === "section" ? "connected section" : "grade level"}
                {rows.length === 1 ? "" : "s"}.
              </>
            ) : (
              <>
                No at-risk learners in adviser-shared{" "}
                {view === "section" ? "sections" : "grade levels"} this term —{" "}
                <strong>{totals.Low}</strong> learner
                {totals.Low === 1 ? "" : "s"} currently on track.
              </>
            )}
          </p>
        </>
      )}
    </KanbanBoard>
  );
}
