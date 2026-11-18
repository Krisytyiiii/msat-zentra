"use client";

import * as React from "react";
import { Grid3x3, Users } from "lucide-react";
import {
  FACTOR_CHIP,
  FACTOR_LABELS,
  type BackendHeatmap,
  type BackendStudent,
  type HeatmapSection,
  type RiskFactor,
} from "@/services/principal/riskStudents.types";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
import { PrincipalEmptyState } from "../../../components/PrincipalEmptyCard";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./StudentHeatmap.module.css";

const FACTORS: RiskFactor[] = ["Academic", "Attendance", "Behavioral"];

const gradeLabel = (grade: string) => {
  const m = String(grade).match(/(\d+)/);
  return m ? `Grade ${m[1]}` : grade;
};

const gradeNum = (grade: string) => {
  const m = String(grade).match(/(\d+)/);
  const value = m ? parseInt(m[1], 10) : NaN;
  return Number.isNaN(value) ? 99 : value;
};

/** Cell tint: one shared scale across the whole matrix, so a 4 in one section
 *  reads darker than a 2 in another (the old per-card scale made them equal). */
const cellTint = (color: string, ratio: number) => {
  if (ratio <= 0) return undefined;
  const strength = Math.round(12 + ratio * 44);
  return { backgroundColor: `color-mix(in srgb, ${color} ${strength}%, transparent)` };
};

type Row = HeatmapSection & { atRisk: number; high: number };

export function StudentHeatmap({
  heat,
  students,
  loading,
  selectedSection,
  onSelect,
}: {
  heat: BackendHeatmap | null;
  students: BackendStudent[];
  loading: boolean;
  selectedSection: string | null;
  onSelect: (section: string) => void;
}) {
  const rows = React.useMemo<Row[]>(() => {
    const bySection = new Map<string, { atRisk: number; high: number }>();
    for (const student of students) {
      const entry = bySection.get(student.section) ?? { atRisk: 0, high: 0 };
      entry.atRisk += 1;
      if (student.riskLevel === "High") entry.high += 1;
      bySection.set(student.section, entry);
    }
    return [...(heat?.sections ?? [])]
      .map((section) => ({
        ...section,
        atRisk: bySection.get(section.section)?.atRisk ?? 0,
        high: bySection.get(section.section)?.high ?? 0,
      }))
      .sort(
        (a, b) =>
          gradeNum(a.gradeLevel) - gradeNum(b.gradeLevel) ||
          a.section.localeCompare(b.section, undefined, { numeric: true }),
      );
  }, [heat, students]);

  // Column maxima drive the shared heat scale.
  const columnMax = React.useMemo(() => {
    const max: Record<RiskFactor, number> = { Academic: 1, Attendance: 1, Behavioral: 1 };
    for (const row of rows) {
      for (const factor of FACTORS) {
        max[factor] = Math.max(max[factor], row.factors[factor] ?? 0);
      }
    }
    return max;
  }, [rows]);

  // One band per grade level — the matrix reads top-down like the school.
  const groups = React.useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const grade = gradeLabel(row.gradeLevel);
      const list = map.get(grade) ?? [];
      list.push(row);
      map.set(grade, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <KanbanBoard
      title="Section Factor Heatmap"
      icon={<Grid3x3 size={14} aria-hidden="true" />}
      actions={
        <>
          <Pill tone="green" label="Data source">
            Adviser-shared
          </Pill>
          <span className={styles.legend} aria-hidden="true">
            <span className={styles.legendLabel}>Fewer</span>
            <span className={styles.legendScale}>
              {[0.18, 0.36, 0.54, 0.72, 0.9].map((step) => (
                <span
                  key={step}
                  className={styles.legendSwatch}
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(
                      12 + step * 44,
                    )}%, transparent)`,
                  }}
                />
              ))}
            </span>
            <span className={styles.legendLabel}>More</span>
          </span>
        </>
      }
      ariaLabel="Section factor heatmap"
    >
      {loading ? (
        <div className={styles.skeleton} aria-busy="true" aria-label="Loading section heatmap">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={styles.skeletonRow} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <PrincipalEmptyState
          icon={Users}
          title="No sections to display"
          hint="No sections with risk data for the active term. Sections will appear here once detected."
        />
      ) : (
        <div className={styles.matrixScroll}>
          <table className={styles.matrix}>
            <caption className={styles.srOnly}>
              Flagged learners per risk factor, by section and grade level
            </caption>
            <thead>
              <tr className={styles.columnRow}>
                <th scope="col" className={styles.sectionHead}>
                  Section
                </th>
                {FACTORS.map((factor) => (
                  <th key={factor} scope="col" className={styles.factorHead}>
                    <span className={styles.factorHeadDot} style={{ background: FACTOR_CHIP[factor] }} aria-hidden="true" />
                    {FACTOR_LABELS[factor]}
                  </th>
                ))}
                <th scope="col" className={styles.totalHead}>
                  At risk
                </th>
              </tr>
            </thead>
            {groups.map(([grade, groupRows]) => {
              return (
                <tbody key={grade}>
                  <tr className={styles.gradeRow}>
                    <th scope="colgroup" colSpan={5} className={styles.gradeCell}>
                      <span className={styles.gradeName}>{grade}</span>
                    </th>
                  </tr>
                  {groupRows.map((row) => {
                    const isActive = row.section === selectedSection;
                    return (
                      <tr
                        key={row.sectionId}
                        className={`${styles.row} ${isActive ? styles.rowActive : ""}`}
                        onClick={() => onSelect(row.section)}
                      >
                        <th scope="row" className={styles.sectionCell}>
                          <button
                            type="button"
                            className={styles.sectionButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(row.section);
                            }}
                            aria-pressed={isActive}
                            title={
                              isActive
                                ? `Clear the ${row.section} filter`
                                : `Show only ${row.section}`
                            }
                          >
                            {row.section}
                          </button>
                        </th>
                        {FACTORS.map((factor) => {
                          const value = row.factors[factor] ?? 0;
                          const ratio = value / columnMax[factor];
                          return (
                            <td
                              key={factor}
                              className={styles.factorCell}
                              style={cellTint(FACTOR_CHIP[factor], ratio)}
                              title={`${row.section} — ${FACTOR_LABELS[factor]}: ${value} flagged`}
                              aria-label={`${row.section}, ${FACTOR_LABELS[factor]}: ${value} flagged learner${
                                value === 1 ? "" : "s"
                              }`}
                            >
                              {value === 0 ? (
                                <span className={styles.cellZero} aria-hidden="true">
                                  –
                                </span>
                              ) : (
                                <span className={styles.cellValue}>{value}</span>
                              )}
                            </td>
                          );
                        })}
                        <td
                          className={`${styles.totalCell} ${
                            row.atRisk > 0 ? styles.totalCellAlert : ""
                          }`}
                          title={`${row.section} — ${row.atRisk} at risk (${row.high} high)`}
                          aria-label={`${row.section}: ${row.atRisk} learner${
                            row.atRisk === 1 ? "" : "s"
                          } at risk`}
                        >
                          <span className={styles.totalValue}>{row.atRisk}</span>
                          {row.high > 0 ? (
                            <span className={styles.totalHigh} aria-hidden="true">
                              {row.high} high
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </KanbanBoard>
  );
}
