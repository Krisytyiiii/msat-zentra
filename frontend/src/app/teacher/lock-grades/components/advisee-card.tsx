"use client";

import * as React from "react";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import type {
  LockGradesAdviseeRow,
  LockGradesSubjectRow,
} from "@/services/teacher/lockGrades.service";
import rowStyles from "@/components/ui/table-row-in.module.css";
import styles from "./lock-grades.module.css";

const HEAD_CLASS =
  "px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground";
const CELL_CLASS = "px-4 py-2.5 align-middle whitespace-nowrap";
const NUM_CLASS = `${CELL_CLASS} tabular-nums text-[12px] text-muted-foreground`;

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
  if (row.hiddenByTeacher) return "—";
  return row.transmutedGrade != null ? String(row.transmutedGrade) : "—";
}

function AdviseeRow({
  row,
  index,
  onOpen,
}: {
  row: LockGradesAdviseeRow;
  index: number;
  onOpen: () => void;
}) {
  const total = row.summary.subjects;
  const locked = row.summary.locked + row.summary.approved;

  return (
    <tr
      style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as React.CSSProperties}
      className={`${rowStyles.row} border-b border-border/60 transition-colors duration-150 last:border-b-0 hover:bg-muted/60`}
    >
      <td className={CELL_CLASS}>
        <div className="flex items-center gap-2.5">
          <StudentMascot name={row.name} seed={row.studentId} size={28} />
          <div className="min-w-0">
            <p
              className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground"
              title={row.name}
            >
              {row.name}
            </p>
            <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
              {row.lrn || "No LRN"}
            </p>
          </div>
        </div>
      </td>
      <td className={`${CELL_CLASS} text-[12px] text-muted-foreground`}>
        {row.section || "No section"}
      </td>
      <td className={NUM_CLASS}>{total}</td>
      <td className={NUM_CLASS}>{row.summary.graded}</td>
      <td className={CELL_CLASS}>
        <span className="text-[12px] font-medium tabular-nums text-foreground">{locked}</span>
        {row.summary.approved > 0 ? (
          <span className="ml-1.5 text-[12px] tabular-nums text-muted-foreground">
            ({row.summary.approved} final)
          </span>
        ) : null}
      </td>
      <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
        <Button
          variant="outline"
          className="h-6 gap-1 px-2 text-[12px]"
          onClick={onOpen}
          aria-label={`View grades for ${row.name}`}
        >
          <BookOpen size={12} aria-hidden />
          Grades
          <ArrowUpRight size={12} aria-hidden />
        </Button>
      </td>
    </tr>
  );
}

export function LockGradesAdviseeTable({ rows }: { rows: LockGradesAdviseeRow[] }) {
  const [openRow, setOpenRow] = React.useState<LockGradesAdviseeRow | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={HEAD_CLASS}>Learner</th>
              <th scope="col" className={HEAD_CLASS}>Section</th>
              <th scope="col" className={HEAD_CLASS}>Subjects</th>
              <th scope="col" className={HEAD_CLASS}>Graded</th>
              <th scope="col" className={HEAD_CLASS}>Locked</th>
              <th scope="col" className={`${HEAD_CLASS} text-right`}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <AdviseeRow
                key={row.studentId}
                row={row}
                index={index}
                onOpen={() => setOpenRow(row)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <KanbanOverlay
        open={openRow !== null}
        onClose={() => setOpenRow(null)}
        title={openRow ? `${openRow.name} — per-subject grades` : ""}
        ariaLabel={openRow ? `${openRow.name} per-subject grades` : "Advisee grades"}
        icon={
          <span className="text-amber-600 dark:text-amber-400" aria-hidden>
            <BookOpen size={14} />
          </span>
        }
        description={
          openRow ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span>{openRow.section || "No section"}</span>
              <span>
                {openRow.summary.subjects} subject{openRow.summary.subjects === 1 ? "" : "s"}
              </span>
              <span>{openRow.summary.locked} locked</span>
            </span>
          ) : null
        }
        width="lg"
      >
        {openRow ? (
          openRow.subjects.length === 0 ? (
            <p className={`${styles.muted} ${styles.center}`}>No subjects on this section yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {openRow.subjects.map((subject) => (
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
                  <span className={subjectStatusClass(subject)}>{subjectStatus(subject)}</span>
                </div>
              ))}
            </div>
          )
        ) : null}
      </KanbanOverlay>
    </>
  );
}
