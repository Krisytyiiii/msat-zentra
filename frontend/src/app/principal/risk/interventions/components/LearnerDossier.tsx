"use client";

import * as React from "react";
import {
  Bell,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { cn } from "@/lib/utils";
import { outcomeLabel, outcomeTone, riskTone } from "@/lib/labels/status-tone";
import type { InterventionSession, RiskSnapshotStudent } from "../types";
import {
  FACTOR_META,
  RISK_COLOR,
  ageInDays,
  humanAge,
  laneOf,
} from "./intervention-model";
import { canAlert } from "./intervention-helpers";
import styles from "./InterventionBriefing.module.css";

const LANE_COPY = {
  "needs-plan": { label: "No session booked", tone: "amber" as const },
  "in-progress": { label: "Plan in progress", tone: "blue" as const },
  recovering: { label: "Recovering", tone: "green" as const },
};

const SESSION_STATUS_COPY: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Did not attend",
  rescheduled: "Rescheduled",
};

function prettyEnum(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function shortDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function SessionRow({ session }: { session: InterventionSession }) {
  const cancelled = session.status === "cancelled";
  const done = session.status === "completed";
  return (
    <li className={styles.sessionRow}>
      <span
        className={cn(
          styles.sessionDot,
          done && styles.sessionDotDone,
          cancelled && styles.sessionDotCancelled,
        )}
        aria-hidden="true"
      >
        {done ? <CheckCircle2 size={11} /> : <CalendarClock size={11} />}
      </span>
      <div className={styles.sessionBody}>
        <p className={styles.sessionTitle}>
          {prettyEnum(session.sessionType) || "Guidance session"}
          <span className={styles.sessionWhen}>
            {shortDate(session.scheduledAt, true)}
          </span>
        </p>
        <p className={styles.sessionMeta}>
          {SESSION_STATUS_COPY[session.status] ?? prettyEnum(session.status)}
          {session.venue ? ` · ${session.venue}` : ""}
        </p>
        {cancelled && session.cancelReason ? (
          <p className={styles.sessionNote}>{session.cancelReason}</p>
        ) : null}
      </div>
    </li>
  );
}

export function LearnerDossier({
  student,
  now,
  onAlert,
}: {
  student: RiskSnapshotStudent;
  now: number;
  onAlert: (student: RiskSnapshotStudent) => void;
}) {
  const lane = laneOf(student);
  const laneCopy = LANE_COPY[lane];
  const detected = ageInDays(student.snapshotDate, now);
  const intervention = student.intervention;
  const flaggedSubjects = React.useMemo(
    () =>
      student.subjectGrades
        .filter((subject) => subject.computedAverage !== null || subject.transmutedGrade !== null)
        .sort((a, b) => {
          const av = a.computedAverage ?? a.transmutedGrade ?? 100;
          const bv = b.computedAverage ?? b.transmutedGrade ?? 100;
          return av - bv;
        })
        .slice(0, 5),
    [student.subjectGrades],
  );
  const sessions = React.useMemo(
    () =>
      [...(intervention?.sessions ?? [])].sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
      ),
    [intervention],
  );
  const academicBelow = student.subjectGrades.filter((s) => s.belowThreshold).length;

  const signals = [
    {
      key: "academic",
      icon: GraduationCap,
      label: FACTOR_META.Academic.label,
      active: student.factors.academic,
      detail: student.factors.academic
        ? academicBelow > 0
          ? `${academicBelow} subject${academicBelow === 1 ? " is" : "s are"} below the passing mark of 75.`
          : "The grade average is below the passing mark of 75."
        : "Grades are at or above the passing mark.",
    },
    {
      key: "attendance",
      icon: CalendarCheck2,
      label: FACTOR_META.Attendance.label,
      active: student.factors.attendance,
      detail: student.factors.attendance
        ? "Attendance is below the 80% requirement this term."
        : "Attendance is within the school requirement.",
    },
    {
      key: "behavioral",
      icon: MessageSquareText,
      label: FACTOR_META.Behavioral.label,
      active: student.factors.behavioral,
      detail: student.factors.behavioral
        ? "At least one anecdotal record is on file."
        : "No anecdotal record is on file.",
    },
  ];

  return (
    <article className={styles.dossier} aria-label={`Case file for ${student.studentName}`}>
      <header className={styles.dossierHead}>
        <span className={styles.avatar}>
          <StudentMascot
            name={student.studentName}
            seed={student.lrn}
            character={student.mascot ?? undefined}
            size={56}
          />
        </span>
        <div className={styles.identity}>
          <h2 className={styles.name}>{student.studentName}</h2>
          <div className={styles.metaRow}>
            <Pill label="Grade level" field="grade">
              {student.gradeLevel}
            </Pill>
            <Pill label="Section" field="section">
              {student.section}
            </Pill>
            <Pill label="LRN" field="lrn" className="tabular-nums">
              {student.lrn}
            </Pill>
          </div>
        </div>
        <div className={styles.statusCol}>
          <Pill tone={riskTone(student.riskLevel)} label="Risk level">
            {student.riskLevel} risk
          </Pill>
          <Pill tone={laneCopy.tone} label="Plan status">
            {laneCopy.label}
          </Pill>
          <span className={styles.detected}>
            Detected{" "}
            {detected === null ? "—" : detected <= 0 ? "today" : `${humanAge(detected)} ago`}
          </span>
        </div>
      </header>

      <section className={styles.block} aria-labelledby="case-signals">
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle} id="case-signals">
            Why the system flagged this learner
          </h3>
          <span className={styles.riskKey} style={{ color: RISK_COLOR[student.riskLevel] }}>
            {student.riskLevel} risk · {student.riskCount} signal
            {student.riskCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className={styles.signals}>
          {signals.map((signal) => {
            const Icon = signal.icon;
            return (
              <div
                key={signal.key}
                className={cn(styles.signal, !signal.active && styles.signalMuted)}
              >
                <span className={styles.signalIcon} aria-hidden="true">
                  <Icon size={14} />
                </span>
                <div className={styles.signalBody}>
                  <p className={styles.signalLabel}>
                    {signal.label}
                    <span className={styles.signalState}>
                      {signal.active ? "Flagging" : "Clear"}
                    </span>
                  </p>
                  <p className={styles.signalDetail}>{signal.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.block} aria-labelledby="case-grades">
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle} id="case-grades">
            Grades to watch
          </h3>
          <span className={styles.blockHint}>
            {flaggedSubjects.length > 0 ? "Lowest subjects this term" : "No grades on file"}
          </span>
        </div>
        {flaggedSubjects.length === 0 ? (
          <p className={styles.note}>No subject grades have been recorded for this learner yet.</p>
        ) : (
          <ul className={styles.gradeList}>
            {flaggedSubjects.map((subject) => {
              const value = subject.computedAverage ?? subject.transmutedGrade ?? 0;
              const tone = subject.belowThreshold ? "#f59e0b" : "#22c55e";
              return (
                <li key={subject.code || subject.subject} className={styles.gradeRow}>
                  <span className={styles.gradeName} title={subject.subject}>
                    {subject.subject}
                  </span>
                  <span className={styles.gradeTrack} aria-hidden="true">
                    <span
                      className={styles.gradeFill}
                      style={{
                        width: `${Math.max(2, Math.min(100, value))}%`,
                        background: tone,
                      }}
                    />
                  </span>
                  <span
                    className={styles.gradeValue}
                    style={{ color: subject.belowThreshold ? "var(--foreground)" : undefined }}
                  >
                    {value ? Math.round(value) : "—"}
                    {subject.belowThreshold ? <em className={styles.belowTag}>below 75</em> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.block} aria-labelledby="case-plan">
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle} id="case-plan">
            Guidance response
          </h3>
          {intervention ? (
            <Pill tone={outcomeTone(intervention.outcomeStatus)} label="Plan outcome">
              {outcomeLabel(intervention.outcomeStatus)}
            </Pill>
          ) : (
            <span className={styles.blockHint}>No plan opened</span>
          )}
        </div>

        {intervention ? (
          <>
            <dl className={styles.planMeta}>
              <div>
                <dt>Plan opened</dt>
                <dd>{shortDate(intervention.createdAt)}</dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>{intervention.assignedStaffName ?? "Not assigned yet"}</dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>
                  <Pill
                    tone={
                      intervention.approvalStatus === "approved"
                        ? "green"
                        : intervention.approvalStatus === "pending"
                          ? "amber"
                          : "neutral"
                    }
                    label="Approval status"
                  >
                    {prettyEnum(intervention.approvalStatus)}
                  </Pill>
                </dd>
              </div>
            </dl>
            <p className={styles.action}>
              <UserRound size={13} aria-hidden="true" />
              <span>{intervention.recommendedAction}</span>
            </p>
            {sessions.length === 0 ? (
              <p className={styles.note}>
                The plan is on file, but no guidance session has been booked yet.
              </p>
            ) : (
              <ol className={styles.sessions}>
                {sessions.slice(0, 4).map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ol>
            )}
            {intervention.outcomeNotes ? (
              <p className={styles.note}>{intervention.outcomeNotes}</p>
            ) : null}
          </>
        ) : (
          <div className={styles.emptyPlan}>
            <p className={styles.emptyPlanTitle}>Guidance has not opened a plan for this learner.</p>
            <p className={styles.emptyPlanText}>
              Send an alert so the guidance desk picks the case up. The alert reaches every active
              counselor and records who raised it.
            </p>
            <Button size="sm" onClick={() => onAlert(student)}>
              <Bell size={14} aria-hidden="true" />
              Alert guidance
            </Button>
          </div>
        )}
      </section>

      <footer className={styles.dossierFoot}>
        {canAlert(student) && intervention ? (
          <Button variant="outline" size="sm" onClick={() => onAlert(student)}>
            <Bell size={14} aria-hidden="true" />
            Alert guidance again
          </Button>
        ) : (
          <span className={styles.footNote}>
            Guidance is handling this case. Review the sessions above for progress.
          </span>
        )}
        <span className={styles.footMeta}>
          {student.riskCount} risk signal{student.riskCount === 1 ? "" : "s"} ·{" "}
          {student.riskLevel.toLowerCase()} risk
        </span>
      </footer>
    </article>
  );
}
