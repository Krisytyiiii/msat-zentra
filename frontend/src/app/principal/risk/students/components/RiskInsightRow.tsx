"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Activity,
  Compass,
  Layers,
} from "lucide-react";
import {
  FACTOR_CHIP,
  FACTOR_LABELS,
  type BackendStudent,
  type RiskFactor,
  type RiskLevelKey,
} from "@/services/principal/riskStudents.types";
import type { FactorFilter, RiskFilter } from "./StudentsListTable";
import styles from "./RiskInsightRow.module.css";

const FACTORS: RiskFactor[] = ["Academic", "Attendance", "Behavioral"];

const RISK_TONE: Record<"High" | "Moderate", string> = {
  High: "#dc2626",
  Moderate: "#f59e0b",
};

const LEVELS: Array<"High" | "Moderate"> = ["High", "Moderate"];

const RISK_LABEL: Record<"High" | "Moderate", string> = {
  High: "High",
  Moderate: "Moderate",
};

const NEXT_STEPS = [
  {
    href: "/principal/risk/interventions",
    label: "Open interventions",
    hint: "Cases already with guidance",
  },
  {
    href: "/principal/risk/heatmaps/attendance",
    label: "Attendance heatmap",
    hint: "Sections below 80%",
  },
  {
    href: "/principal/risk/heatmaps/academics",
    label: "Academic heatmap",
    hint: "Subject averages under 75",
  },
  {
    href: "/principal/risk/heatmaps/records",
    label: "Anecdotal records",
    hint: "Anecdotal records on file",
  },
  {
    href: "/principal/adm/referrals/all",
    label: "ADM referrals",
    hint: "Waiting on a principal decision",
  },
];

/**
 * Decision support above the heatmap: what the cohort is made of, which
 * sections need attention first, and where to go next. Every figure here is
 * clickable and drives the same filter state as the learners table, so the
 * panel is a shortcut, not a second, decorative report.
 */
export function RiskInsightRow({
  students,
  loading,
  selectedSection,
  riskFilter,
  factorFilter,
  onSelectRisk,
  onSelectFactor,
  onSelectSection,
}: {
  students: BackendStudent[];
  loading: boolean;
  selectedSection: string;
  riskFilter: RiskFilter;
  factorFilter: FactorFilter;
  onSelectRisk: (level: RiskLevelKey) => void;
  onSelectFactor: (factor: RiskFactor) => void;
  onSelectSection: (section: string) => void;
}) {
  const total = students.length;

  const high = React.useMemo(
    () => students.filter((s) => s.riskLevel === "High").length,
    [students],
  );
  const moderate = total - high;

  const drivers = React.useMemo(
    () =>
      FACTORS.map((factor) => ({
        factor,
        count: students.filter((s) => s.factors[factor]).length,
      })),
    [students],
  );

  // Sections ranked by how many of their learners are flagged — the five that
  // carry the most of this cohort.
  const sectionRows = React.useMemo(() => {
    const bySection = new Map<string, { atRisk: number; high: number }>();
    for (const student of students) {
      const entry = bySection.get(student.section) ?? { atRisk: 0, high: 0 };
      entry.atRisk += 1;
      if (student.riskLevel === "High") entry.high += 1;
      bySection.set(student.section, entry);
    }
    return [...bySection.entries()]
      .map(([section, entry]) => ({ section, ...entry }))
      .sort((a, b) => b.atRisk - a.atRisk || a.section.localeCompare(b.section))
      .slice(0, 5);
  }, [students]);

  const maxSection = sectionRows[0]?.atRisk ?? 1;
  const share = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));
  const pending = loading && total === 0;

  return (
    <div className={styles.row} role="group" aria-label="Risk insights">
      {/* ---- Cohort composition ---- */}
      <section className={styles.panel} aria-label="Cohort composition">
        <header className={styles.head}>
          <span className={styles.headTitle}>
            <Activity size={14} aria-hidden="true" />
            Cohort composition
          </span>
          <span className={styles.headMeta}>
            {pending ? "Loading…" : `${total.toLocaleString()} flagged`}
          </span>
        </header>
        <div className={styles.body}>
          {pending ? (
            <p className={styles.placeholder}>Loading the term&apos;s figures…</p>
          ) : total === 0 ? (
            <p className={styles.placeholder}>No learner is flagged this term.</p>
          ) : (
            <>
              <div
                className={styles.mixBar}
                role="img"
                aria-label={`${high} high risk, ${moderate} moderate risk`}
              >
                {high > 0 ? (
                  <span
                    className={styles.mixSegment}
                    style={{ flexGrow: high, backgroundColor: RISK_TONE.High }}
                  />
                ) : null}
                {moderate > 0 ? (
                  <span
                    className={styles.mixSegment}
                    style={{ flexGrow: moderate, backgroundColor: RISK_TONE.Moderate }}
                  />
                ) : null}
              </div>

              <div className={styles.mixLegend}>
                {LEVELS.map((level) => {
                  const value = level === "High" ? high : moderate;
                  const active = riskFilter === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      className={`${styles.mixItem} ${active ? styles.mixItemActive : ""}`}
                      onClick={() => onSelectRisk(level)}
                      aria-pressed={active}
                      title={
                        active
                          ? `Stop filtering by ${RISK_LABEL[level]} risk`
                          : `Show only ${RISK_LABEL[level]} risk learners`
                      }
                    >
                      <span
                        className={styles.dot}
                        style={{ backgroundColor: RISK_TONE[level] }}
                        aria-hidden="true"
                      />
                      <span className={styles.mixLabel}>{RISK_LABEL[level]}</span>
                      <span className={styles.mixValue}>{value}</span>
                      <span className={styles.mixShare}>{share(value)}%</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.split} />

              <span className={styles.subhead}>Flagged by</span>
              <ul className={styles.drivers}>
                {drivers.map(({ factor, count }) => {
                  const active = factorFilter === factor;
                  return (
                    <li key={factor}>
                      <button
                        type="button"
                        className={`${styles.driverRow} ${
                          active ? styles.driverRowActive : ""
                        }`}
                        onClick={() => onSelectFactor(factor)}
                        aria-pressed={active}
                        title={
                          active
                            ? `Stop filtering by ${FACTOR_LABELS[factor]}`
                            : `Show only learners flagged for ${FACTOR_LABELS[factor]}`
                        }
                      >
                        <span className={styles.driverName}>
                          <span
                            className={styles.dot}
                            style={{ backgroundColor: FACTOR_CHIP[factor] }}
                            aria-hidden="true"
                          />
                          {FACTOR_LABELS[factor]}
                        </span>
                        <span className={styles.driverMeter} aria-hidden="true">
                          <span
                            className={styles.driverFill}
                            style={{
                              width: `${share(count)}%`,
                              backgroundColor: FACTOR_CHIP[factor],
                            }}
                          />
                        </span>
                        <span className={styles.driverValue}>{count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* ---- Sections needing attention ---- */}
      <section className={styles.panel} aria-label="Sections needing attention">
        <header className={styles.head}>
          <span className={styles.headTitle}>
            <Layers size={14} aria-hidden="true" />
            Sections needing attention
          </span>
          <span className={styles.headMeta}>Top {sectionRows.length || 0}</span>
        </header>
        <div className={styles.body}>
          {pending ? (
            <p className={styles.placeholder}>Loading sections…</p>
          ) : sectionRows.length === 0 ? (
            <p className={styles.placeholder}>Every section is clear this term.</p>
          ) : (
            <ul className={styles.sections}>
              {sectionRows.map((row, index) => {
                const active = selectedSection === row.section;
                return (
                  <li key={row.section}>
                    <button
                      type="button"
                      className={`${styles.sectionRow} ${
                        active ? styles.sectionRowActive : ""
                      }`}
                      onClick={() => onSelectSection(row.section)}
                      aria-pressed={active}
                      title={
                        active
                          ? `Clear the ${row.section} filter`
                          : `Show only ${row.section}`
                      }
                    >
                      <span className={styles.sectionRank}>{index + 1}</span>
                      <span className={styles.sectionName}>{row.section}</span>
                      <span className={styles.sectionMeter} aria-hidden="true">
                        <span
                          className={styles.sectionFill}
                          style={{ width: `${Math.max(8, (row.atRisk / maxSection) * 100)}%` }}
                        />
                      </span>
                      <span className={styles.sectionCount}>{row.atRisk}</span>
                      <span className={styles.sectionHigh}>
                        {row.high > 0 ? `${row.high} high` : "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.panelFoot}>
            Select a section to filter the learners table below.
          </p>
        </div>
      </section>

      {/* ---- Next steps ---- */}
      <section className={styles.panel} aria-label="Next steps">
        <header className={styles.head}>
          <span className={styles.headTitle}>
            <Compass size={14} aria-hidden="true" />
            Next steps
          </span>
        </header>
        <div className={styles.body}>
          <ul className={styles.links}>
            {NEXT_STEPS.map((step) => (
              <li key={step.href}>
                <Link href={step.href} className={styles.link}>
                  <span className={styles.linkText}>
                    <span className={styles.linkLabel}>{step.label}</span>
                    <span className={styles.linkHint}>{step.hint}</span>
                  </span>
                  <ArrowRight className={styles.linkArrow} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
