"use client";

import * as React from "react";
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Flag,
  HeartHandshake,
  ListChecks,
  MapPin,
  Paperclip,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SidePanel } from "@/components/ui/side-panel";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import { formatStatus } from "@/lib/labels/text";
import { formatSurnameFirst } from "@/lib/names";
import { useTerm } from "@/lib/term/TermContext";
import type {
  AdvisoryInterventionRow,
  AdvisoryInterventionSession,
} from "@/services/teacher/interventions.service";
import {
  formatDate,
  formatDateTime,
  sessionStatusTone,
} from "./intervention-row";
import styles from "./intervention-detail.module.css";

const FACTORS: {
  key: keyof AdvisoryInterventionRow["factors"];
  label: string;
  text: string;
}[] = [
  { key: "academic", label: "Academic", text: "text-amber-600 dark:text-amber-400" },
  { key: "attendance", label: "Attendance", text: "text-sky-600 dark:text-sky-400" },
  { key: "behavioral", label: "Anecdotal", text: "text-rose-600 dark:text-rose-400" },
];

const RISK_TEXT: Record<string, string> = {
  High: "text-red-600 dark:text-red-400",
  Moderate: "text-amber-600 dark:text-amber-400",
  Low: "text-emerald-600 dark:text-emerald-400",
};

const STAT_TONES = {
  amber: styles.statAmber,
  rose: styles.statRose,
  blue: styles.statBlue,
  green: styles.statGreen,
} as const;

/** Section head shared by every panel on the sheet. */
function Panel({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: React.ElementType;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h3 className={styles.panelTitle}>
          <span className={styles.panelIcon} aria-hidden>
            <Icon size={12} />
          </span>
          {title}
        </h3>
        {aside}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

/** One figure on the case-at-a-glance strip. */
function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  tone: keyof typeof STAT_TONES;
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statIcon} ${STAT_TONES[tone]}`} aria-hidden>
        <Icon size={15} />
      </span>
      <div className={styles.statBody}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statHint}>{hint}</span>
      </div>
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.metaItem}>
      <dt className={styles.metaLabel}>{label}</dt>
      <dd className={styles.metaValue}>{children}</dd>
    </div>
  );
}

function NoteBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.note}>
      <p className={styles.noteLabel}>{label}</p>
      <p className={styles.noteText}>{children}</p>
    </div>
  );
}

/** One counselling session on the vertical timeline. */
function SessionItem({
  session,
  index,
  last,
}: {
  session: AdvisoryInterventionSession;
  index: number;
  last: boolean;
}) {
  const dot =
    session.status === "completed"
      ? styles.sessionDone
      : session.status === "cancelled"
        ? styles.sessionCancelled
        : styles.sessionBooked;

  return (
    <li className={styles.session}>
      <div className={styles.sessionRail} aria-hidden>
        <span className={`${styles.sessionDot} ${dot}`}>{index + 1}</span>
        {last ? null : <span className={styles.sessionLine} />}
      </div>

      <div className={styles.sessionBody}>
        <div className={styles.sessionHead}>
          <span className={styles.sessionType}>
            {sessionTypeLabel(session.sessionType)}
          </span>
          <Pill tone={sessionStatusTone(session.status)} label="Session status">
            {formatStatus(session.status)}
          </Pill>
          {session.rescheduleCount > 0 ? (
            <Pill
              tone="amber"
              label={
                session.rescheduleCount > 1
                  ? `Rescheduled session — moved ${session.rescheduleCount} times`
                  : "Rescheduled session — moved once"
              }
            >
              <RotateCcw size={10} aria-hidden />
              {session.rescheduleCount > 1
                ? `Rescheduled ×${session.rescheduleCount}`
                : "Rescheduled"}
            </Pill>
          ) : null}
          {session.attachmentsCount > 0 ? (
            <Pill tone="neutral" label="Attachments">
              <Paperclip size={10} aria-hidden />
              {session.attachmentsCount}
            </Pill>
          ) : null}
          <span className={styles.sessionTime}>
            {formatDateTime(session.scheduledAt)}
          </span>
        </div>

        {session.venue ? (
          <p className={styles.sessionLineText}>
            <MapPin size={11} aria-hidden />
            {session.venue}
          </p>
        ) : null}
        {session.sessionNotes ? (
          <p className={styles.sessionText}>{session.sessionNotes}</p>
        ) : null}
        {session.outcome ? (
          <p className={styles.sessionLineText}>
            <span className="font-semibold text-foreground">Outcome:</span>
            {session.outcome}
          </p>
        ) : null}
        {session.cancelReason ? (
          <p className={styles.sessionDanger}>
            <span className="font-semibold">Cancelled:</span> {session.cancelReason}
          </p>
        ) : null}
        {session.completedAt ? (
          <p className={styles.sessionLineText}>
            Completed {formatDate(session.completedAt)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function CaseSheet({ row }: { row: AdvisoryInterventionRow }) {
  const intervention = row.intervention;
  const activeFactors = FACTORS.filter((factor) => row.factors[factor.key]);
  const sessions = intervention?.sessions ?? [];
  const doneCount = sessions.filter((session) => session.status === "completed").length;
  const scheduledCount = sessions.filter((session) => session.status === "scheduled").length;
  const nextSession = sessions.find((session) => session.status === "scheduled");

  return (
    <div className={styles.sheet}>
      {/* Case at a glance */}
      <div className={styles.stats}>
        <StatTile
          icon={Flag}
          tone="amber"
          label="Flagged"
          value={formatDate(row.detectedAt)}
          hint={`${row.riskCount} flag${row.riskCount === 1 ? "" : "s"} this term`}
        />
        <StatTile
          icon={HeartHandshake}
          tone="rose"
          label="Risk level"
          value={
            <span className={RISK_TEXT[row.riskLevel] ?? "text-foreground"}>
              {row.riskLevel}
            </span>
          }
          hint={
            activeFactors.length > 0 ? (
              <span className="inline-flex flex-wrap items-center gap-x-1">
                {activeFactors.map((factor, index) => (
                  <span key={factor.key} className="inline-flex items-center gap-x-1">
                    {index > 0 ? (
                      <span aria-hidden className="text-border">
                        |
                      </span>
                    ) : null}
                    <span className={factor.text}>{factor.label}</span>
                  </span>
                ))}
              </span>
            ) : (
              "No active factor"
            )
          }
        />
        <StatTile
          icon={ListChecks}
          tone="blue"
          label="Sessions done"
          value={intervention ? `${doneCount}` : "—"}
          hint={scheduledCount > 0 ? `${scheduledCount} booked` : "None booked"}
        />
        <StatTile
          icon={CalendarClock}
          tone="green"
          label="Next session"
          value={nextSession ? formatDate(nextSession.scheduledAt) : "—"}
          hint={
            nextSession
              ? `${sessionTypeLabel(nextSession.sessionType)}${
                  nextSession.rescheduleCount > 0 ? " · Rescheduled" : ""
                }`
              : "Not scheduled"
          }
        />
      </div>

          <Panel
            icon={ClipboardList}
            title="Follow-up plan"
            aside={
              intervention ? (
                intervention.priority ? (
                  <Pill
                    tone={
                      intervention.priority === "high"
                        ? "red"
                        : intervention.priority === "low"
                          ? "neutral"
                          : "blue"
                    }
                    label="Priority"
                  >
                    {formatStatus(intervention.priority)} priority
                  </Pill>
                ) : null
              ) : (
                <Pill tone="neutral" label="Plan state">
                  Not opened
                </Pill>
              )
            }
          >
            {intervention ? (
              <>
                <div className={styles.action}>
                  <p className={styles.actionLabel}>Recommended action</p>
                  <p className={styles.actionText}>{intervention.recommendedAction}</p>
                </div>
                <dl className={styles.metaGrid}>
                  <MetaItem label="Assignee">
                    {intervention.assignee ?? "Not assigned yet"}
                  </MetaItem>
                  <MetaItem label="Assigned">
                    {formatDate(intervention.assignedAt)}
                  </MetaItem>
                  <MetaItem label="Priority">
                    {intervention.priority
                      ? `${formatStatus(intervention.priority)} priority`
                      : "Not set"}
                  </MetaItem>
                </dl>
                {intervention.intakeNotes ? (
                  <NoteBlock label="Intake notes">{intervention.intakeNotes}</NoteBlock>
                ) : null}
                {intervention.outcomeNotes ? (
                  <NoteBlock label="Outcome notes">{intervention.outcomeNotes}</NoteBlock>
                ) : null}
              </>
            ) : (
              <div className={styles.planEmpty}>
                <HeartHandshake size={14} className={styles.planEmptyIcon} aria-hidden />
                <p className={styles.planEmptyText}>
                  <strong className="font-semibold">No plan yet.</strong> Guidance has
                  flagged this learner but has not opened an intervention for the
                  current term.
                </p>
              </div>
            )}
          </Panel>

        <Panel
          icon={CalendarDays}
          title="Counseling sessions"
          aside={
            sessions.length > 0 ? (
              <div className="flex items-center gap-1">
                {doneCount > 0 ? <Pill tone="green">{doneCount} done</Pill> : null}
                {scheduledCount > 0 ? (
                  <Pill tone="blue">{scheduledCount} booked</Pill>
                ) : null}
              </div>
            ) : null
          }
        >
          {sessions.length > 0 ? (
            <ul className={styles.sessions}>
              {sessions.map((session, index) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  index={index}
                  last={index === sessions.length - 1}
                />
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden>
                <CalendarClock size={15} />
              </span>
              <p className={styles.emptyTitle}>No sessions booked yet</p>
              <p className={styles.emptyCopy}>
                The guidance desk books the first counseling session.
              </p>
            </div>
          )}
        </Panel>
    </div>
  );
}

export function InterventionDetailOverlay({
  row,
  onClose,
}: {
  row: AdvisoryInterventionRow | null;
  onClose: () => void;
}) {
  const { activeTerm } = useTerm();

  return (
    <SidePanel
      open={!!row}
      onClose={onClose}
      label={row ? `${row.name} — intervention case` : "Intervention case"}
      width="3xl"
      showCloseButton
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border py-3 pl-4 pr-14">
          {row ? (
            <StudentMascot
              name={row.name}
              seed={row.lrn}
              character={row.mascot ?? undefined}
              size={36}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
              {row ? formatSurnameFirst(row.name) : "Intervention case"}
            </h2>
            {row ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                <span>
                  LRN:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {row.lrn || "—"}
                  </span>
                </span>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span>
                  Section:{" "}
                  <span className="font-medium text-foreground">{row.section || "—"}</span>
                </span>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span>
                  Grade level:{" "}
                  <span className="font-medium text-foreground">
                    {row.gradeLevel ? row.gradeLevel.replace(/^G/, "Grade ") : "—"}
                  </span>
                </span>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span>
                  Term:{" "}
                  <span className="font-medium text-foreground">
                    {activeTerm ? `Term ${activeTerm.termNumber}` : "—"}
                  </span>
                </span>
                <span aria-hidden className="text-border">
                  |
                </span>
                <span>
                  School year:{" "}
                  <span className="font-medium text-foreground">
                    {activeTerm?.schoolYearName ?? "—"}
                  </span>
                </span>
              </p>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {row ? <CaseSheet key={row.key} row={row} /> : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-[12px] text-muted-foreground">
            Read-only — the guidance desk owns this follow-up.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </SidePanel>
  );
}
