"use client";

import * as React from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { useTerm } from "@/lib/term/TermContext";
import { useStudentHoverStats } from "@/services/principal/studentStats.service";
import type { StudentRow } from "@/services/principal/academics";
import styles from "./SectionStudentsTable.module.css";

function gradeTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (value < 75) return styles.toneWarn;
  if (value < 80) return styles.toneCaution;
  return "";
}

function attendanceTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (value < 80) return styles.toneWarn;
  if (value < 90) return styles.toneCaution;
  return "";
}

/**
 * One learner on the section roster. The card shows the two figures a
 * principal scans for — general average and attendance — instead of hiding
 * them behind a hover; the hover/focus card adds the live term detail and the
 * risk level. When the adviser has not connected data sharing the live card
 * explains why the numbers are missing.
 */
export function StudentCard({ student }: { student: StudentRow }) {
  const flagged = student.riskLevel === "High" || student.riskLevel === "Moderate";
  const average = Number(student.overallAverage);
  const attendance = Number(student.attendanceRatePct);

  return (
    <HoverCard openDelay={140} closeDelay={90}>
      <HoverCardTrigger asChild>
        <article
          className={styles.board}
          tabIndex={0}
          aria-label={`${student.name}. Average ${
            Number.isFinite(average) ? average.toFixed(1) : "not available"
          }, attendance ${
            Number.isFinite(attendance) ? `${Math.round(attendance)} percent` : "not available"
          }.`}
        >
          <header className={styles.boardHead}>
            <StudentMascot
              name={student.name}
              seed={student.lrn}
              character={student.mascot ?? undefined}
              size={36}
            />
            <span className={styles.boardName}>
              <span className={styles.cellMain}>{student.name}</span>
              <Pill field="lrn" className="self-start">
                {student.lrn}
              </Pill>
            </span>
          </header>

          <div className={styles.boardStats}>
            <span className={styles.boardStat}>
              <span className={`${styles.boardStatValue} ${gradeTone(average)}`}>
                {Number.isFinite(average) ? average.toFixed(1) : "—"}
              </span>
              <span className={styles.boardStatLabel}>Average</span>
            </span>
            <span className={styles.boardStat}>
              <span className={`${styles.boardStatValue} ${attendanceTone(attendance)}`}>
                {Number.isFinite(attendance) ? `${Math.round(attendance)}%` : "—"}
              </span>
              <span className={styles.boardStatLabel}>Attendance</span>
            </span>
          </div>

          {flagged ? (
            <Pill
              tone={student.riskLevel === "High" ? "red" : "amber"}
              label="Risk level"
              className="mt-auto self-start"
            >
              <ShieldAlert size={11} aria-hidden />
              {student.riskLevel}
            </Pill>
          ) : (
            <Pill tone="green" label="Risk level" className="mt-auto self-start">
              {student.riskLevel}
            </Pill>
          )}
        </article>
      </HoverCardTrigger>

      <HoverCardContent align="start" side="bottom" className={`${styles.hoverContent} w-80 p-0`}>
        <StudentStatsBoard student={student} />
      </HoverCardContent>
    </HoverCard>
  );
}

function StudentStatsBoard({ student }: { student: StudentRow }) {
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.termId ?? "none"}:${activeTerm?.schoolYearId ?? "none"}`;
  const { data, isPending, isError } = useStudentHoverStats(student.studentId, termKey);

  const connection = data?.connected ?? false;
  const avg = data?.generalAverage ?? null;
  const pct = data?.attendance.pct ?? null;

  return (
    <div className={styles.hoverBoard} aria-live="polite">
      <header className={styles.hoverHead}>
        <StudentMascot
          name={student.name}
          seed={student.lrn}
          character={student.mascot ?? undefined}
          size={28}
        />
        <div className={styles.hoverTitleBlock}>
          <p className={styles.hoverName}>{student.name}</p>
          <Pill field="lrn" className="mt-0.5 self-start">
            {student.lrn}
          </Pill>
        </div>
      </header>

      <div className={styles.hoverMeta}>
        <Pill tone="neutral" label="Term">
          {data?.termLabel ?? "Active term"}
        </Pill>
        {data ? (
          <Pill tone="neutral" label="School year">
            {data.schoolYear}
          </Pill>
        ) : null}
        <Pill
          tone={
            student.riskLevel === "High"
              ? "red"
              : student.riskLevel === "Moderate"
                ? "amber"
                : "green"
          }
          label="Risk level"
        >
          {student.riskLevel}
        </Pill>
      </div>

      {isPending ? (
        <div className={styles.hoverLoading} aria-label="Loading live student stats">
          <span className={styles.hoverSkeleton} />
          <span className={styles.hoverSkeleton} />
        </div>
      ) : isError ? (
        <p className={styles.hoverWarnText}>Couldn&apos;t load live student stats.</p>
      ) : !connection ? (
        <div className={styles.hoverWarn}>
          <ShieldAlert size={15} className={styles.hoverWarnIcon} aria-hidden />
          <div className={styles.hoverWarnBody}>
            <p className={styles.hoverWarnTitle}>Adviser hasn&apos;t shared student data</p>
            <p className={styles.hoverWarnText}>
              Attendance, anecdotal records and averages appear once the class adviser
              turns on data sharing in Settings.
            </p>
          </div>
        </div>
      ) : (
        <>
          <span className={styles.hoverLive}>
            <ShieldCheck size={12} aria-hidden />
            Live · adviser sharing on
          </span>
          <div className={styles.hoverStats}>
            <div className={styles.hoverStat}>
              <span className={`${styles.hoverStatValue} ${attendanceTone(pct)}`}>
                {pct === null ? "—" : `${pct}%`}
              </span>
              <span className={styles.hoverStatLabel}>
                {data.attendance.total > 0
                  ? `Attendance · ${data.attendance.present}/${data.attendance.total} present`
                  : "Attendance · none yet"}
              </span>
            </div>
            <div className={styles.hoverStat}>
              <span className={styles.hoverStatValue}>{data.anecdoteCount}</span>
              <span className={styles.hoverStatLabel}>Anecdotal records</span>
            </div>
            <div className={styles.hoverStat}>
              <span className={`${styles.hoverStatValue} ${gradeTone(avg)}`}>
                {avg === null ? "—" : avg.toFixed(1)}
              </span>
              <span className={styles.hoverStatLabel}>
                {data.gradedSubjects > 0
                  ? `Average · ${data.gradedSubjects} subject${data.gradedSubjects === 1 ? "" : "s"}`
                  : "Average · no grades yet"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
