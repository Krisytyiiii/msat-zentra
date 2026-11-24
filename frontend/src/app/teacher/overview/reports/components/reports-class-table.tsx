"use client";

import { GraduationCap } from "lucide-react";
import { InsightCallout } from "@/components/ui/insight-callout";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import type { FinalsLockStatus, TeacherReportClassRow } from "@/services/teacher/reports.types";
import { formatGrade, formatPercent, LOCK_LABELS } from "./reports-format";
import styles from "./reports.module.css";

type MetricTone = "neutral" | "green" | "amber" | "red";

function lockTone(status: FinalsLockStatus) {
  if (status === "adviser_approved") return "green" as const;
  if (status === "locked") return "blue" as const;
  return "amber" as const;
}

function averageTone(average: number | null): MetricTone {
  if (average == null) return "neutral";
  if (average < 75) return "red";
  if (average < 80) return "amber";
  return "green";
}

function passTone(rate: number | null): MetricTone {
  if (rate == null) return "neutral";
  if (rate >= 0.75) return "green";
  return rate > 0 ? "amber" : "red";
}

function attendanceTone(rate: number | null): MetricTone {
  if (rate == null) return "neutral";
  return rate < 0.8 ? "red" : "green";
}

/** One class as a glass report card: identity up top, the three headline
 *  figures in a divided metric strip, secondary facts along the footer. */
function ClassCard({ row }: { row: TeacherReportClassRow }) {
  const lock = row.lockStatus;
  return (
    <GlassCard className="h-full min-w-0">
      <article className={styles.classCard} aria-label={`${row.subject}, ${row.section}`}>
        <header className={styles.classCardHead}>
          <div className={styles.classCardHeading}>
            <h3 className={styles.classCardTitle} title={row.subject}>
              {row.subject}
            </h3>
            <p className={styles.classCardMeta}>
              <Pill
                tone="blue"
                label="Subject code"
                className="border-transparent px-0"
              >
                {row.subjectCode}
              </Pill>
              <Pill field="section" label="Section" className="border-transparent px-0">
                {row.section}
              </Pill>
              <Pill field="grade" label="Grade level" className="border-transparent px-0">
                {row.gradeLevel}
              </Pill>
            </p>
          </div>
          <Pill tone={lock ? lockTone(lock) : "neutral"} label="Finals status">
            {lock ? (LOCK_LABELS[lock] ?? lock) : "No finals"}
          </Pill>
        </header>

        <div className={styles.classCardMetrics}>
          <div className={styles.classCardMetric} data-tone={averageTone(row.transmutedAverage)}>
            <span className={styles.classCardMetricLabel}>Average</span>
            <span className={styles.classCardMetricValue}>
              {formatGrade(row.transmutedAverage, 1)}
            </span>
          </div>
          <div className={styles.classCardMetric} data-tone={passTone(row.passRate)}>
            <span className={styles.classCardMetricLabel}>Pass rate</span>
            <span className={styles.classCardMetricValue}>{formatPercent(row.passRate)}</span>
            <span className={styles.classCardMetricHint}>
              {row.passing}/{row.passing + row.failing} passing
            </span>
          </div>
          <div className={styles.classCardMetric} data-tone={attendanceTone(row.attendanceRate)}>
            <span className={styles.classCardMetricLabel}>Attendance</span>
            <span className={styles.classCardMetricValue}>
              {formatPercent(row.attendanceRate)}
            </span>
            <span className={styles.classCardMetricHint}>
              {row.belowAttendance} below 80%
            </span>
          </div>
        </div>

        <dl className={styles.classCardFacts}>
          <div className={styles.classCardFact}>
            <dt>Your role</dt>
            <dd>{row.teacherRole === "adviser" ? "Adviser" : "Subject teacher"}</dd>
          </div>
          <div className={styles.classCardFact}>
            <dt>Learners</dt>
            <dd>{row.learners}</dd>
          </div>
          <div className={styles.classCardFact}>
            <dt>Assessments</dt>
            <dd>
              {row.gradedAssessments}/{row.assessments} scored
            </dd>
          </div>
          <div className={styles.classCardFact}>
            <dt>Completion</dt>
            <dd>{formatPercent(row.completionRate)}</dd>
          </div>
        </dl>
      </article>
    </GlassCard>
  );
}

/**
 * Class performance as a wall of glass cards: one card per class, read top to
 * bottom (identity → headline figures → supporting facts) instead of a
 * twelve-column pill table. The cards sit straight on the desk — no parent
 * board card — so each class reads as its own surface.
 */
export function ReportsClassTable({ rows }: { rows: TeacherReportClassRow[] }) {
  return (
    <section
      aria-label="Class performance"
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex items-start gap-1.5 px-1">
        <span className="mt-px text-primary" aria-hidden>
          <GraduationCap size={14} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-muted-foreground">
            Class performance
          </h2>
          <p className="text-xs text-muted-foreground">
            Completion, averages, attendance, and finals state for every class
            you handle this term.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <InsightCallout role="status" className="w-full text-left">
          <strong>No classes to report on yet.</strong> Assigned sections and
          subjects will show their completion, averages, and attendance here.
        </InsightCallout>
      ) : (
        <div className={styles.classCardGrid}>
          {rows.map((row) => (
            <ClassCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
