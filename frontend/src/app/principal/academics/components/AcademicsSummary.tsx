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
import { Skeleton } from "@/components/ui/skeleton";
import type { SectionSummary } from "@/services/principal/academics";
import styles from "./AcademicsSummary.module.css";

interface AcademicsSummaryProps {
  sections: SectionSummary[];
  loading: boolean;
}

interface Tile {
  key: string;
  icon: LucideIcon;
  /** Tile label — the metric name only, never the raw value. */
  label: string;
  /** Unit under the number, uppercase like the overview deck. */
  unit: string;
  value: string;
  hint: string;
  /** Emphasises a value that needs follow-up (at-risk learners). */
  alert?: boolean;
}

function mean(values: number[]): number | null {
  const usable = values.filter((n) => Number.isFinite(n));
  if (usable.length === 0) return null;
  return usable.reduce((sum, n) => sum + n, 0) / usable.length;
}

/**
 * Frozen summary deck for the academics board — the academic figures over the
 * active term, dressed in the principal overview KPI deck's language (header
 * strip, icon chip + label, number + unit, hint line, foot note) so the two
 * desks read as one. Only adviser-shared sections contribute to the
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
      alert: atRisk > 0,
    },
  ];

  const hiddenSections = sections.length - shared.length;

  return (
    <section className={styles.deck} aria-label="Academics summary">
      <div className={styles.deckHead}>
        <span className={styles.deckTitle}>
          <School aria-hidden /> This term at a glance
        </span>
      </div>

      <div className={styles.tiles}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div
              key={tile.key}
              className={`${styles.tile} ${tile.alert ? styles.tileAlert : ""}`}
            >
              <span className={styles.tileTop}>
                <span className={styles.tileIcon} aria-hidden>
                  <Icon size={13} />
                </span>
                <span className={styles.tileLabel}>{tile.label}</span>
              </span>
              {loading ? (
                <Skeleton className={styles.tileSkeleton} />
              ) : (
                <span className={styles.tileValue}>
                  <span
                    className={`${styles.tileNumber} ${
                      tile.value === "0" || tile.value === "—"
                        ? styles.tileNumberZero
                        : ""
                    }`}
                  >
                    {tile.value}
                  </span>
                  <span className={styles.tileUnit}>{tile.unit}</span>
                </span>
              )}
              <span className={styles.tileHint}>
                {loading ? "Loading…" : tile.hint}
              </span>
            </div>
          );
        })}
      </div>

      {!loading && hiddenSections > 0 ? (
        <p className={styles.deckFoot}>
          {hiddenSections} section
          {hiddenSections === 1 ? " has" : "s have"} data sharing turned off, so
          their learners and grades are not counted above.
        </p>
      ) : null}
    </section>
  );
}
