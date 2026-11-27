"use client";

import { BookOpen, GraduationCap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type {
  LockGradesAdviseeRow,
  LockGradesSubjectRow,
} from "@/services/teacher/lockGrades.service";
import boardStyles from "../../advisory/list/components/advisory-insight-board.module.css";

const statusLabel: Record<string, string> = {
  unlocked: "Unlocked",
  locked: "Locked",
  adviser_approved: "Final",
};

function subjectStatus(row: LockGradesSubjectRow): string {
  if (row.hiddenByTeacher) return "Hidden";
  if (row.lockStatus) return statusLabel[row.lockStatus] ?? row.lockStatus;
  if (row.computedAverage != null) return "Not locked";
  return "No grade";
}

function subjectStatusClass(row: LockGradesSubjectRow): string {
  if (row.hiddenByTeacher) return "text-[12px] text-muted-foreground";
  if (row.lockStatus === "locked" || row.lockStatus === "adviser_approved") {
    return "text-[12px] font-medium text-green-700 dark:text-green-400";
  }
  if (row.lockStatus === "unlocked") {
    return "text-[12px] font-medium text-sky-700 dark:text-sky-400";
  }
  return "text-[12px] text-muted-foreground";
}

function subjectComputed(row: LockGradesSubjectRow): string {
  if (row.hiddenByTeacher) return "—";
  return row.computedAverage != null ? row.computedAverage.toFixed(2) : "—";
}

function subjectGrade(row: LockGradesSubjectRow): string {
  if (row.hiddenByTeacher || row.transmutedGrade == null) return "—";
  return String(row.transmutedGrade);
}

/** Amber when nothing is locked yet, green once every subject is final. */
function lockDot(row: LockGradesAdviseeRow): string {
  const locked = row.summary.locked + row.summary.approved;
  if (locked === 0) return "#f59e0b";
  if (locked >= row.summary.subjects) return "#22c55e";
  return "#3b82f6";
}

/**
 * Right-side grades board. Same kanban look as the advisory attendance
 * drawer: amber header pills, a plain section with an uppercase lane head,
 * and a 3-per-row card grid of subject lanes.
 */
export function AdviseeGradesBoard({
  row,
  bare = false,
}: {
  row: LockGradesAdviseeRow | null;
  bare?: boolean;
}) {
  if (!row) {
    return (
      <div
        className={`${boardStyles.board} ${bare ? boardStyles.bare : ""}`}
        aria-label="Subject grades"
      >
        <header className={boardStyles.boardHead}>
          <span className={boardStyles.boardIcon} aria-hidden>
            <GraduationCap size={18} />
          </span>
          <div className="min-w-0">
            <h2 className={boardStyles.boardTitle}>Subject grades</h2>
            <p className={boardStyles.boardSub}>Select a row on the left to inspect</p>
          </div>
        </header>
        <p className={boardStyles.empty}>No learner selected.</p>
      </div>
    );
  }

  const locked = row.summary.locked + row.summary.approved;

  return (
    <div
      className={`${boardStyles.board} ${bare ? boardStyles.bare : ""}`}
      aria-label={`Grades for ${row.name}`}
    >
      <header className={boardStyles.boardHead}>
        <span className={boardStyles.boardIcon} aria-hidden>
          <GraduationCap size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={boardStyles.boardTitle}>Subject grades</h2>
          <p className={boardStyles.boardSub}>Computed average and final grade per subject</p>
        </div>
        <GlassCard className="shrink-0" intensity={4}>
          <div className={boardStyles.statusCard}>
            <span className={boardStyles.statusLabel}>Locked subjects</span>
            <span className={`${boardStyles.statusValue} ${boardStyles.statusBig}`}>
              {locked}
              <span className={boardStyles.kUnit}>/ {row.summary.subjects}</span>
            </span>
          </div>
        </GlassCard>
      </header>

      <section className={boardStyles.plainSection} aria-label="Grades per subject">
        <header className={boardStyles.laneHead}>
          <span className={boardStyles.laneDot} style={{ background: lockDot(row) }} aria-hidden />
          <h3 className={boardStyles.laneTitle}>Grades per subject</h3>
        </header>
        {row.subjects.length === 0 ? (
          <p className={boardStyles.empty}>No subjects on this section yet.</p>
        ) : (
          <ul className={boardStyles.cardGrid} key={row.studentId}>
            {row.subjects.map((subject) => (
              <li key={subject.subjectId} className="min-w-0">
                <section
                  className={`${boardStyles.lane} ${boardStyles.laneFlat}`}
                  aria-label={`${subject.subject} grades lane`}
                >
                  <header className={boardStyles.colHead}>
                    <span className={boardStyles.colIcon} aria-hidden>
                      <BookOpen size={18} />
                    </span>
                    <h4 className={boardStyles.colTitle} title={subject.subject}>
                      {subject.subject}
                    </h4>
                  </header>
                  <ul className={boardStyles.laneBody}>
                    <li
                      className={boardStyles.kCard}
                      aria-label={`${subject.subject}: computed ${subjectComputed(subject)}, grade ${subjectGrade(subject)}`}
                    >
                      <p className={boardStyles.kLabel}>Computed average</p>
                      <div className={boardStyles.kBottom}>
                        <p className={boardStyles.kTitle}>Weighted average</p>
                        <p className={boardStyles.kBig}>{subjectComputed(subject)}</p>
                      </div>
                      <p className={boardStyles.kLabel}>Final grade</p>
                      <div className={boardStyles.kBottom}>
                        <p className={boardStyles.kTitle}>Transmuted grade</p>
                        <p className={boardStyles.kBig}>{subjectGrade(subject)}</p>
                      </div>
                      <span className={subjectStatusClass(subject)}>
                        {subjectStatus(subject)}
                      </span>
                    </li>
                  </ul>
                </section>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
