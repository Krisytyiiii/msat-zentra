import type { RiskLevelKey, RiskSnapshotStudent } from "../types";
import { planStatus } from "./intervention-helpers";

/** Broad, plain-language groups the briefing is organised around. */
export type CaseLane = "needs-plan" | "in-progress" | "recovering" | "all";
export type RiskFilter = "all" | RiskLevelKey;
export type FactorFilter = "all" | "Academic" | "Attendance" | "Behavioral";

export const RISK_COLOR: Record<RiskLevelKey, string> = {
  High: "#dc2626",
  Moderate: "#f59e0b",
  Low: "#16a34a",
};

export const FACTOR_META: Record<
  Exclude<FactorFilter, "all">,
  { label: string; short: string; color: string }
> = {
  Academic: { label: "Academic", short: "Grades", color: "#f59e0b" },
  Attendance: { label: "Attendance", short: "Attendance", color: "#22c55e" },
  Behavioral: { label: "Anecdotal", short: "Anecdotal", color: "#3b82f6" },
};

export const LANES: {
  key: CaseLane;
  label: string;
  hint: string;
}[] = [
  {
    key: "needs-plan",
    label: "No session yet",
    hint: "Guidance has not booked a session",
  },
  {
    key: "in-progress",
    label: "In progress",
    hint: "Guidance is working the case",
  },
  {
    key: "recovering",
    label: "Recovering",
    hint: "Resolved, or risk has dropped",
  },
  { key: "all", label: "All cases", hint: "Everyone flagged this term" },
];

const RISK_RANK: Record<string, number> = { High: 0, Moderate: 1, Low: 2 };
const LANE_RANK: Record<Exclude<CaseLane, "all">, number> = {
  "needs-plan": 0,
  "in-progress": 1,
  recovering: 2,
};

/** Which lane a learner belongs to. One learner is in exactly one lane. */
export function laneOf(student: RiskSnapshotStudent): Exclude<CaseLane, "all"> {
  const iv = student.intervention;
  if (iv?.outcomeStatus === "resolved") return "recovering";
  if (student.riskLevel === "Low") return "recovering";
  if (planStatus(student) === "ongoing") return "in-progress";
  return "needs-plan";
}

/** Whole days since the risk engine detected the learner, or null. */
export function ageInDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Human phrase for a detection age. */
export function humanAge(days: number | null): string {
  if (days === null) return "not scored yet";
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/**
 * Attention order: learners without a plan first, then by risk level, then by
 * the longest wait. A principal opening the page lands on the case that has
 * been ignored the longest.
 */
export function compareUrgency(a: RiskSnapshotStudent, b: RiskSnapshotStudent, now: number) {
  const lane = LANE_RANK[laneOf(a)] - LANE_RANK[laneOf(b)];
  if (lane !== 0) return lane;
  const risk = (RISK_RANK[a.riskLevel] ?? 3) - (RISK_RANK[b.riskLevel] ?? 3);
  if (risk !== 0) return risk;
  return (ageInDays(b.snapshotDate, now) ?? -1) - (ageInDays(a.snapshotDate, now) ?? -1);
}

export interface BriefingInsights {
  total: number;
  needsPlan: number;
  inProgress: number;
  recovering: number;
  high: number;
  moderate: number;
  low: number;
  withPlan: number;
  coveragePct: number;
  pendingApproval: number;
  oldestNeedDays: number | null;
  overTwoWeeks: number;
  waits: { underWeek: number; oneToTwo: number; overTwo: number };
  factors: { key: Exclude<FactorFilter, "all">; label: string; color: string; count: number }[];
  topFactor: { label: string; count: number } | null;
  sections: { section: string; count: number }[];
  subjects: { subject: string; count: number }[];
}

/** Everything the briefing and its insight rail state, derived from the cohort. */
export function buildInsights(students: RiskSnapshotStudent[], now: number): BriefingInsights {
  const counts: Record<Exclude<CaseLane, "all">, number> = {
    "needs-plan": 0,
    "in-progress": 0,
    recovering: 0,
  };
  const factorCounts = { Academic: 0, Attendance: 0, Behavioral: 0 };
  const sectionCounts = new Map<string, number>();
  const subjectCounts = new Map<string, number>();
  let high = 0;
  let moderate = 0;
  let low = 0;
  let withPlan = 0;
  let pendingApproval = 0;
  let oldestNeedDays: number | null = null;
  let overTwoWeeks = 0;
  const waits = { underWeek: 0, oneToTwo: 0, overTwo: 0 };

  for (const student of students) {
    counts[laneOf(student)] += 1;
    if (student.riskLevel === "High") high += 1;
    else if (student.riskLevel === "Moderate") moderate += 1;
    else low += 1;

    if (student.factors.academic) factorCounts.Academic += 1;
    if (student.factors.attendance) factorCounts.Attendance += 1;
    if (student.factors.behavioral) factorCounts.Behavioral += 1;

    if (student.section) {
      sectionCounts.set(student.section, (sectionCounts.get(student.section) ?? 0) + 1);
    }

    for (const subject of student.subjectGrades) {
      if (subject.belowThreshold) {
        subjectCounts.set(subject.subject, (subjectCounts.get(subject.subject) ?? 0) + 1);
      }
    }

    if (student.intervention) {
      withPlan += 1;
      if (student.intervention.approvalStatus === "pending") pendingApproval += 1;
    } else {
      const days = ageInDays(student.snapshotDate, now);
      if (days !== null) {
        oldestNeedDays = oldestNeedDays === null ? days : Math.max(oldestNeedDays, days);
        if (days > 14) overTwoWeeks += 1;
        if (days < 7) waits.underWeek += 1;
        else if (days <= 14) waits.oneToTwo += 1;
        else waits.overTwo += 1;
      }
    }
  }

  const total = students.length;
  const factors = (Object.keys(factorCounts) as (keyof typeof factorCounts)[]).map((key) => ({
    key,
    label: FACTOR_META[key].label,
    color: FACTOR_META[key].color,
    count: factorCounts[key],
  }));
  const top = [...factors].sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    total,
    needsPlan: counts["needs-plan"],
    inProgress: counts["in-progress"],
    recovering: counts.recovering,
    high,
    moderate,
    low,
    withPlan,
    coveragePct: total === 0 ? 0 : Math.round((withPlan / total) * 100),
    pendingApproval,
    oldestNeedDays,
    overTwoWeeks,
    waits,
    factors,
    topFactor: top && top.count > 0 ? { label: top.label, count: top.count } : null,
    sections: [...sectionCounts.entries()]
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count || a.section.localeCompare(b.section))
      .slice(0, 4),
    subjects: [...subjectCounts.entries()]
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject))
      .slice(0, 4),
  };
}

/** The sentence under the headline. Plain language, no jargon. */
export function narrativeFor(insights: BriefingInsights): string {
  const parts: string[] = [];
  const total = insights.total;
  parts.push(
    `${total.toLocaleString()} learner${total === 1 ? "" : "s"} flagged this term`,
  );

  if (insights.needsPlan > 0) {
    const wait =
      insights.oldestNeedDays === null
        ? ""
        : ` — the longest wait is ${humanAge(insights.oldestNeedDays)}`;
    parts.push(
      `${insights.needsPlan.toLocaleString()} still ${
        insights.needsPlan === 1 ? "has" : "have"
      } no guidance session booked${wait}`,
    );
  } else if (insights.inProgress > 0) {
    parts.push("every learner already has guidance involved");
  } else {
    parts.push("no learner is waiting on guidance");
  }

  if (insights.topFactor) {
    parts.push(
      `most flags come from ${insights.topFactor.label.toLowerCase()} (${
        insights.topFactor.count
      } learner${insights.topFactor.count === 1 ? "" : "s"})`,
    );
  }

  return `${parts.join(". ")}.`;
}

/** Headline sized to what the principal should act on first. */
export function headlineFor(insights: BriefingInsights): string {
  if (insights.total === 0) return "No interventions this term";
  if (insights.needsPlan > 0) {
    return `${insights.needsPlan.toLocaleString()} learner${
      insights.needsPlan === 1 ? "" : "s"
    } waiting on guidance`;
  }
  if (insights.inProgress > 0) {
    return `${insights.inProgress.toLocaleString()} plan${
      insights.inProgress === 1 ? "" : "s"
    } in motion`;
  }
  return "Every case has a plan";
}
