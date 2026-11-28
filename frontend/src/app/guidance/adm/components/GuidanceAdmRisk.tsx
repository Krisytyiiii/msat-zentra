"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ClipboardList,
  HeartPulse,
  type LucideIcon,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KanbanBoard } from "@/components/ui/kanban-board";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import cascade from "@/components/shared/desk-cascade.module.css";
import {
  interpretCategoryMix,
  interpretCategoryTrend,
  interpretLevelMix,
  type CategorySlice,
  type CategoryTrend,
  type LevelSlice,
  type RiskDashboard,
  type RiskLevelBucket,
} from "@/components/risk-dashboard/risk-dashboard-data";
import { GuidanceAdmInterpretation } from "./guidance-adm-interpretation";
import { GuidanceAdmValuePill } from "./guidance-adm-value-pill";
import { AMBER_STEPS } from "./guidance-adm-palette";
import type { RiskWatchData } from "../../risk/components/GuidanceRiskWatch";
import { useGuidanceAdmRiskData } from "./use-guidance-adm-risk-data";
import { GuidanceAdmRiskSkeleton } from "./GuidanceAdmSkeleton";
import reportStyles from "./guidance-adm-reports.module.css";
import styles from "./guidance-adm.module.css";
import alertsStyles from "../../alerts/components/guidance-alerts-table.module.css";

const TOOLTIP_STYLE: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
};

const LEVEL_COLORS: Record<RiskLevelBucket, string> = {
  High: AMBER_STEPS[0],
  Moderate: AMBER_STEPS[1],
  Low: AMBER_STEPS[2],
  Unassessed: AMBER_STEPS[3],
};

function BoardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="text-primary" aria-hidden>
      <Icon size={14} />
    </span>
  );
}

function StudentsByLevel({
  mix,
  totalStudents,
  interpretation,
  deskLabel,
}: {
  mix: LevelSlice[];
  totalStudents: number;
  interpretation: string;
  deskLabel: string;
}) {
  return (
    <KanbanBoard
      title="Students by risk level"
      icon={<BoardIcon icon={HeartPulse} />}
      description={`Live levels for learners with a case on the ${deskLabel} desk.`}
      className="flex-1"
      footer={<GuidanceAdmInterpretation>{interpretation}</GuidanceAdmInterpretation>}
    >
      {totalStudents === 0 ? (
        <p className={reportStyles.empty}>No students on the desk yet.</p>
      ) : (
        <div className={reportStyles.split}>
          <div className={reportStyles.donutWrap}>
            <ResponsiveContainer width="100%" height={168}>
              <PieChart>
                <Pie
                  data={mix}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {mix.map((d) => (
                    <Cell key={d.key} fill={LEVEL_COLORS[d.key]} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ zIndex: 50 }}
                  content={({ active, payload }) => {
                    const row = active
                      ? (payload?.[0]?.payload as LevelSlice | undefined)
                      : undefined;
                    if (!row) return null;
                    const pct =
                      totalStudents > 0
                        ? Math.round((row.count / totalStudents) * 100)
                        : 0;
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-lg">
                        <p className="font-semibold">{row.label}</p>
                        <p className="mt-1 text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {row.count}
                          </span>{" "}
                          {row.count === 1 ? "student" : "students"} ·{" "}
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {pct}%
                          </span>
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className={reportStyles.donutCenter}>
              <span className={reportStyles.donutValue}>{totalStudents}</span>
              <span className={reportStyles.donutCaption}>students</span>
            </div>
          </div>
          <ul className={reportStyles.legend}>
            {mix.map((s) => (
              <li key={s.key} className={reportStyles.legendItem}>
                <span className={reportStyles.legendLabel}>
                  <span
                    className={reportStyles.legendDot}
                    style={{ backgroundColor: LEVEL_COLORS[s.key] }}
                    aria-hidden
                  />
                  {s.label}
                </span>
                <span className={reportStyles.legendCount}>
                  <GuidanceAdmValuePill
                    count={s.count}
                    percent={
                      totalStudents > 0
                        ? Math.round((s.count / totalStudents) * 100)
                        : 0
                    }
                    label={`${s.label} students and their share of students with a risk level`}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </KanbanBoard>
  );
}

function RiskCasesByCategory({
  rows,
  interpretation,
  deskLabel,
}: {
  rows: CategorySlice[];
  interpretation: string;
  deskLabel: string;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const height = Math.max(140, rows.length * 28 + 8);
  return (
    <KanbanBoard
      title="Risk cases by category"
      icon={<BoardIcon icon={ClipboardList} />}
      description={`What the ${deskLabel} desk cases are about.`}
      className="flex-1"
      footer={<GuidanceAdmInterpretation>{interpretation}</GuidanceAdmInterpretation>}
    >
      {rows.length === 0 ? (
        <p className={reportStyles.empty}>No categorized cases yet.</p>
      ) : (
        <div
          className={reportStyles.barChart}
          role="img"
          aria-label={`Risk cases by category: ${rows.map((r) => `${r.label} ${r.count}`).join(", ")}`}
        >
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 2, right: 28, bottom: 2, left: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={104}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                cursor={false}
                wrapperStyle={{ zIndex: 50 }}
                content={({ active, payload }) => {
                  const row = active
                    ? (payload?.[0]?.payload as CategorySlice | undefined)
                    : undefined;
                  if (!row) return null;
                  const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-lg">
                      <p className="font-semibold">{row.label}</p>
                      <p className="mt-1 text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {row.count}
                        </span>{" "}
                        {row.count === 1 ? "case" : "cases"} ·{" "}
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {pct}%
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" barSize={12} radius={[2, 4, 4, 2]}>
                {rows.map((d, i) => (
                  <Cell key={d.key} fill={AMBER_STEPS[i % AMBER_STEPS.length]} />
                ))}
                <LabelList
                  dataKey="count"
                  position="right"
                  fontSize={12}
                  fontWeight={600}
                  fill={AMBER_STEPS[0]}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </KanbanBoard>
  );
}

function RiskTrend({
  trend,
  interpretation,
}: {
  trend: CategoryTrend;
  interpretation: string;
}) {
  const points = React.useMemo(
    () =>
      trend.weeks.map((w, i) => {
        const point: Record<string, string | number> = { week: w.label };
        for (const s of trend.series) point[s.key] = s.counts[i] ?? 0;
        return point;
      }),
    [trend],
  );
  return (
    <KanbanBoard
      title="Referrals by category over time"
      icon={<BoardIcon icon={TrendingUp} />}
      description="Cases per week by category — last 12 weeks."
      className="flex-1"
      footer={<GuidanceAdmInterpretation>{interpretation}</GuidanceAdmInterpretation>}
    >
      {trend.total === 0 ? (
        <p className={reportStyles.empty}>No referrals in the last 12 weeks.</p>
      ) : (
        <>
          <div className={reportStyles.trendWrap}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={points}
                margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  wrapperStyle={{ zIndex: 50 }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => `Week of ${label}`}
                />
                {trend.series.map((s, i) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={AMBER_STEPS[i % AMBER_STEPS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className={reportStyles.legend} aria-label="Categories">
            {trend.series.map((s, i) => (
              <li key={s.key} className={reportStyles.legendItem}>
                <span className={reportStyles.legendLabel}>
                  <span
                    className={reportStyles.legendDot}
                    style={{
                      backgroundColor: AMBER_STEPS[i % AMBER_STEPS.length],
                    }}
                    aria-hidden
                  />
                  {s.label}
                </span>
                <span className={reportStyles.legendCount}>
                  <GuidanceAdmValuePill
                    count={s.counts.reduce((a, n) => a + n, 0)}
                    percent={
                      trend.total > 0
                        ? Math.round(
                            (s.counts.reduce((a, n) => a + n, 0) / trend.total) *
                              100,
                          )
                        : 0
                    }
                    label={`${s.label} cases and their share of referrals over 12 weeks`}
                  />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </KanbanBoard>
  );
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  const [last, ...rest] = parts.slice().reverse();
  return `${rest.reverse().join(", ")} and ${last}`;
}

function watchSummary(data: RiskWatchData): string {
  const known = data.urgent + data.watch + data.okay;
  if (known === 0) {
    return data.unknown > 0
      ? `Risk info is missing for ${data.unknown} student${data.unknown === 1 ? "" : "s"} — levels will appear here once the lookup resolves.`
      : "Risk levels will appear here once referred students resolve one.";
  }
  const parts: string[] = [];
  if (data.urgent > 0)
    parts.push(`${data.urgent} need${data.urgent === 1 ? "s" : ""} urgent attention`);
  if (data.watch > 0) parts.push(`${data.watch} to keep an eye on`);
  if (data.okay > 0) parts.push(`${data.okay} doing okay`);
  return `${joinParts(parts)}.`;
}

function WhoNeedsAttention({
  data,
  basePath,
  otherSegment,
}: {
  data: RiskWatchData;
  basePath: string;
  otherSegment: string;
}) {
  const router = useRouter();
  const known = data.urgent + data.watch + data.okay;
  const interpretation =
    known === 0
      ? "Start with the levels below until risk levels load."
      : data.urgent > 0
        ? "Open their names first — the flagged concerns tell you what to check."
        : data.watch > 0
          ? "Nobody needs urgent attention right now — keep an eye on the watch group."
          : "Everyone referred is doing okay — hold the line with routine follow-through.";
  return (
    <KanbanBoard
      title="Who needs attention first"
      icon={<BoardIcon icon={ShieldAlert} />}
      description="High-risk students in plain words — names open their timeline."
      className="flex-1"
      footer={<GuidanceAdmInterpretation>{interpretation}</GuidanceAdmInterpretation>}
    >
      <p className="px-1 text-[12px] leading-relaxed text-foreground">
        {watchSummary(data)}
      </p>
      {data.watchlist.length > 0 ? (
        <div className={alertsStyles.tableWrap}>
          <Table className={`${cascade.table} w-full table-fixed`}>
            <TableHeader>
              <TableRow className="bg-muted/50 [&>th]:border-t-0">
                <TableHead className="h-10 truncate">Learner</TableHead>
                <TableHead style={{ width: 170 }} className="h-10 truncate">
                  Section
                </TableHead>
                <TableHead style={{ width: 90 }} className="h-10 truncate">
                  Risk
                </TableHead>
                <TableHead style={{ width: 220 }} className="h-10 truncate">
                  Flagged concerns
                </TableHead>
                <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.watchlist.map((s, index) => {
                const href = `${basePath}/${
                  s.kind === "ADM" ? "adm" : otherSegment
                }?highlight=${s.referralId}`;
                const open = () => router.push(href);
                return (
                  <TableRow
                    key={s.studentId}
                    onClick={open}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open();
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Open the case for ${s.student}`}
                    className={alertsStyles.alertRow}
                    style={{ animationDelay: `${Math.min(index, 5) * 120}ms` }}
                  >
                    <TableCell className="truncate">
                      <span className="flex min-w-0 items-center gap-2">
                        <StudentMascot
                          name={s.student}
                          seed={s.student}
                          size={28}
                        />
                        <span className="min-w-0">
                          <span
                            className="block truncate text-[13px] font-semibold text-primary"
                            title={s.student}
                          >
                            {s.student}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                            {s.kind || "Referral"}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="truncate">
                      <span className="block truncate text-[12px] font-medium text-foreground">
                        {s.section || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="truncate">
                      <span
                        className="text-[12px] font-semibold text-red-600 dark:text-red-400"
                        title="Risk level"
                      >
                        High
                      </span>
                    </TableCell>
                    <TableCell className="truncate">
                      <span
                        className="block truncate text-[12px] text-muted-foreground"
                        title={s.drivers.join(", ")}
                      >
                        {s.drivers.length > 0 ? s.drivers.join(", ") : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="truncate">
                      <ChevronRight
                        size={15}
                        className="text-muted-foreground"
                        aria-hidden
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {data.topDriver ? (
        <p className="px-1 text-xs text-muted-foreground">
          Most flagged concern:{" "}
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {data.topDriver}
          </span>{" "}
          ({data.topDriverCount}{" "}
          {data.topDriverCount === 1 ? "student" : "students"}).
        </p>
      ) : null}
    </KanbanBoard>
  );
}

/** Risk data shared by both report desks. */
export interface AdmRiskBoardsData {
  isPending: boolean;
  dashboard: RiskDashboard | null;
  trend: CategoryTrend | null;
  watch: RiskWatchData | null;
}

/**
 * Risk boards shared by /guidance/reports and /nurse/reports — identical
 * markup and palette, only the desk wording and case deep-links differ.
 */
export function AdmRiskBoards({
  data,
  desk = "guidance",
}: {
  data: AdmRiskBoardsData;
  desk?: "guidance" | "nurse";
}) {
  const { isPending, dashboard, trend, watch } = data;
  const deskLabel = desk === "nurse" ? "clinic" : "guidance";
  const basePath = desk === "nurse" ? "/nurse/referrals" : "/guidance/referrals";
  const otherSegment = desk === "nurse" ? "clinic" : "counseling";

  if (isPending || !dashboard || !trend || !watch) {
    return <GuidanceAdmRiskSkeleton />;
  }

  return (
    <>
      <div className={styles.insightsGrid}>
        <StudentsByLevel
          mix={dashboard.levelMix}
          totalStudents={dashboard.totalStudents}
          interpretation={interpretLevelMix(
            dashboard.levelMix,
            dashboard.totalStudents,
            desk === "nurse" ? "clinic" : "guidance",
          )}
          deskLabel={deskLabel}
        />
        <RiskCasesByCategory
          rows={dashboard.categoryRows}
          interpretation={interpretCategoryMix(
            dashboard.categoryRows,
            dashboard.totalCases,
          )}
          deskLabel={deskLabel}
        />
      </div>
      <RiskTrend trend={trend} interpretation={interpretCategoryTrend(trend)} />
      <WhoNeedsAttention
        data={watch}
        basePath={basePath}
        otherSegment={otherSegment}
      />
    </>
  );
}

/**
 * Risk section for /guidance/reports — the old /guidance/risk dashboard
 * rebuilt with the page's kanban boards and amber palette.
 */
export function GuidanceAdmRisk() {
  return <AdmRiskBoards data={useGuidanceAdmRiskData()} desk="guidance" />;
}
