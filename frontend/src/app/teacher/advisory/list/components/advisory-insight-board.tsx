"use client";

import * as React from "react";
import { useLiveQuery } from "@/lib/api/live";
import {
  BookOpen,
  CalendarClock,
  FilePenLine,
  KanbanSquare,
  ShieldAlert,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import {
  AnecdotalRecordKanbanCard,
  humanizeCategory,
} from "@/components/anecdotal/anecdotal-record-kanban-card";
import { OcForm01PreviewDialog } from "@/components/ocform01/OcForm01PreviewDialog";
import { riskDotColor } from "@/lib/risk/status";
import type {
  AdviseeRow,
  AdviseeRiskFlag,
} from "@/services/teacher/advisory.types";
import type { StudentAcademic } from "@/services/teacher/adviseeAcademic.types";
import type { StudentAttendance } from "@/services/teacher/adviseeAttendance.types";
import { fetchStudentAcademic } from "@/services/teacher/adviseeAcademic.service";
import { fetchStudentAttendance } from "@/services/teacher/adviseeAttendance.service";
import { fetchAdviseeRisk, type AdviseeLiveRisk } from "@/services/teacher/advisory.service";
import { InsightBoardSkeleton } from "./advisory-list-skeleton";
import styles from "./advisory-insight-board.module.css";

const FACTOR_BADGE: Record<AdviseeRiskFlag, { label: string; variant: "amber" | "green" | "blue" }> = {
  academic: { label: "Academic", variant: "amber" },
  attendance: { label: "Attendance", variant: "green" },
  behavioral: { label: "Anecdotal", variant: "blue" },
};

/* Loading placeholders live in advisory-list-skeleton.tsx so the page shell and
   the board's own fetch render one identical shimmer skeleton. */

interface AnecdotalRecordItem {
  id: string;
  observationDatetime: string;
  category: string;
  confidentialityLevel: string;
  mine?: boolean;
  followupCount?: number;
}

interface AnecdotalResponse {
  student: { studentId: string; name: string; lrn: string; section: string };
  records: AnecdotalRecordItem[];
}

async function fetchAdviseeAnecdotal(studentId: string): Promise<AnecdotalResponse> {
  const { data } = await apiClient.get<AnecdotalResponse>(
    `/api/teacher/advisory/students/${encodeURIComponent(studentId)}/anecdotal`,
  );
  return data;
}

function generalAverageOf(row: AdviseeRow): number | null {
  const values = (row.liveGrades ?? [])
    .map((g) => g.average)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function recordDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function AdvisoryInsightBoard({
  student,
  bare = false,
}: {
  student: AdviseeRow | null;
  bare?: boolean;
}) {
  const studentId = student?.studentId ?? null;
  const isRoster = studentId?.startsWith("roster:") ?? false;
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const attendanceQuery = useLiveQuery<StudentAttendance>({
    queryKey: ["advisee-attendance", studentId],
    queryFn: () => fetchStudentAttendance(studentId as string),
    enabled: !!studentId,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const academicQuery = useLiveQuery<StudentAcademic>({
    queryKey: ["advisee-academic", studentId],
    queryFn: () => fetchStudentAcademic(studentId as string),
    enabled: !!studentId,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Roster-only learners are addressed as `roster:<id>` and the API serves their
  // records off `rosterId` too — the risk factor can be anecdotal for them, so
  // their categories must load (the API only returns the private write-up to the
  // observing teacher, never across the roster split).
  const anecdotalQuery = useLiveQuery<AnecdotalResponse>({
    queryKey: ["advisee-anecdotal", studentId],
    queryFn: () => fetchAdviseeAnecdotal(studentId as string),
    enabled: !!studentId,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Risk is computed live for the selected learner only — the advisory list no
  // longer scans the whole section's grades/attendance to badge every row.
  const riskQuery = useLiveQuery<AdviseeLiveRisk>({
    queryKey: ["advisee-risk", studentId],
    queryFn: () => fetchAdviseeRisk(studentId as string),
    enabled: !!studentId,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const liveAttendanceRate =
    attendanceQuery.data?.summary.rate ?? riskQuery.data?.attendanceRate ?? student?.attendanceRate ?? 1;
  const liveGeneralAverage = React.useMemo(() => {
    const fromAcademic = academicQuery.data?.summary.average ?? null;
    if (typeof fromAcademic === "number" && Number.isFinite(fromAcademic))
      return fromAcademic;
    return student ? generalAverageOf(student) : null;
  }, [academicQuery.data, student]);

  const liveGrades = React.useMemo(() => {
    const base = academicQuery.data
      ? academicQuery.data.grades
          .filter((g) => g.computedAverage !== null && !g.hiddenByTeacher)
          .map((g) => ({ subject: g.subject, average: g.computedAverage as number }))
      : (student?.liveGrades ?? [])
          .filter((g) => typeof g.average === "number" && Number.isFinite(g.average))
          .map((g) => ({
            subject: g.subject,
            average: g.average,
          }));
    return base.sort((a, b) => a.subject.localeCompare(b.subject));
  }, [academicQuery.data, student]);

  const anecdotalRecords: AnecdotalRecordItem[] = React.useMemo(
    () => anecdotalQuery.data?.records ?? [],
    [anecdotalQuery.data],
  );

  if (!student) {
    return (
      <div className={`${styles.board} ${bare ? styles.bare : ""}`} aria-label="Student insight">
        <header className={styles.boardHead}>
          <span className={styles.boardIcon} aria-hidden>
            <KanbanSquare size={18} />
          </span>
          <div className="min-w-0">
            <h2 className={styles.boardTitle}>Student insight</h2>
            <p className={styles.boardSub}>Select a row on the left to inspect</p>
          </div>
        </header>
        <p className={styles.empty}>No student selected.</p>
      </div>
    );
  }

  const loading =
    attendanceQuery.isPending ||
    academicQuery.isPending ||
    anecdotalQuery.isPending ||
    riskQuery.isPending;
  const riskLevel = riskQuery.data?.riskLevel ?? student.riskLevel;
  const hiddenGrades = academicQuery.data?.hiddenCount ?? 0;
  const attendanceRestricted = attendanceQuery.data?.restricted ?? false;
  const subjectSummary = attendanceQuery.data?.subjectSummary ?? null;
  const attendancePct = subjectSummary
    ? Math.round(subjectSummary.rate * 100)
    : Math.round(liveAttendanceRate * 100);
  // A not-yet-started term (or a term with no sessions on the axis) has no
  // attendance to report — never render a fabricated 0%/100%.
  const hasAttendanceData = subjectSummary
    ? subjectSummary.total > 0
    : (attendanceQuery.data?.summary.total ?? 0) > 0;
  const attRisk = subjectSummary
    ? subjectSummary.isRisk
    : (attendanceQuery.data?.summary.isRisk ?? false);
  const activeFlags = (riskQuery.data?.flags ?? student.flags ?? []).filter(
    (f) => f in FACTOR_BADGE,
  );
  const gradedSubjectCount = liveGrades.length;
  const offeredSubjectCount = academicQuery.data?.summary.subjects ?? gradedSubjectCount;
  const absentCount = subjectSummary?.absent ?? attendanceQuery.data?.summary.absent ?? 0;
  const lateCount = subjectSummary?.late ?? attendanceQuery.data?.summary.late ?? 0;

  return (
    <div className={`${styles.board} ${bare ? styles.bare : ""}`} aria-label={`Insight for ${student.name}`}>
      <header className={styles.boardHead}>
        <span className={styles.boardIcon} aria-hidden>
          <KanbanSquare size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={styles.boardTitle}>Student insight</h2>
        </div>
      </header>

      {loading ? (
        <div aria-busy="true" aria-label="Loading insight">
          <ShimmerGroup>
            <InsightBoardSkeleton />
          </ShimmerGroup>
        </div>
      ) : (
        <section className={styles.plainSection} aria-label="Risk and records">
          <header className={styles.laneHead}>
            <span
              className={styles.laneDot}
              style={{ background: riskDotColor(riskLevel) }}
              aria-hidden
            />
            <h3 className={styles.laneTitle}>Risk &amp; records</h3>
          </header>
          <ul className={styles.cardGrid} key={student.studentId}>
            <li className="min-w-0">
              <GlassCard className="h-full w-full min-w-0">
                <article
                  className={styles.kCard}
                  aria-label={`Risk level for ${student.name}: ${riskLevel}`}
                >
                <header className={styles.kHead}>
                  <span className={styles.kHeading}>
                    <span className={styles.kName}>Risk factors</span>
                  </span>
                  <span className={styles.kIconChip} aria-hidden>
                    <ShieldAlert size={13} />
                  </span>
                </header>
                <div className={styles.kMetrics}>
                  <div className={styles.kMetric}>
                    <span className={styles.kMetricLabel}>Current risk level</span>
                    <span className={styles.kLevelValue} data-level={riskLevel}>
                      {riskLevel}
                    </span>
                    <span className={styles.kMetricHint}>
                      {activeFlags.length === 0
                        ? "No active risk factors"
                        : `${activeFlags.length} active factor${activeFlags.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>
                <footer className={styles.kFacts}>
                  <span className={styles.kFact}>
                    <span className={styles.kFactLabel}>Factors</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                      {activeFlags.length === 0 ? (
                        <span className={styles.kFactValue}>None</span>
                      ) : (
                        activeFlags.map((f) => (
                          <Pill key={f} tone={FACTOR_BADGE[f].variant} label="Risk factor">
                            {FACTOR_BADGE[f].label}
                          </Pill>
                        ))
                      )}
                    </span>
                  </span>
                </footer>
                </article>
              </GlassCard>
            </li>

            <li className="min-w-0">
              <GlassCard className="h-full w-full min-w-0">
                <article className={styles.kCard} aria-label={`Attendance for ${student.name}`}>
                <header className={styles.kHead}>
                  <span className={styles.kHeading}>
                    <span className={styles.kName}>Attendance</span>
                  </span>
                  <span className={styles.kIconChip} aria-hidden>
                    <CalendarClock size={13} />
                  </span>
                </header>
                <div className={styles.kMetrics}>
                  <div className={styles.kMetric}>
                    <span className={styles.kMetricLabel}>Present rate</span>
                    <span className={styles.kLevelValue}>
                      {hasAttendanceData ? (
                        <>
                          {attendancePct}
                          <span className={styles.kUnit}>%</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className={styles.kMetricHint}>
                      {!hasAttendanceData
                        ? "No sessions in this term"
                        : subjectSummary
                          ? `${subjectSummary.present} of ${subjectSummary.total} meetups`
                          : attendanceQuery.data
                            ? `${attendanceQuery.data.summary.present} of ${attendanceQuery.data.summary.total} sessions`
                            : "Snapshot from roster"}
                    </span>
                    <div className={styles.kBar} aria-hidden>
                      <span
                        className={styles.kBarFill}
                        data-risk={attRisk && hasAttendanceData ? "true" : undefined}
                        style={{ width: `${hasAttendanceData ? Math.min(100, Math.max(0, attendancePct)) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                <footer className={styles.kFacts}>
                  {attendanceRestricted ? (
                    <span className={styles.kFact}>
                      <span className={styles.kFactLabel}>Note</span>
                      <span className={styles.kFactValue}>Some marks hidden</span>
                    </span>
                  ) : null}
                  <span className={styles.kFact}>
                    <span className={styles.kFactLabel}>Absent</span>
                    <span className={styles.kFactValue}>{hasAttendanceData ? absentCount : "—"}</span>
                  </span>
                  <span className={styles.kFact}>
                    <span className={styles.kFactLabel}>Late</span>
                    <span className={styles.kFactValue}>{hasAttendanceData ? lateCount : "—"}</span>
                  </span>
                </footer>
                </article>
              </GlassCard>
            </li>

            <li className="min-w-0">
              <GlassCard className="h-full w-full min-w-0">
                <article className={styles.kCard} aria-label={`Live academics for ${student.name}`}>
                <header className={styles.kHead}>
                  <span className={styles.kHeading}>
                    <span className={styles.kName}>Live academics</span>
                  </span>
                  <span className={styles.kIconChip} aria-hidden>
                    <BookOpen size={13} />
                  </span>
                </header>
                {liveGrades.length === 0 || liveGeneralAverage === null ? (
                  <div className={styles.kBody}>
                    <p className={styles.kEmpty}>
                      No live scores shared by subject teachers yet.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className={styles.kMetrics}>
                      <div className={styles.kMetric}>
                        <span className={styles.kMetricLabel}>General average</span>
                        <span
                          className={styles.kLevelValue}
                          aria-label={`General average ${liveGeneralAverage.toFixed(1)} across ${gradedSubjectCount} subject${gradedSubjectCount === 1 ? "" : "s"} with grades`}
                        >
                          {liveGeneralAverage.toFixed(1)}
                          <span className={styles.kUnit}>avg</span>
                        </span>
                        <span className={styles.kMetricHint}>
                          Averaged across graded subjects only
                        </span>
                        <div className={styles.kBar} aria-hidden>
                          <span
                            className={styles.kBarFill}
                            style={{
                              width: `${offeredSubjectCount > 0 ? Math.min(100, (gradedSubjectCount / offeredSubjectCount) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <footer className={styles.kFacts}>
                      <span className={styles.kFact}>
                        <span className={styles.kFactLabel}>Graded</span>
                        <span className={styles.kFactValue}>{gradedSubjectCount}</span>
                      </span>
                      <span className={styles.kFact}>
                        <span className={styles.kFactLabel}>Offered</span>
                        <span className={styles.kFactValue}>{offeredSubjectCount}</span>
                      </span>
                      {hiddenGrades > 0 ? (
                        <span className={styles.kFact}>
                          <span className={styles.kFactLabel}>Hidden</span>
                          <span className={styles.kFactValue}>{hiddenGrades}</span>
                        </span>
                      ) : null}
                    </footer>
                  </>
                )}
                </article>
              </GlassCard>
            </li>

            <li className={`min-w-0 ${styles.laneWide}`}>
              <GlassCard className="h-full w-full min-w-0" intensity={0}>
                <article
                  className={styles.kCard}
                  aria-label={`Anecdotal records for ${student.name}`}
                >
                <header className={styles.kHead}>
                  <span className={styles.kHeading}>
                    <span className={styles.kName}>Anecdotal</span>
                    <Pill tone="neutral" label="Records filed">
                      {anecdotalRecords.length} filed
                    </Pill>
                  </span>
                  <span className={styles.kIconChip} aria-hidden>
                    <FilePenLine size={13} />
                  </span>
                </header>
                <div className={styles.kBody}>
                  {anecdotalRecords.length === 0 ? (
                    <p className={styles.kEmpty}>
                      {isRoster
                        ? "Roster-only file — category only, never the private write-up."
                        : "No anecdotal records this term."}
                    </p>
                  ) : (
                    <ul className={styles.folderGrid}>
                      {anecdotalRecords.map((r) => {
                        const category = String(r.category);
                        const label = humanizeCategory(category);
                        const filed = recordDate(r.observationDatetime);
                        return (
                          <li key={r.id} className="min-w-0">
                            <AnecdotalRecordKanbanCard
                              category={category}
                              studentName={student.name}
                              metaText={filed}
                              metaLabel="Filed"
                              fileName={`GCForm-01_${filed}`}
                              fileTag={label}
                              layout="horizontal"
                              headerRight={
                                <Pill
                                  tone={
                                    r.confidentialityLevel === "confidential" ? "red" : "neutral"
                                  }
                                  label="Confidentiality level"
                                >
                                  {r.confidentialityLevel === "confidential"
                                    ? "Confidential"
                                    : "Restricted"}
                                </Pill>
                              }
                              openLabel={`Open ${student.name}'s ${label} record from ${filed}`}
                              onOpen={() => setPreviewId(r.id)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                </article>
              </GlassCard>
            </li>
          </ul>
        </section>
      )}

      <OcForm01PreviewDialog recordId={previewId} onClose={() => setPreviewId(null)} />
    </div>
  );
}
