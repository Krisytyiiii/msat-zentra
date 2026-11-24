"use client";

import * as React from "react";
import { ChevronDown, Radar } from "lucide-react";
import { msSinceDate } from "@/lib/clock";
import type { PillTone } from "@/components/ui/pill";
import styles from "./detection-flow-panel.module.css";

/**
 * Minimum row shape both desks provide: the adviser board's intervention rows
 * and the guidance desk's at-risk students. Keeping the panel structural lets
 * one component serve both shells without either service owning it.
 */
export interface DetectionFlowRow {
  riskLevel: string;
  detectedAt: string | null;
  factors: { academic: boolean; attendance: boolean; behavioral: boolean };
  intervention: {
    outcomeStatus: string;
    sessions: { status: string }[];
  } | null;
}

export interface DetectionFlowSummary {
  /** Flagged learners on the board. */
  total: number;
  /** Cases still open at the counselling desk. */
  ongoing: number;
  /** Whole population the lanes sit in (adviser: the section roster). */
  scope?: number | null;
  /** Legacy alias for `scope` (the adviser summary's roster count). */
  advisees?: number;
}

/**
 * Guidance-desk pipeline label — the same vocabulary the adviser board and the
 * counselling queue use, so both desks read the case identically.
 */
function pipelineStatus(row: DetectionFlowRow): { label: string; tone: PillTone } {
  const intervention = row.intervention;
  const doneCount =
    intervention?.sessions.filter((session) => session.status === "completed").length ?? 0;
  const scheduledCount =
    intervention?.sessions.filter((session) => session.status === "scheduled").length ?? 0;

  if (!intervention) return { label: "No plan yet", tone: "neutral" };
  if (intervention.outcomeStatus === "resolved") return { label: "Done", tone: "green" };
  if (intervention.outcomeStatus === "unresolved")
    return { label: "Discontinued", tone: "neutral" };
  if (row.riskLevel === "Low") return { label: "No longer at risk", tone: "neutral" };
  if (intervention.sessions.length === 0) return { label: "No action yet", tone: "neutral" };
  if (scheduledCount > 0 && doneCount > 0) return { label: "Follow-up session", tone: "blue" };
  if (scheduledCount > 0) return { label: "Booked session", tone: "blue" };
  if (doneCount > 0) return { label: "Session done", tone: "green" };
  return { label: "No action yet", tone: "neutral" };
}

/**
 * A lane is one detection signal on the adviser's desk. The first three are
 * the risk engine's own flags; the last two are the guidance pipeline state a
 * flagged learner is sitting in, so the board reads detection → plan → action.
 */
export type DetectionLaneId =
  | "academic"
  | "attendance"
  | "behavioral"
  | "noPlan"
  | "followUp";

interface LaneDef {
  id: DetectionLaneId;
  label: string;
  hint: string;
  className: string;
}

const LANES: LaneDef[] = [
  {
    id: "academic",
    label: "Academic",
    hint: "Term average below 75",
    className: styles.laneAcademic,
  },
  {
    id: "attendance",
    label: "Attendance",
    hint: "Presence below 80%",
    className: styles.laneAttendance,
  },
  {
    id: "behavioral",
    label: "Anecdotal",
    hint: "Behavioural record on file",
    className: styles.laneBehavioral,
  },
  {
    id: "noPlan",
    label: "No plan",
    hint: "Flagged, no guidance case opened",
    className: styles.laneNoPlan,
  },
  {
    id: "followUp",
    label: "Follow-up",
    hint: "Case open at the counselling desk",
    className: styles.laneFollowUp,
  },
];

const LEVEL_RANK: Record<string, number> = { High: 0, Moderate: 1, Low: 2 };

/** Column centres — five equal lanes across the picture. */
const laneX = (index: number) => 10 + index * 20;

function laneMatches(id: DetectionLaneId, row: DetectionFlowRow): boolean {
  switch (id) {
    case "academic":
      return row.factors.academic;
    case "attendance":
      return row.factors.attendance;
    case "behavioral":
      return row.factors.behavioral;
    case "noPlan":
      return !row.intervention;
    case "followUp":
      return row.intervention?.outcomeStatus === "ongoing";
  }
}

interface LaneStat {
  def: LaneDef;
  count: number;
  /** Newest detection in the lane — the "when" of the flow column. */
  detectedAt: string | null;
  /** Worst level present, so a single high-risk advisee is never hidden. */
  level: string | null;
  /** Pipeline state of the newest detection in the lane. */
  status: { label: string; fullLabel: string; tone: PillTone } | null;
}

/** Elapsed time at one unit only — "1d ago", never "1d 23h 56m ago". */
function elapsed(detectedAt: string | null, now: number): string {
  const ms = detectedAt ? msSinceDate(detectedAt, now) : null;
  if (ms === null) return "—";
  if (ms < 60_000) return "just now";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}

/**
 * Column-width vocabulary: the guidance pipeline labels read well on the card
 * but overflow a lane column, so the head uses a shortened form and the
 * footer keeps the full one.
 */
const COMPACT_STATUS: Record<string, string> = {
  "No plan yet": "No plan",
  "No action yet": "No action",
  "Booked session": "Booked",
  "Follow-up session": "Follow-up",
  "Session done": "Done",
  Discontinued: "Stopped",
  "No longer at risk": "Recovered",
};

function compactStatus(label: string): string {
  return COMPACT_STATUS[label] ?? label;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts a figure up to its live value (the reference's run clock, in
 * miniature). Every lane and the headline count climb on the same clock.
 */
function useAnimatedCount(target: number, duration = 900): number {
  const [value, setValue] = React.useState(0);
  const shown = React.useRef(0);

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      shown.current = target;
      // Deferred so the effect body never sets state synchronously.
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    const from = shown.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      shown.current = next;
      setValue(next);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return Math.round(value);
}

/** One lane's figure — climbs on the same clock as the headline total. */
function CountUp({ value }: { value: number }) {
  const shown = useAnimatedCount(value, 700);
  return <>{shown}</>;
}

/** Source strands per lane; a third of them carry a travelling light. */
const STRANDS_PER_LANE = 13;

export function DetectionFlowPanel({
  rows,
  summary,
  now,
  activeLane,
  onLaneSelect,
  scopeLabel = "Advisees",
  unitOne = "advisee",
  unitMany = "advisees",
  emptyHint = "No advisees enlisted this term.",
  footNote = " Point at a lane to isolate it; click to filter the board.",
}: {
  rows: DetectionFlowRow[];
  summary: DetectionFlowSummary;
  now: number;
  activeLane: DetectionLaneId | null;
  onLaneSelect: (lane: DetectionLaneId) => void;
  /** Headline label above the big figure. */
  scopeLabel?: string;
  unitOne?: string;
  unitMany?: string;
  /** Shown when the panel has no learners at all. */
  emptyHint?: string;
  /** Tail copy after the idle summary line. */
  footNote?: string;
}) {
  const lanes = React.useMemo<LaneStat[]>(() => {
    return LANES.map((def) => {
      const members = rows.filter((row) => laneMatches(def.id, row));
      const newest = members.reduce<DetectionFlowRow | null>((best, row) => {
        const at = row.detectedAt ? Date.parse(row.detectedAt) : NaN;
        if (!Number.isFinite(at)) return best;
        const bestAt = best?.detectedAt ? Date.parse(best.detectedAt) : NaN;
        return !best || !Number.isFinite(bestAt) || at > bestAt ? row : best;
      }, null);
      const level =
        members.length === 0
          ? null
          : members
              .map((row) => row.riskLevel)
              .sort((a, b) => (LEVEL_RANK[a] ?? 9) - (LEVEL_RANK[b] ?? 9))[0] ?? null;
      const pipeline = newest ? pipelineStatus(newest) : null;
      return {
        def,
        count: members.length,
        detectedAt: newest?.detectedAt ?? null,
        level,
        status: pipeline
          ? {
              label: compactStatus(pipeline.label),
              fullLabel: pipeline.label,
              tone: pipeline.tone,
            }
          : null,
      };
    });
  }, [rows]);

  // The picture opens flat and settles: strands fade in, bands draw down,
  // figures climb.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Pointing at a lane (its labels or its band) isolates it — nothing is
  // written, the filter tab only changes on click.
  const [pointed, setPointed] = React.useState<DetectionLaneId | null>(null);
  const litLane = pointed ?? activeLane;
  const lit = lanes.find((lane) => lane.def.id === litLane) ?? null;

  const max = Math.max(1, ...lanes.map((lane) => lane.count));
  const flagged = summary.total;
  // Boards without a roster denominator (the guidance desk) show the flagged
  // count as the headline; the adviser board shows the whole section.
  const scope = summary.scope ?? summary.advisees ?? null;
  const headline = scope ?? flagged;
  const flaggedCount = useAnimatedCount(flagged);
  const headlineCount = useAnimatedCount(headline);

  const point = (id: DetectionLaneId) => setPointed(id);
  const release = () => setPointed(null);

  // Collapsible: the headline stays in place, the lanes slide out to the right
  // while the panel folds shut (no vertical "accordion drop" — the motion is
  // horizontal + height together).
  const [collapsed, setCollapsed] = React.useState(false);
  const bodyId = React.useId();

  return (
    <section
      className={styles.panel}
      aria-label="Detection flow"
      data-detection-collapsed={collapsed ? "true" : undefined}
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.eyebrow}>
            <Radar size={11} aria-hidden />
            Detection flow
          </p>
          <h3 className={styles.title}>Signals into this term’s caseload</h3>
        </div>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? "Expand detection flow" : "Collapse detection flow"}
        >
          <ChevronDown
            size={15}
            aria-hidden
            className={styles.collapseChevron}
            data-collapsed={collapsed ? "true" : undefined}
          />
        </button>
      </header>

      <div className={styles.collapsible} data-collapsed={collapsed ? "true" : undefined}>
        <div className={styles.collapsibleInner} id={bodyId} inert={collapsed || undefined}>
          {/* Column head: factor, figure, detection time, level, status. */}
          <div className={styles.columns}>
          {lanes.map((lane) => {
            const active = activeLane === lane.def.id;
            const isLit = litLane === lane.def.id;
            const dimmed = litLane !== null && !isLit;
            return (
              <button
                key={lane.def.id}
                type="button"
                className={`${styles.column} ${lane.def.className} ${
                  active ? styles.columnActive : ""
                }`}
                data-dimmed={dimmed ? "true" : undefined}
                data-lit={isLit ? "true" : undefined}
                onClick={() => onLaneSelect(lane.def.id)}
                onPointerEnter={() => point(lane.def.id)}
                onPointerLeave={release}
                onFocus={() => point(lane.def.id)}
                onBlur={release}
                aria-pressed={active}
                aria-label={`${lane.def.label} — ${lane.def.hint}`}
              >
                <span className={styles.columnLabel}>{lane.def.label}</span>
                <span className={styles.columnCount}>
                  <CountUp value={lane.count} />
                </span>
                <span className={styles.columnUnit}>
                  {lane.count === 1 ? unitOne : unitMany}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mesh of source strands falls from the top edge, bundles into each
            lane's node bar, then the five bands curve down into the total. */}
        <div className={styles.bands}>
          <svg
            className={styles.fan}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
            focusable="false"
          >
            {lanes.map((lane, index) => {
              const x = laneX(index);
              const isLit = litLane === lane.def.id;
              const dimmed = litLane !== null && !isLit;
              const width = 4 + (lane.count / max) * 12;
              const endX = 50 + (index - 2) * 3;
              const nodeTop = 26;
              const nodeBottom = 31;
              const band = `M ${x} ${nodeBottom} L ${x} 58 C ${x} 82 ${endX} 76 ${endX} 100`;
              const totalStrands = LANES.length * STRANDS_PER_LANE;
              return (
                <g
                  key={lane.def.id}
                  className={`${styles.laneGroup} ${lane.def.className}`}
                  data-dimmed={dimmed ? "true" : undefined}
                  data-lit={isLit ? "true" : undefined}
                >
                  {Array.from({ length: STRANDS_PER_LANE }, (_, s) => {
                    // Every lane's strands enter across the whole top edge, so
                    // the mesh crosses itself the way the reference fabric does.
                    const slot = index * STRANDS_PER_LANE + s;
                    const startX = -4 + (slot / (totalStrands - 1)) * 108;
                    const d = `M ${startX.toFixed(2)} -4 C ${startX.toFixed(2)} 13, ${x} 15, ${x} ${nodeTop}`;
                    const light = s % 3 === 0;
                    return (
                      <React.Fragment key={s}>
                        <path
                          className={styles.strand}
                          d={d}
                          pathLength={100}
                          vectorEffect="non-scaling-stroke"
                        />
                        {light ? (
                          <path
                            className={styles.strandChunk}
                            d={d}
                            pathLength={100}
                            vectorEffect="non-scaling-stroke"
                            style={{ animationDelay: `-${s * 0.37 + index * 0.6}s` }}
                          />
                        ) : null}
                      </React.Fragment>
                    );
                  })}

                  {/* Lane node bar — where the strands bundle before the band. */}
                  <path
                    className={styles.node}
                    d={`M ${x} ${nodeTop} L ${x} ${nodeBottom}`}
                    strokeWidth={5}
                    vectorEffect="non-scaling-stroke"
                  />

                  <path
                    className={styles.band}
                    d={band}
                    pathLength={100}
                    strokeWidth={width}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      strokeDasharray: "100",
                      strokeDashoffset: mounted ? "0" : "100",
                      transitionDelay: `${index * 70}ms`,
                    }}
                  />
                  {/* Travelling light inside the band — one chunk, always on. */}
                  <path
                    className={styles.bandFlow}
                    d={band}
                    pathLength={100}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      strokeDasharray: "3 100",
                      animationDelay: `-${index * 0.9}s`,
                      opacity: mounted ? undefined : 0,
                    }}
                  />
                  {isLit ? (
                    <path
                      className={styles.surge}
                      d={band}
                      pathLength={100}
                      strokeDasharray="5 95"
                      strokeWidth={Math.max(2, width * 0.4)}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}

                  {/* Hover/click target over the lane's band column. */}
                  <rect
                    className={styles.hit}
                    x={x - 10}
                    y={0}
                    width={20}
                    height={70}
                    onPointerEnter={() => point(lane.def.id)}
                    onPointerLeave={release}
                    onClick={() => onLaneSelect(lane.def.id)}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className={styles.total}>
          <p className={styles.totalLabel}>{scopeLabel}</p>
          <p className={styles.totalValue}>{headlineCount.toLocaleString()}</p>
          <p className={styles.totalCaption}>
            {flaggedCount} flagged · {summary.ongoing} in follow-up
          </p>
        </div>

        <p className={styles.foot}>
          {lit ? (
            <>
              <strong className={styles.footStrong}>{lit.def.label}</strong> — {lit.count}{" "}
              {lit.count === 1 ? unitOne : unitMany}
              {scope !== null ? ` of ${scope} ${unitMany}` : ""} · newest{" "}
              {elapsed(lit.detectedAt, now)}
              {lit.status ? ` · ${lit.status.fullLabel}` : ""}
              {activeLane === lit.def.id ? " · filtering" : ""}
            </>
          ) : headline === 0 ? (
            emptyHint
          ) : scope !== null ? (
            <>
              {Math.round((flagged / Math.max(1, scope)) * 100)}% of your {unitMany} are
              flagged.{footNote}
            </>
          ) : (
            <>
              {flagged} flagged this term.{footNote}
            </>
          )}
        </p>
        </div>
      </div>
    </section>
  );
}
