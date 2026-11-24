"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NurseBreakdownRow } from "@/services/nurse/nurse.types";
import type { LucideIcon } from "lucide-react";
import { Activity, ClipboardList, Send } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { InsightCallout } from "@/components/ui/insight-callout";
import { NurseEmptyState } from "../../components/NurseEmptyCard";
import { NurseChartTooltip, NURSE_TOOLTIP_Z_INDEX } from "./nurse-chart-tooltip";
import styles from "./nurse-overview.module.css";

// Amber ramp — the rail's accent (tailwind amber-500), so the donut slices
// and bars share the page's action color. Same shade steps as before.
const AMBER = "oklch(0.769 0.188 70.08)"; // amber-500
const SHADES = [
  AMBER,
  `color-mix(in oklch, ${AMBER}, transparent 25%)`,
  `color-mix(in oklch, ${AMBER}, transparent 45%)`,
  `color-mix(in oklch, ${AMBER}, transparent 60%)`,
  `color-mix(in oklch, ${AMBER}, transparent 72%)`,
  `color-mix(in oklch, ${AMBER}, transparent 82%)`,
  `color-mix(in oklch, ${AMBER}, transparent 89%)`,
];

interface Slice extends NurseBreakdownRow {
  percent: number;
  fill: string;
}

function buildSlices(rows: NurseBreakdownRow[]): { slices: Slice[]; total: number } {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const ranked = [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const slices = ranked.map((r, i) => ({
    ...r,
    percent: total > 0 ? Math.round((r.count / total) * 100) : 0,
    fill: SHADES[i] ?? SHADES[SHADES.length - 1],
  }));
  return { slices, total };
}

/** Board header icon — same slot as the main "Latest referred students" board. */
function BoardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="text-primary" aria-hidden>
      <Icon size={14} />
    </span>
  );
}

/** Uniform "What it means" footer — the shared insight callout, pinned low. */
function Interpretation({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.footerSlot}>
      <InsightCallout className={styles.interpretation}>
        <span className={styles.interpretationLabel}>What it means · </span>
        {children}
      </InsightCallout>
    </div>
  );
}

/** One chart per kanban board: header (icon, title, total) + description +
    the chart itself, chromeless rows — same shell as the case board above. */
function BarPanel({
  title,
  description,
  rows,
  emptyTitle,
  emptyText,
  icon: Icon,
}: {
  title: string;
  description: string;
  rows: NurseBreakdownRow[];
  emptyTitle: string;
  emptyText: string;
  icon: LucideIcon;
}) {
  const { slices, total } = buildSlices(rows);
  const height = Math.max(120, slices.length * 28 + 8);
  const isEmpty = rows.length === 0;

  return (
    <KanbanBoard
      title={title}
      icon={<BoardIcon icon={Icon} />}
      count={total}
      description={description}
      className="flex-1"
    >
      {isEmpty ? (
        <NurseEmptyState icon={Icon} title={emptyTitle} hint={emptyText} />
      ) : (
        <div
          className={`${styles.barChart} relative`}
          role="img"
          aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.count} (${s.percent}%)`).join(", ")}`}
        >
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={slices} layout="vertical" margin={{ top: 2, right: 28, bottom: 2, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={104} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={false}
                content={
                  <NurseChartTooltip
                    formatValue={(item) =>
                      item.payload?.percent !== undefined
                        ? `${item.value} (${item.payload.percent}%)`
                        : item.value
                    }
                  />
                }
                wrapperStyle={NURSE_TOOLTIP_Z_INDEX}
              />
              <Bar dataKey="count" name="Cases" barSize={12} radius={[2, 4, 4, 2]}>
                {slices.map((d) => (
                  <Cell key={d.key} fill={d.fill} />
                ))}
                <LabelList dataKey="count" position="right" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Interpretation>
        {isEmpty
          ? "No cases in this view yet — referrals will fill the bars as they arrive."
          : `${slices[0].label} leads with ${slices[0].count} ${
              slices[0].count === 1 ? "case" : "cases"
            } — ${slices[0].percent}% of ${total}.`}
      </Interpretation>
    </KanbanBoard>
  );
}

/* Semicircular gauge geometry: one arc, r=80 in a 200×118 viewBox. */
const GAUGE_RADIUS = 80;
const GAUGE_ARC = Math.PI * GAUGE_RADIUS;
const GAUGE_PATH = `M 20 104 A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 1 180 104`;

/**
 * ADM caseload as a gauge: one semicircular dial whose segments are the ADM
 * actions, sized by their share of the case total. Reads as a single
 * "how were the ADM cases handled" needle at a glance, where the other two
 * panels break their rows down bar by bar.
 */
function GaugePanel({
  title,
  description,
  rows,
  emptyTitle,
  emptyText,
  unit,
  icon: Icon,
}: {
  title: string;
  description: string;
  rows: NurseBreakdownRow[];
  emptyTitle: string;
  emptyText: string;
  unit: string;
  icon: LucideIcon;
}) {
  const { slices, total } = buildSlices(rows);
  const isEmpty = rows.length === 0;
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [tip, setTip] = React.useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);

  // Pointer position is kept relative to the dial so the tooltip can follow
  // the cursor while staying inside the panel.
  const showTip =
    (key: string) => (event: React.MouseEvent<SVGPathElement>) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTip({
        key,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

  const lengths = slices.map((s) =>
    total > 0 ? (s.count / total) * GAUGE_ARC : 0
  );
  const segments = slices.map((s, i) => {
    const length = lengths[i];
    // A hairline between neighbouring arcs keeps the shades legible; a lone
    // segment stays unbroken.
    const gap = slices.length > 1 ? Math.min(3, length / 3) : 0;
    return {
      ...s,
      dash: `${Math.max(0.5, length - gap)} ${GAUGE_ARC}`,
      offset: -lengths.slice(0, i).reduce((sum, prev) => sum + prev, 0),
    };
  });

  const hovered = tip ? slices.find((s) => s.key === tip.key) : undefined;

  return (
    <KanbanBoard
      title={title}
      icon={<BoardIcon icon={Icon} />}
      count={total}
      description={description}
      className="flex-1"
    >
      {isEmpty ? (
        <NurseEmptyState icon={Icon} title={emptyTitle} hint={emptyText} />
      ) : (
        <div
          className={styles.gaugeChart}
          role="img"
          aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.count} (${s.percent}%)`).join(", ")}`}
        >
          <div className={styles.gaugeWrap} ref={wrapRef}>
            <svg
              className={styles.gaugeSvg}
              viewBox="0 0 200 118"
              aria-hidden="true"
              focusable="false"
              onMouseLeave={() => setTip(null)}
            >
              <path className={styles.gaugeTrack} d={GAUGE_PATH} />
              {segments.map((s) => (
                <path
                  key={s.key}
                  className={styles.gaugeSegment}
                  d={GAUGE_PATH}
                  stroke={s.fill}
                  strokeDasharray={s.dash}
                  strokeDashoffset={s.offset}
                  onMouseEnter={showTip(s.key)}
                  onMouseMove={showTip(s.key)}
                />
              ))}
            </svg>
            <div className={styles.gaugeCenter} aria-hidden="true">
              <span className={styles.gaugeValue}>{total}</span>
              <span className={styles.gaugeLabel}>{unit}</span>
            </div>
            {tip && hovered ? (
              <div
                className={styles.gaugeTip}
                style={{
                  left: `clamp(4.75rem, ${tip.x}px, calc(100% - 4.75rem))`,
                  top: tip.y,
                }}
              >
                <NurseChartTooltip
                  active
                  label={hovered.label}
                  payload={[
                    {
                      name: "Cases",
                      value: `${hovered.count} (${hovered.percent}%)`,
                      payload: { fill: hovered.fill },
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>

          <ul className={styles.gaugeLegend}>
            {slices.map((s) => (
              <li key={s.key} className={styles.gaugeLegendItem}>
                <span
                  className={styles.swatch}
                  style={{ background: s.fill }}
                  aria-hidden="true"
                />
                <span className={styles.gaugeLegendLabel}>{s.label}</span>
                <span className={styles.gaugeLegendValue}>
                  {s.count}
                  <span className={styles.gaugeLegendPct}>{s.percent}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Interpretation>
        {isEmpty
          ? `No ${unit} yet — referred ADM cases will fill this dial once the desk receives them.`
          : `${slices[0].label} is the largest share — ${slices[0].percent}% of ${total} ${unit}.`}
      </Interpretation>
    </KanbanBoard>
  );
}

function DonutPanel({
  title,
  description,
  rows,
  emptyTitle,
  emptyText,
  unit,
  icon: Icon,
}: {
  title: string;
  description: string;
  rows: NurseBreakdownRow[];
  emptyTitle: string;
  emptyText: string;
  unit: string;
  icon: LucideIcon;
}) {
  const { slices, total } = buildSlices(rows);
  const isEmpty = rows.length === 0;

  return (
    <KanbanBoard
      title={title}
      icon={<BoardIcon icon={Icon} />}
      count={total}
      description={description}
      className="flex-1"
    >
      {isEmpty ? (
        <NurseEmptyState icon={Icon} title={emptyTitle} hint={emptyText} />
      ) : (
        <div
          className={`${styles.chartRow} relative`}
          role="img"
          aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.count} (${s.percent}%)`).join(", ")}`}
        >
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={132}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="label"
                  innerRadius="64%"
                  outerRadius="100%"
                  paddingAngle={2}
                  stroke="transparent"
                  isAnimationActive
                  animationDuration={700}
                >
                  {slices.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  content={
                    <NurseChartTooltip
                      formatValue={(item) =>
                        item.payload?.percent !== undefined
                          ? `${item.value} (${item.payload.percent}%)`
                          : item.value
                      }
                    />
                  }
                  wrapperStyle={NURSE_TOOLTIP_Z_INDEX}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.center} aria-hidden="true">
              <span className={styles.centerValue}>{total}</span>
              <span className={styles.centerLabel}>{unit}</span>
            </div>
          </div>

          <ul className={styles.legend}>
            {slices.map((s) => (
              <li key={s.key} className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: s.fill }} aria-hidden="true" />
                <span className={styles.legendLabel}>{s.label}</span>
                <span className={styles.legendValue}>
                  <span className={styles.legendPill}>
                    <span className={styles.legendPillCount}>{s.count}</span>
                    <span className={styles.legendPillPercent} style={{ color: AMBER }}>
                      {s.percent}%
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Interpretation>
        {isEmpty
          ? `No ${unit} yet — referred cases will fill this once the desk receives them.`
          : `${slices[0].label} is the largest share — ${slices[0].percent}% of ${total} ${unit}.`}
      </Interpretation>
    </KanbanBoard>
  );
}

export function NurseOverviewBreakdown({
  statusBreakdown,
  clinicStatusBreakdown,
  admStatusBreakdown,
}: {
  statusBreakdown: NurseBreakdownRow[];
  clinicStatusBreakdown: NurseBreakdownRow[];
  admStatusBreakdown: NurseBreakdownRow[];
}) {
  return (
    <div className={styles.threeCol}>
      <DonutPanel
        title="Caseload by status"
        description="Every referred case — ADM and clinic matters — by the same actions as the case lists."
        rows={statusBreakdown}
        emptyTitle="No cases yet"
        emptyText="Cases referred to the clinic will appear here."
        icon={Activity}
        unit={statusBreakdown.reduce((n, r) => n + r.count, 0) === 1 ? "case" : "cases"}
      />
      <BarPanel
        title="Clinic matters caseload"
        description="Referred clinic matters, by clinic action."
        rows={clinicStatusBreakdown}
        emptyTitle="No clinic cases yet"
        emptyText="Clinic matters referred to you will appear here."
        icon={ClipboardList}
      />
      <GaugePanel
        title="ADM cases caseload"
        description="Referred ADM cases, by ADM action."
        rows={admStatusBreakdown}
        emptyTitle="No ADM cases yet"
        emptyText="ADM cases referred to you will appear here."
        icon={Send}
        unit={admStatusBreakdown.reduce((n, r) => n + r.count, 0) === 1 ? "case" : "cases"}
      />
    </div>
  );
}
