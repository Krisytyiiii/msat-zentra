"use client";

import * as React from "react";
import {
  Award,
  GraduationCap,
  School,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import type { SectionSummary } from "@/services/principal/academics";

interface AcademicsSummaryProps {
  sections: SectionSummary[];
  loading: boolean;
}

interface Tile extends StatDeckItem {
  icon: LucideIcon;
}

function mean(values: number[]): number | null {
  const usable = values.filter((n) => Number.isFinite(n));
  if (usable.length === 0) return null;
  return usable.reduce((sum, n) => sum + n, 0) / usable.length;
}

/**
 * Frozen summary deck for the academics board — the academic figures over the
 * active term, rendered through the shared `StatDeck` so it matches every other
 * desk's stat strip. Only adviser-shared sections contribute to the
 * learner/average/at-risk numbers, so the foot note explains why the totals
 * can be lower than the section count.
 */
export function AcademicsSummary({ sections, loading }: AcademicsSummaryProps) {
  const shared = React.useMemo(
    () => sections.filter((s) => s.shared === true),
    [sections],
  );

  // Distinct advisers with sharing ON — mirrors the learners/average/at-risk
  // gate, so the tile can never claim more sharing than the numbers below.
  const advisersSharing = React.useMemo(() => {
    const ids = new Set(
      shared.map((s) => s.adviserId).filter((id): id is string => !!id),
    );
    return ids.size > 0 ? ids.size : shared.length;
  }, [shared]);

  const learners = shared.reduce((sum, s) => sum + (s.students?.length ?? 0), 0);
  const average = mean(shared.map((s) => Number(s.avgTransmuted)));
  const atRisk = shared.reduce((sum, s) => sum + (Number(s.atRiskCount) || 0), 0);
  const passRate = mean(shared.map((s) => Number(s.passPct)));

  const tiles: Tile[] = [
    {
      key: "sections",
      icon: School,
      label: "Sections",
      unit: "sections",
      value: String(sections.length),
      hint:
        sections.length === 0
          ? "No sections this term"
          : `${shared.length} of ${sections.length} sharing data`,
    },
    {
      key: "advisers",
      icon: Users,
      label: "Advisers sharing",
      unit: "advisers",
      value: String(advisersSharing),
      hint:
        advisersSharing === 0
          ? "No adviser has shared yet"
          : "Turned on student data sharing",
    },
    {
      key: "learners",
      icon: GraduationCap,
      label: "Learners",
      unit: "learners",
      value: learners.toLocaleString("en-PH"),
      hint: "Enrolled in shared sections",
    },
    {
      key: "average",
      icon: Award,
      label: "Average grade",
      unit: "transmuted",
      value: average === null ? "—" : average.toFixed(1),
      hint:
        passRate === null
          ? "No grades recorded yet"
          : `${Math.round(passRate)}% of learners passing`,
    },
    {
      key: "risk",
      icon: ShieldAlert,
      label: "At-risk learners",
      unit: "flagged",
      value: String(atRisk),
      hint: atRisk === 0 ? "No learners flagged" : "Flagged by the risk engine",
      tone: atRisk > 0 ? "amber" : undefined,
    },
  ];

  const hiddenSections = sections.length - shared.length;

  return (
    <StatDeck
      title="This term at a glance"
      icon={School}
      ariaLabel="Academics summary"
      items={tiles}
      loading={loading}
      footer={
        !loading && hiddenSections > 0
          ? `${hiddenSections} section${
              hiddenSections === 1 ? " has" : "s have"
            } data sharing turned off, so their learners and grades are not counted above.`
          : undefined
      }
    />
  );
}
