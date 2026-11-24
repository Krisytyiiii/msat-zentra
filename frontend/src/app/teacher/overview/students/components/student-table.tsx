"use client";
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { BookOpen, CalendarClock, ClipboardList, Users } from "lucide-react";
import { InsightCallout } from "@/components/ui/insight-callout";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import type { StudentListRow } from "@/services/teacher/studentList.types";
import styles from "./student-list.module.css";

function attendanceTone(pct: number | null): PillTone {
  if (pct === null) return "neutral";
  if (pct >= 90) return "green";
  if (pct >= 80) return "amber";
  return "red";
}

function gradeTone(grade: number | null): PillTone {
  if (grade === null) return "neutral";
  if (grade >= 90) return "green";
  if (grade >= 75) return "blue";
  return "red";
}

/** One student as its own mini kanban board — same card language as the
 *  principal academics roster, with the teacher's attendance/grade metrics
 *  shown inline instead of behind a hover card. */
function StudentCard({ row, showAnecdotal }: { row: StudentListRow; showAnecdotal: boolean }) {
  const pct = row.attendancePercentage;
  const grade = row.academicGrade;
  const hasMeetups = row.attendanceTotal > 0;
  return (
    <GlassCard className="h-full min-w-0">
      <article className={styles.studentCard} aria-label={`${row.name}, ${row.lrn}`}>
        <header className={styles.studentCardHead}>
          <StudentMascot
            name={row.name}
            seed={row.lrn}
            character={row.mascot ?? undefined}
            size={32}
          />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <p className={styles.studentCardName} title={row.name}>
              {row.name}
            </p>
            <Pill
              tone="neutral"
              label="LRN"
              className={`${styles.studentCardLrn} tabular-nums`}
            >
              {row.lrn}
            </Pill>
          </div>
        </header>
        <div className={styles.studentCardBody}>
          <div
            className={`${styles.studentCardStats}${showAnecdotal ? "" : ` ${styles.studentCardStatsTwo}`}`}
          >
            <div className={styles.studentCardStat}>
              <span className={styles.sectionCardStatIcon} aria-hidden>
                <CalendarClock />
              </span>
              <Pill
                tone={attendanceTone(pct)}
                label="Attendance"
                className="tabular-nums"
              >
                {pct === null ? "—" : `${pct}%`}
              </Pill>
              <span
                className={styles.studentCardStatLabel}
                title={
                  hasMeetups
                    ? `${row.attendancePresent} of ${row.attendanceTotal} meetups present`
                    : "No attendance meetups yet"
                }
              >
                {hasMeetups ? `${row.attendancePresent}/${row.attendanceTotal}` : "No meetups"}
              </span>
            </div>
            <div className={styles.studentCardStat}>
              <span className={styles.sectionCardStatIcon} aria-hidden>
                <BookOpen />
              </span>
              <Pill tone={gradeTone(grade)} label="Academic grade" className="tabular-nums">
                {grade === null ? "—" : grade}
              </Pill>
              <span className={styles.studentCardStatLabel}>
                {row.computedAverage !== null
                  ? `Avg ${Math.round(row.computedAverage * 10) / 10}`
                  : "No average"}
              </span>
            </div>
            {showAnecdotal ? (
              <div className={styles.studentCardStat}>
                <span className={styles.sectionCardStatIcon} aria-hidden>
                  <ClipboardList />
                </span>
                <Pill
                  tone={row.anecdotalCount > 0 ? "amber" : "neutral"}
                  label="Anecdotal"
                  className="tabular-nums"
                >
                  {row.anecdotalCount}
                </Pill>
                <span className={styles.studentCardStatLabel}>Anecdotal</span>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </GlassCard>
  );
}

export function StudentTable({
  headerTitle,
  rows,
  rosterPending,
  rosterError,
  emptySectionName,
  showAnecdotal,
}: {
  headerTitle: React.ReactNode;
  rows: StudentListRow[];
  rosterPending: boolean;
  rosterError: boolean;
  emptySectionName: string;
  showAnecdotal: boolean;
}) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.lrn.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      style={{ willChange: "transform, opacity" }}
    >
    <section aria-label="Student list" className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
          <Users size={14} aria-hidden className="shrink-0 text-blue-500" />
          <span className="min-w-0">{headerTitle}</span>
        </p>
        <TeacherSearchField
          className="w-60"
          placeholder="Search students…"
          value={query}
          onChange={setQuery}
          aria-label="Filter students"
        />
      </div>
      {rosterPending ? (
        <ShimmerGroup>
          <div
            className={styles.studentCardGrid}
            role="status"
            aria-label="Loading students"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.studentCard} aria-hidden="true">
                <header className={styles.studentCardHead}>
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-4 w-24 rounded-full" />
                  </div>
                </header>
                <div className={styles.studentCardBody}>
                  <div className={styles.studentCardStats}>
                    {Array.from({ length: 3 }).map((__, j) => (
                      <div key={j} className={styles.studentCardStat}>
                        <Skeleton className="size-6 rounded-md" />
                        <Skeleton className="h-4 w-8 rounded-full" />
                        <Skeleton className="h-3 w-12 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ShimmerGroup>
      ) : rosterError ? (
        <p role="alert" className="flex min-h-24 items-center justify-center px-1 py-8 text-center text-xs text-destructive">
          Could not load students for this class.
        </p>
      ) : rows.length === 0 ? (
        <div className="flex min-h-[calc(100dvh-14rem)] w-full items-center justify-center px-1 py-10">
          <InsightCallout role="status" className="w-fit max-w-xl text-center">
            <strong>No students in this section yet.</strong>{" "}
            {emptySectionName
              ? `${emptySectionName} has no enrolled learners this term.`
              : "Enrolled learners will appear here once the roster is finalized."}
          </InsightCallout>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[calc(100dvh-14rem)] w-full items-center justify-center px-1 py-10">
          <InsightCallout role="status" className="w-fit max-w-xl text-center">
            {searchEmptyMessage(query, "students")}
          </InsightCallout>
        </div>
      ) : (
        <div className={styles.studentCardGrid} aria-label="Student list">
          {filtered.map((row) => (
            <StudentCard key={row.studentId} row={row} showAnecdotal={showAnecdotal} />
          ))}
        </div>
      )}
    </section>
    </motion.div>
  );
}
