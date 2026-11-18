"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  RefreshCw,
  X,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { useCountUp } from "@/lib/hooks/useCountUp";
import { cn } from "@/lib/utils";
import type {
  RiskBoardData,
  RiskFactor,
  RiskLevelKey,
} from "@/services/principal/risk.types";
import { Skeleton } from "@/components/ui/skeleton";
import { useRiskFocus } from "./risk-focus";
import styles from "./RiskHero.module.css";

const LEVEL_FILL: Record<RiskLevelKey, string> = {
  High: "#dc2626",
  Moderate: "#f59e0b",
  Low: "#16a34a",
};

const LEVELS: {
  key: RiskLevelKey;
  label: string;
  hint: string;
}[] = [
  { key: "High", label: "High risk", hint: "Priority review" },
  { key: "Moderate", label: "Moderate risk", hint: "Monitor closely" },
  { key: "Low", label: "Low risk", hint: "On track" },
];

const FACTORS: { key: RiskFactor; label: string; color: string }[] = [
  { key: "Academic", label: "Academic", color: "#f59e0b" },
  { key: "Attendance", label: "Attendance", color: "#22c55e" },
  { key: "Behavioral", label: "Anecdotal", color: "#3b82f6" },
];

/** Lightweight trend line — a sparkline, not another full chart card. */
function Sparkline({ values, gradientId }: { values: number[]; gradientId: string }) {
  if (values.length < 2) return null;
  const width = 260;
  const height = 54;
  const pad = 4;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="2.6" fill="#f59e0b" stroke="var(--card)" strokeWidth="1.5" />
    </svg>
  );
}

export function RiskHero() {
  const { activeTerm, activeSchoolYear } = useTerm();
  const queryClient = useQueryClient();
  const focus = useRiskFocus();
  const rawId = React.useId();
  const gradientId = `risk-spark-${rawId.replace(/:/g, "")}`;

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["risk-board", activeTerm?.termId ?? null, activeTerm?.schoolYearId ?? null],
    queryFn: async () => {
      const res = await apiClient.get<RiskBoardData>("/api/risk/board");
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const counts: Record<RiskLevelKey, number> = { High: 0, Moderate: 0, Low: 0 };
  for (const row of data?.levelDistribution ?? []) counts[row.level] = row.count;
  const total = counts.High + counts.Moderate + counts.Low;
  const atRisk = counts.High + counts.Moderate;
  const share = total === 0 ? 0 : Math.round((atRisk / total) * 100);
  const atRiskShown = useCountUp(atRisk, 900);

  const factors = data?.factorTotals ?? { Academic: 0, Attendance: 0, Behavioral: 0 };
  const factorMax = Math.max(1, factors.Academic, factors.Attendance, factors.Behavioral);

  // The board's own weekly checkpoints describe the term's shape; the separate
  // /api/risk/trend feed is the daily history rendered lower on the page.
  const history = React.useMemo(
    () => (data?.trend ?? []).map((point) => point.high + point.moderate),
    [data],
  );
  const hasHistory = history.some((value) => value > 0);
  const delta =
    history.length >= 2 ? history[history.length - 1] - history[history.length - 2] : null;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["risk-board"] });
    void queryClient.invalidateQueries({ queryKey: ["risk-trend"] });
    void queryClient.invalidateQueries({ queryKey: ["risk-students-all"] });
  };

  if (isPending) {
    return (
      <section className={styles.hero} aria-busy="true" aria-label="Risk overview loading">
        <div className={styles.head}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className={styles.body}>
          <div className={styles.lead}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-12 w-28" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-14 w-full" />
          </div>
          <div className={styles.sep} aria-hidden="true" />
          <div className={styles.right}>
            <Skeleton className="h-3 w-24" />
            <div className={styles.levels}>
              {LEVELS.map((level) => (
                <Skeleton key={level.key} className={styles.levelSkeleton} />
              ))}
            </div>
            <Skeleton className="h-3 w-24" />
            <div className={styles.factors}>
              {FACTORS.map((factor) => (
                <Skeleton key={factor.key} className={styles.factorSkeleton} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.hero} aria-label="Risk overview">
      <header className={styles.head}>
        <span className={styles.headTitle}>
          <span className={styles.iconChip} aria-hidden="true">
            <Activity size={13} />
          </span>
          Risk overview
        </span>
        <span className={styles.headMeta}>
          <button
            type="button"
            className={styles.refresh}
            onClick={refresh}
            aria-label="Refresh risk data"
            title="Refresh risk data"
          >
            <RefreshCw size={13} className={isFetching ? styles.spinning : undefined} aria-hidden="true" />
          </button>
        </span>
      </header>

      <div className={styles.body}>
        <div className={styles.lead}>
          <span className={styles.eyebrow}>Learners at risk</span>
          <div className={styles.leadRow}>
            <span className={styles.leadValue}>{atRiskShown.toLocaleString()}</span>
            {delta !== null ? (
              <span
                className={cn(
                  styles.delta,
                  delta > 0 ? styles.deltaUp : delta < 0 ? styles.deltaDown : styles.deltaFlat,
                )}
                title={
                  delta === 0
                    ? "Unchanged since the previous checkpoint"
                    : `${delta > 0 ? "+" : ""}${delta} learner${Math.abs(delta) === 1 ? "" : "s"} since the previous checkpoint`
                }
              >
                <DeltaIcon size={13} aria-hidden="true" />
                {delta === 0 ? "steady" : Math.abs(delta)}
              </span>
            ) : null}
          </div>
          <p className={styles.leadSub}>
            <strong>{share}%</strong> of {total.toLocaleString()} shared learner
            {total === 1 ? "" : "s"} flagged
            {activeSchoolYear ? ` · ${activeSchoolYear.name}` : ""}
          </p>

          {hasHistory ? (
            <>
              <Sparkline values={history} gradientId={gradientId} />
              <p className={styles.sparkCaption}>Weekly checkpoints this term</p>
            </>
          ) : (
            <div className={styles.sparkEmpty}>
              History appears after the first risk snapshot of the term.
            </div>
          )}
        </div>

        <div className={styles.sep} aria-hidden="true" />

        <div className={styles.right}>
          <div className={styles.blockHead}>
            <span>Risk levels</span>
            <span className={styles.blockHint}>Click a level to focus</span>
          </div>
          <div className={styles.levels} role="group" aria-label="Focus by risk level">
            {LEVELS.map((level) => {
              const count = counts[level.key];
              const levelShare = total === 0 ? 0 : Math.round((count / total) * 100);
              const active = focus.level === level.key;
              return (
                <button
                  key={level.key}
                  type="button"
                  className={cn(styles.level, active && styles.levelActive)}
                  style={{ "--level-color": LEVEL_FILL[level.key] } as React.CSSProperties}
                  aria-pressed={active}
                  onClick={() => focus.toggleLevel(level.key)}
                >
                  <span className={styles.levelTop}>
                    <span
                      className={styles.dot}
                      style={{ background: LEVEL_FILL[level.key] }}
                      aria-hidden="true"
                    />
                    <span className={styles.levelLabel}>{level.label}</span>
                    <span className={styles.levelCount}>{count.toLocaleString()}</span>
                  </span>
                  <span className={styles.levelTrack} aria-hidden="true">
                    <span
                      className={styles.levelFill}
                      style={{
                        width: `${levelShare}%`,
                        background: LEVEL_FILL[level.key],
                      }}
                    />
                  </span>
                  <span className={styles.levelFoot}>
                    <span>{levelShare}% of shared</span>
                    <span className={styles.levelHint}>
                      {active ? "Focused" : level.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.blockHead}>
            <span>Risk factors</span>
            <span className={styles.blockHint}>Click a factor to filter</span>
          </div>
          <div className={styles.factors} role="group" aria-label="Focus by risk factor">
            {FACTORS.map((factor) => {
              const count = factors[factor.key];
              const active = focus.factor === factor.key;
              return (
                <button
                  key={factor.key}
                  type="button"
                  className={cn(styles.factor, active && styles.factorActive)}
                  style={{ "--factor-color": factor.color } as React.CSSProperties}
                  aria-pressed={active}
                  onClick={() => focus.toggleFactor(factor.key)}
                >
                  <span className={styles.factorTop}>
                    <span
                      className={styles.dot}
                      style={{ background: factor.color }}
                      aria-hidden="true"
                    />
                    <span>{factor.label}</span>
                    <span className={styles.factorCount}>{count.toLocaleString()}</span>
                  </span>
                  <span className={styles.factorTrack} aria-hidden="true">
                    <span
                      className={styles.factorFill}
                      style={{
                        width: `${Math.round((count / factorMax) * 100)}%`,
                        background: factor.color,
                      }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <footer className={styles.foot}>
        {focus.hasFocus ? (
          <>
            <span className={styles.footLabel}>Focused on</span>
            {focus.level ? (
              <button
                type="button"
                className={styles.chip}
                onClick={() => focus.toggleLevel(focus.level as Exclude<typeof focus.level, null>)}
              >
                {focus.level} risk
                <X size={11} aria-hidden="true" />
              </button>
            ) : null}
            {focus.factor ? (
              <button
                type="button"
                className={styles.chip}
                onClick={() => focus.toggleFactor(focus.factor as RiskFactor)}
              >
                {focus.factor} factor
                <X size={11} aria-hidden="true" />
              </button>
            ) : null}
            {focus.section ? (
              <button
                type="button"
                className={styles.chip}
                onClick={() => focus.toggleSection(focus.section as string)}
              >
                {focus.section}
                <X size={11} aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" className={styles.clear} onClick={focus.clear}>
              Clear all
            </button>
          </>
        ) : (
          <p className={styles.footTip}>
            Focus a level, factor or section to narrow the learner board below.
          </p>
        )}
      </footer>
    </section>
  );
}
