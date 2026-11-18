"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { PrincipalEmptyState } from "../../../../components/PrincipalEmptyCard";
import {
  gradeSortKey,
  round1,
  type BackendSectionRow,
} from "./types";import styles from "./grade-trends.module.css";
import boardStyles from "./academics.module.css";

type SubjectAvg = {
  subject: string;
  avg: number;
  graded: number;
  below: number;
};

type GradeModel = {
  grade: string;
  sectionCount: number;
  learnerCount: number;
  subjects: SubjectAvg[];
  /** Mean of every subject mark in the grade. */
  overall: number;
  belowSubjects: number;
  marks: number;
};

/** The trend axis runs 50 → 100 so a 74 vs 82 gap is actually visible. */
const AXIS_MIN = 50;
const AXIS_MAX = 100;
const PASSING = 75;

function barHeight(avg: number): string {
  const pct = ((avg - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100;
  return `${Math.min(100, Math.max(0, pct))}%`;
}

/**
 * One model per grade level. Sections in scope are folded together so the row
 * answers "how is G7 doing, subject by subject?" — the same question the
 * attendance trends board answers per section.
 */
function buildModels(sections: BackendSectionRow[]): GradeModel[] {
  const byGrade = new Map<
    string,
    {
      sectionIds: Set<string>;
      learnerIds: Set<string>;
      subjects: Map<string, { sum: number; count: number; below: number }>;
    }
  >();

  for (const section of sections) {
    let entry = byGrade.get(section.grade);
    if (!entry) {
      entry = { sectionIds: new Set(), learnerIds: new Set(), subjects: new Map() };
      byGrade.set(section.grade, entry);
    }
    entry.sectionIds.add(section.sectionId);
    for (const student of section.students) {
      if (student.subjects.length === 0) continue;
      entry.learnerIds.add(student.studentId);
      for (const mark of student.subjects) {
        const cell = entry.subjects.get(mark.subject) ?? {
          sum: 0,
          count: 0,
          below: 0,
        };
        cell.sum += mark.transmutedGrade;
        cell.count += 1;
        if (mark.transmutedGrade < PASSING) cell.below += 1;
        entry.subjects.set(mark.subject, cell);
      }
    }
  }

  return [...byGrade.entries()]
    .map(([grade, entry]) => {
      const subjects: SubjectAvg[] = [...entry.subjects.entries()]
        .map(([subject, cell]) => ({
          subject,
          avg: round1(cell.sum / cell.count),
          graded: cell.count,
          below: cell.below,
        }))
        .sort((a, b) => a.subject.localeCompare(b.subject));

      const marks = subjects.reduce((sum, s) => sum + s.graded, 0);
      const total = subjects.reduce((sum, s) => sum + s.avg * s.graded, 0);

      return {
        grade,
        sectionCount: entry.sectionIds.size,
        learnerCount: entry.learnerIds.size,
        subjects,
        overall: marks > 0 ? round1(total / marks) : 0,
        belowSubjects: subjects.filter((s) => s.avg < PASSING).length,
        marks,
      };
    })
    .sort((a, b) => gradeSortKey(a.grade) - gradeSortKey(b.grade));
}

function GradeTrendRow({
  model,
  selectedSubject,
  onSelectSubject,
}: {
  model: GradeModel;
  selectedSubject: string | null;
  onSelectSubject: (subject: string | null) => void;
}) {
  const [hover, setHover] = React.useState<number | null>(null);

  const hoverSubject = hover !== null ? model.subjects[hover] : null;
  const hoverX =
    hover !== null && model.subjects.length > 0
      ? ((hover + 0.5) / model.subjects.length) * 100
      : 50;

  const weakest = model.subjects.length
    ? model.subjects.reduce((worst, subject) =>
        subject.avg < worst.avg ? subject : worst
      )
    : null;
  const alert = model.belowSubjects > 0;

  return (
    <div className={`${styles.row} ${alert ? styles.rowAlert : ""}`}>
      <span className={styles.colId}>
        <span className={styles.name}>{model.grade}</span>
        <span className={styles.metaRow}>
          <Pill label="Sections in this grade level">
            {model.sectionCount} section{model.sectionCount === 1 ? "" : "s"}
          </Pill>
          <Pill label="Learners with at least one grade">
            {model.learnerCount} graded
          </Pill>
          <Pill label="Subjects with marks">
            {model.subjects.length} subject
            {model.subjects.length === 1 ? "" : "s"}
          </Pill>
        </span>
      </span>

      <span className={styles.colChart}>
        {model.subjects.length > 0 ? (
          <>
            <span className={styles.plot} onMouseLeave={() => setHover(null)}>
              <span className={styles.grid} aria-hidden="true">
                <span
                  className={styles.gridLine}
                  style={{ bottom: "50%", borderTopColor: "var(--destructive)" }}
                />
              </span>

              <span className={styles.bars}>
                {model.subjects.map((subject, index) => {
                  const selected = selectedSubject === subject.subject;
                  return (
                    <button
                      key={subject.subject}
                      type="button"
                      className={`${styles.barSlot} ${
                        hover === index ? styles.barSlotHover : ""
                      } ${selected ? styles.barSlotSelected : ""}`}
                      onMouseEnter={() => setHover(index)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(index)}
                      onBlur={() => setHover(null)}
                      onClick={() =>
                        onSelectSubject(selected ? null : subject.subject)
                      }
                      aria-pressed={selected}
                      aria-label={`${subject.subject}: ${subject.avg} average, ${subject.graded} graded, ${subject.below} below ${PASSING}`}
                    >
                      <span
                        className={`${styles.bar} ${
                          subject.avg < PASSING ? styles.barLow : styles.barOkay
                        }`}
                        style={{ height: barHeight(subject.avg) }}
                      />
                    </button>
                  );
                })}
              </span>

              {hoverSubject ? (
                <span
                  className={`${styles.tip} ${hoverX > 82 ? styles.tipEnd : ""} ${
                    hoverX < 18 ? styles.tipStart : ""
                  }`}
                  style={{ left: `${hoverX}%` }}
                >
                  <span className={styles.tipSubject}>{hoverSubject.subject}</span>
                  <span className={styles.tipRows}>
                    <span>
                      Average <strong>{hoverSubject.avg}</strong>
                    </span>
                    <span>
                      Graded <strong>{hoverSubject.graded}</strong>
                    </span>
                    <span>
                      Below {PASSING} <strong>{hoverSubject.below}</strong>
                    </span>
                  </span>
                  {hoverSubject.avg < PASSING ? (
                    <span className={styles.tipNote}>Below passing</span>
                  ) : null}
                </span>
              ) : null}
            </span>
            <span className={styles.labels} aria-hidden="true">
              {model.subjects.map((subject) => (
                <span
                  key={subject.subject}
                  className={styles.label}
                  title={subject.subject}
                >
                  {subject.subject}
                </span>
              ))}
            </span>
            <span className={styles.axis} aria-hidden="true">
              <span>{AXIS_MIN}</span>
              <span className={styles.axisPass}>{PASSING} passing</span>
              <span>{AXIS_MAX}</span>
            </span>
          </>
        ) : (
          <span className={styles.noChart}>No graded records yet</span>
        )}
      </span>

      <span className={styles.colWeak}>
        <span className={styles.colLabel}>Weakest subject</span>
        {weakest ? (
          <>
            <span className={styles.weakRow}>
              <strong>{weakest.subject}</strong>
              <span className={styles.weakRate}>{weakest.avg}</span>
            </span>
            <span className={styles.weakTrack} aria-hidden="true">
              <span
                className={`${styles.weakFill} ${
                  weakest.avg < PASSING ? styles.weakFillLow : ""
                }`}
                style={{ width: `${Math.min(100, Math.max(0, weakest.avg))}%` }}
              />
            </span>
          </>
        ) : (
          <span className={styles.muted}>No subject marks yet</span>
        )}
      </span>

      <span className={styles.colRate}>
        <Pill
          tone={model.overall > 0 && model.overall < PASSING ? "red" : "green"}
          label="Grade average"
          className={styles.ratePill}
        >
          {model.overall}
        </Pill>
        <span className={styles.rateHint}>
          {model.subjects.length === 0
            ? "No graded records yet"
            : `${model.belowSubjects} of ${model.subjects.length} subject${
                model.subjects.length === 1 ? "" : "s"
              } below ${PASSING}`}
        </span>
      </span>
    </div>
  );
}

export function SubjectTrendChart({
  sections,
  isPending,
  selectedSubject,
  onSelectSubject,
}: {
  sections: BackendSectionRow[];
  isPending: boolean;
  selectedSubject: string | null;
  onSelectSubject: (subject: string | null) => void;
}) {
  const models = React.useMemo(() => buildModels(sections), [sections]);

  const isEmpty =
    !isPending && (models.length === 0 || !models.some((m) => m.marks > 0));

  if (isEmpty) {
    return (
      <KanbanBoard
        className={boardStyles.emptyBoard}
        title="Subject Trends"
        icon={<BookOpen size={14} aria-hidden="true" />}
        ariaLabel="Subject trends by grade level"
      >
        <div className={boardStyles.emptyInsight}>
          <PrincipalEmptyState
            icon={BookOpen}
            title="No graded records"
            hint="No graded records for the active term. Grades will appear here once finalized."
            tone="amber"
          />
        </div>
      </KanbanBoard>
    );
  }

  return (
    <KanbanBoard
      title="Subject Trends"
      icon={<BookOpen size={14} aria-hidden="true" />}
      description={`One row per grade level — a bar per subject's average transmuted grade (axis runs 50–100, dashed line at 75). Click a subject bar to rank its sections below.`}
      ariaLabel="Subject trends by grade level"
    >
      {isPending ? (
        <div className={styles.list} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className={styles.skelRow} />
          ))}
        </div>
      ) : (
        <div className={styles.list}>
          <div className={styles.rail} aria-hidden="true">
            <span>Grade level</span>
            <span className={styles.railChart}>
              Subject averages
              <span className={styles.railLegend}>
                <span>
                  <span className={`${styles.dot} ${styles.dotOkay}`} />
                  At or above {PASSING}
                </span>
                <span>
                  <span className={`${styles.dot} ${styles.dotLow}`} />
                  Below {PASSING}
                </span>
              </span>
            </span>
            <span>Weakest subject</span>
            <span className={styles.railRate}>Grade average</span>
          </div>
          {models.map((model) => (
            <GradeTrendRow
              key={model.grade}
              model={model}
              selectedSubject={selectedSubject}
              onSelectSubject={onSelectSubject}
            />
          ))}
        </div>
      )}
    </KanbanBoard>
  );
}
