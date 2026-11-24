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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { outcomeLabel, outcomeTone, riskTone } from "@/lib/labels/status-tone";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import { formatStatus } from "@/lib/labels/text";
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
  tone: "amber" | "sky" | "rose";
}[] = [
  { key: "academic", label: "Academic", tone: "amber" },
  { key: "attendance", label: "Attendance", tone: "sky" },
  { key: "behavioral", label: "Anecdotal", tone: "rose" },
];

type SheetTab = "overview" | "sessions";

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
  hint: string;
}) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statIcon} ${STAT_TONES[tone]}`} aria-hidden>
        <Icon size={13} />
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

/** LRN pill — the number advisers read out to the registrar. */
function LrnPill({ lrn }: { lrn: string | null }) {
  return (
    <Pill field="lrn" className="tabular-nums">
      {lrn || "—"}
    </Pill>
  );
}

function CaseSheet({ row }: { row: AdvisoryInterventionRow }) {
  const [tab, setTab] = React.useState<SheetTab>("overview");
  const intervention = row.intervention;
  const activeFactors = FACTORS.filter((factor) => row.factors[factor.key]);
  const sessions = intervention?.sessions ?? [];
  const doneCount = sessions.filter((session) => session.status === "completed").length;
  const scheduledCount = sessions.filter((session) => session.status === "scheduled").length;
  const nextSession = sessions.find((session) => session.status === "scheduled");

  const showSessionsTab = Boolean(intervention);
  const activeTab: SheetTab = showSessionsTab ? tab : "overview";

  return (
    <div className={styles.sheet}>
      {/* Identity + state */}
      <div className={styles.identity}>
        <StudentMascot
          name={row.name}
          seed={row.lrn}
          character={row.mascot ?? undefined}
          size={46}
        />
        <div className={styles.identityBody}>
          <div className={styles.identityTop}>
            <p className={styles.identityName}>{row.name}</p>
            <Pill tone={riskTone(row.riskLevel)} label="Risk level">
              {row.riskLevel} risk
            </Pill>
          </div>
          <div className={styles.identityMeta}>
            <LrnPill lrn={row.lrn} />
            <Pill field="grade">{row.gradeLevel || "—"}</Pill>
            {row.section ? (
              <Pill field="section" title={row.section}>
                {row.section}
              </Pill>
            ) : null}
          </div>
        </div>
        <div className={styles.identityState}>
          <Pill
            tone={intervention ? outcomeTone(intervention.outcomeStatus) : "neutral"}
            label="Intervention state"
          >
            {intervention ? outcomeLabel(intervention.outcomeStatus) : "No plan yet"}
          </Pill>
        </div>
      </div>

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
          label="Risk factors"
          value={`${activeFactors.length} active`}
          hint={
            activeFactors.length > 0
              ? activeFactors.map((factor) => factor.label).join(" · ")
              : "None active"
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
          hint={nextSession ? sessionTypeLabel(nextSession.sessionType) : "Not scheduled"}
        />
      </div>

      {/* In-sheet navigation */}
      {showSessionsTab ? (
        <FilterTabs
          label="Case detail views"
          options={[
            { value: "overview" as const, label: "Overview", tone: "amber" as const },
            { value: "sessions" as const, label: "Sessions", count: sessions.length, tone: "blue" as const },
          ]}
          value={activeTab}
          onChange={setTab}
          variant="tags"
          className="self-start"
        />
      ) : null}

      {activeTab === "overview" ? (
        <>
          <Panel
            icon={HeartHandshake}
            title="Risk factors"
            aside={
              <span className={styles.panelCount}>
                {activeFactors.length} active
              </span>
            }
          >
            {activeFactors.length > 0 ? (
              <div className={styles.factorRow}>
                {activeFactors.map((factor) => (
                  <Pill
                    key={factor.key}
                    tone={factor.tone}
                    label={`${factor.label} risk factor`}
                  >
                    {factor.label}
                  </Pill>
                ))}
              </div>
            ) : (
              <p className={styles.factorNone}>
                No risk factor is currently active for this term.
              </p>
            )}
          </Panel>

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
        </>
      ) : (
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
      )}
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
  return (
    <KanbanOverlay
      open={!!row}
      onClose={onClose}
      title={row?.name ?? "Intervention"}
      ariaLabel={row ? `Intervention details for ${row.name}` : "Intervention details"}
      icon={
        <span className="text-amber-600 dark:text-amber-400" aria-hidden>
          <HeartHandshake size={14} />
        </span>
      }
      description={
        row
          ? `Flagged ${formatDate(row.detectedAt)} · read-only mirror of the guidance follow-up`
          : undefined
      }
      width="2xl"
      showClose={false}
      footer={
        row ? (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Read-only — the guidance desk owns this follow-up.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : null
      }
    >
      {row ? <CaseSheet key={row.key} row={row} /> : null}
    </KanbanOverlay>
  );
}
