"use client";

import * as React from "react";
import { ArrowUpRight, BookOpen, Lock } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import type {
  LockGradesAdviseeRow,
  LockGradesSubjectRow,
} from "@/services/teacher/lockGrades.service";
import styles from "./lock-grades.module.css";

const statusLabel: Record<string, string> = {
  unlocked: "Unlocked",
  locked: "Locked",
  adviser_approved: "Adviser approved",
};

function statusTone(status: string | null | undefined): PillTone {
  if (status === "adviser_approved") return "green";
  if (status === "locked") return "amber";
  if (status === "unlocked") return "sky";
  return "neutral";
}

function subjectStatus(row: LockGradesSubjectRow): string {
  if (row.hiddenByTeacher) return "Hidden";
  if (row.lockStatus) return statusLabel[row.lockStatus] ?? row.lockStatus;
  if (row.computedAverage != null) return "Not locked";
  return "No grade";
}

function subjectTone(row: LockGradesSubjectRow): PillTone {
  if (row.hiddenByTeacher) return "neutral";
  return statusTone(row.lockStatus);
}

function subjectComputed(row: LockGradesSubjectRow): string {
  if (row.hiddenByTeacher) return "—";
  return row.computedAverage != null ? row.computedAverage.toFixed(2) : "—";
}

function subjectGrade(row: LockGradesSubjectRow): string {
  if (row.hiddenByTeacher) return "—";
  return row.transmutedGrade != null ? String(row.transmutedGrade) : "—";
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function LockGradesAdviseeCard({ row }: { row: LockGradesAdviseeRow }) {
  const [open, setOpen] = React.useState(false);
  const total = row.summary.subjects;
  const graded = row.summary.graded;

  return (
    <>
      <article className={styles.card} aria-label={row.name}>
        <header className={styles.cardHead}>
          <StudentMascot name={row.name} seed={row.studentId} size={36} />
          <div className={styles.cardId}>
            <span className={styles.cardTitle} title={row.name}>
              {row.name}
            </span>
            <span className={styles.cardMeta} title={row.section || undefined}>
              {row.section || "No section"}
            </span>
          </div>
          <Pill field="lrn" className={styles.gradePill}>
            {row.lrn || "—"}
          </Pill>
        </header>

        <div className={styles.metaRow}>
          <Pill tone="blue" label="Subjects">
            {total} subject{total === 1 ? "" : "s"}
          </Pill>
          <Pill tone="sky" label="With a computed grade">
            {graded} graded
          </Pill>
          <Pill tone="amber" label="Locked, awaiting approval">
            {row.summary.locked} locked
          </Pill>
          {row.summary.approved > 0 ? (
            <Pill tone="green" label="Approved by the adviser">
              {row.summary.approved} approved
            </Pill>
          ) : null}
          {!row.hasAccount ? (
            <Pill tone="neutral" label="Account">
              Roster only
            </Pill>
          ) : null}
        </div>

        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct(graded, total))}
          aria-label={`${graded} of ${total} subjects graded`}
        >
          <span className={styles.segReady} style={{ width: `${pct(graded, total)}%` }} />
        </div>

        <p className={styles.progressLine}>
          {graded} of {total} subject{total === 1 ? "" : "s"} graded
        </p>

        <div className={styles.linksRow}>
          <span className={styles.linkStat}>
            <BookOpen size={11} aria-hidden />
            {total} subject{total === 1 ? "" : "s"}
          </span>
          <span className={styles.linkStat}>
            <Lock size={11} aria-hidden />
            {row.summary.locked + row.summary.approved} locked
          </span>
          <span className={styles.linkStat}>
            {row.hasAccount ? "Has account" : "Roster only"}
          </span>
        </div>

        <div className={styles.cardActions}>
          <span className={styles.lockedHint}>
            <Lock size={11} aria-hidden />
            Read-only desk
          </span>
          <Button
            variant="outline"
            className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
            onClick={() => setOpen(true)}
          >
            View grades
            <ArrowUpRight size={12} aria-hidden />
          </Button>
        </div>
      </article>

      <KanbanOverlay
        open={open}
        onClose={() => setOpen(false)}
        title={`${row.name} — per-subject grades`}
        ariaLabel={`${row.name} per-subject grades`}
        icon={
          <span className="text-amber-600 dark:text-amber-400" aria-hidden>
            <BookOpen size={14} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Pill field="section" label="Section">
              {row.section || "No section"}
            </Pill>
            <Pill tone="neutral" label="Subjects">
              {total} subject{total === 1 ? "" : "s"}
            </Pill>
            <Pill tone="amber" label="Locked, awaiting approval">
              {row.summary.locked} locked
            </Pill>
          </span>
        }
        width="lg"
      >
        {row.subjects.length === 0 ? (
          <p className={`${styles.muted} ${styles.center}`}>No subjects on this section yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {row.subjects.map((subject) => (
              <div
                key={subject.subjectId}
                className="flex flex-col gap-1.5 rounded-lg border bg-card p-2.5 transition-colors duration-150 ease-out hover:border-amber-500/40"
              >
                <span className="truncate text-xs font-semibold" title={subject.subject}>
                  {subject.subject}
                </span>
                <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                  <span>
                    Computed{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {subjectComputed(subject)}
                    </span>
                  </span>
                  <span>
                    Grade{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {subjectGrade(subject)}
                    </span>
                  </span>
                </div>
                <Pill tone={subjectTone(subject)} label="Lock status">
                  {subjectStatus(subject)}
                </Pill>
              </div>
            ))}
          </div>
        )}
      </KanbanOverlay>
    </>
  );
}
