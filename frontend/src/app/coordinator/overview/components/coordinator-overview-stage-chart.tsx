"use client";

import Link from "next/link";
import { ArrowUpRight, PieChart as PieChartIcon } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CoordinatorEmptyState } from "../../components/CoordinatorEmptyCard";
import { AMBER_RAMP, type StageDonutEntry } from "./coordinator-overview-helpers";
import styles from "./coordinator-overview-stage-chart.module.css";

function buildInterpretation(slices: StageDonutEntry[], total: number): string {
  if (total === 0) {
    return "No cases are in the pipeline yet — new referrals will appear here stage by stage.";
  }
  const top = [...slices].sort((a, b) => b.value - a.value)[0];
  return `${total} case${total === 1 ? "" : "s"} in flight, most sitting at ${top.full} (${top.value}).`;
}

/**
 * Pipeline chart — the desk's whole ADM caseload as one donut plus a stage
 * legend, closed by the shared "what it means" callout. Same board shell,
 * amber ramp and footer as the guidance / nurse overview charts.
 */
export function CoordinatorOverviewStageChart({
  stageDonut,
}: {
  stageDonut: StageDonutEntry[];
}) {
  const slices = stageDonut.map((d, i) => ({
    ...d,
    fill: AMBER_RAMP[i % AMBER_RAMP.length] ?? d.fill,
  }));
  const total = slices.reduce((n, d) => n + d.value, 0);
  const chartConfig = Object.fromEntries(
    slices.map((s) => [s.name, { label: s.full, color: s.fill }]),
  ) as ChartConfig;

  return (
    <KanbanBoard
      title="Pipeline by stage"
      icon={
        <span className={styles.titleIcon} aria-hidden>
          <PieChartIcon size={14} />
        </span>
      }
      description="Every live ADM case, from intake through completion."
      count={
        total === 0 ? undefined : `${total} in flight`
      }
      actions={
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
        >
          <Link href="/coordinator/referrals">
            Open queue
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      }
      ariaLabel="Pipeline by stage"
    >
      {total === 0 ? (
        <CoordinatorEmptyState
          icon={PieChartIcon}
          title="No cases in the pipeline"
          hint="New referrals will appear here by stage."
        />
      ) : (
        <>
          <div className={styles.chartRow}>
            <div className={styles.chartWrap}>
              <ChartContainer config={chartConfig} className={styles.donut}>
                <PieChart>
                  <ChartTooltip
                    wrapperStyle={{ zIndex: 50 }}
                    content={
                      <ChartTooltipContent
                        className={styles.tooltipSolid}
                        formatter={(value, name) => `${name}: ${value} case(s)`}
                      />
                    }
                  />
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="64%"
                    outerRadius="100%"
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    {slices.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className={styles.center} aria-hidden="true">
                <span className={styles.centerValue}>{total}</span>
                <span className={styles.centerLabel}>
                  case{total === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <ul className={styles.legend}>
              {slices.map((s) => {
                const percent = total > 0 ? Math.round((s.value / total) * 100) : 0;
                return (
                  <li key={s.name} className={styles.legendItem}>
                    <span
                      className={styles.swatch}
                      style={{ background: s.fill }}
                      aria-hidden="true"
                    />
                    <span className={styles.legendLabel}>{s.full}</span>
                    <span className={styles.legendValue}>
                      <Pill label="Case count and share of the pipeline">
                        <span
                          className={`${styles.legendCount} ${
                            s.value === 0 ? styles.legendCountZero : ""
                          }`}
                        >
                          {s.value}
                        </span>
                        <span className={styles.legendPercent}>{percent}%</span>
                      </Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.footerSlot}>
            <InsightCallout className={styles.interpretation} role="status">
              <span className={styles.interpretationLabel}>What it means · </span>
              {buildInterpretation(slices, total)}
            </InsightCallout>
          </div>
        </>
      )}
    </KanbanBoard>
  );
}
