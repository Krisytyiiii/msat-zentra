"use client";
import * as React from "react";
import { formatElapsedShort, msSinceDate as msSinceAction } from "@/lib/clock";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Button } from "@/components/ui/button";
import { type PillTone } from "@/components/ui/pill";
import type {
  AtRiskStudentItem,
  CounselingSessionItem,
} from "@/services/guidance/interventions.types";
import { useInterventionEngine } from "./intervention-engine-breakdown";
import { ImageViewer } from "@/components/image-viewer/ImageViewer";
import { interventionLatestAction, pipelineStatus } from "./intervention-row-helpers";
import { useRowViewer } from "./use-row-viewer";
import { GuidanceCaseDetailDialog } from "../../components/GuidanceCaseDetailDialog";
import type { CaseDetailSession } from "../../components/GuidanceCaseDetailDialog";
import { InterventionSessionDocsDialog } from "./InterventionSessionDocsDialog";
import styles from "./guidance-interventions.module.css";
export { interventionLatestAction } from "./intervention-row-helpers";

interface InterventionTableRowProps {
  row: AtRiskStudentItem;
  index?: number;
  highlighted?: boolean;
  locked: boolean;
  isActionPending: boolean;
  isBusy: (action: string) => boolean;
  expanded: boolean;
  onToggleDetails: () => void;
  now: number;
  onChange: () => void;
  onOutcome: () => void;
  onMarkDone: () => void;
  onSchedule: () => void;
  onSession: (
    session: CounselingSessionItem,
    dialog: "finish" | "move" | "cancelSess"
  ) => void;
  onReview: (decision: "approved" | "rejected") => void;
  onDocsChanged: () => void;
}
export function InterventionTableRow({
  row,
  index = 0,
  highlighted = false,
  locked,
  isActionPending,
  isBusy,
  expanded,
  onToggleDetails,
  now,
  onChange,
  onOutcome,
  onSchedule,
  onSession,
  onReview,
  onDocsChanged,
}: InterventionTableRowProps) {
  const followUp = row.intervention;
  const engine = useInterventionEngine(row.studentKey, expanded);
  const displayLevel = engine.data?.live.level ?? row.riskLevel;
  const { viewer, setViewer } = useRowViewer(followUp);
  const closed = !!followUp && followUp.outcomeStatus === "resolved";
  const workable =
    !!followUp &&
    followUp.outcomeStatus !== "resolved" &&
    followUp.approvalStatus !== "rejected";
  const latest = interventionLatestAction(row);
  const doneCount = followUp?.completedSessions ?? 0;
  const scheduledCount =
    followUp?.sessions.filter((s) => s.status === "scheduled").length ?? 0;
  const status = pipelineStatus(row, followUp, scheduledCount, doneCount);
  const isUnbooked =
    !!followUp && !closed && followUp.sessions.length === 0;
  const hasUpcoming = scheduledCount > 0;
  const upcomingHint = "Finish or cancel the upcoming session first";
  // Countdown to the next booked slot so the card says how long until the
  // session is live instead of a flat "upcoming".
  const nextSessionAt =
    followUp?.sessions
      .filter((s) => s.status === "scheduled")
      .map((s) => new Date(s.scheduledAt).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0] ?? null;
  const sessionInMs = nextSessionAt === null ? null : nextSessionAt - now;
  // Fourth card metric: how long until the booked session is live.
  const liveInValue = !hasUpcoming
    ? "—"
    : sessionInMs === null
      ? "—"
      : sessionInMs > 0
        ? sessionInMs < 60_000
          ? "<1m"
          : formatElapsedShort(sessionInMs)
        : "Live";
  const liveInHint = !hasUpcoming
    ? "no booking"
    : sessionInMs === null
      ? "upcoming"
      : sessionInMs > 0
        ? "until session"
        : "now";
  const detectedAt = row.detectedAt ?? followUp?.createdAt ?? null;
  const detectedMs = detectedAt ? msSinceAction(detectedAt, now) : null;
  const detectedElapsed =
    detectedMs === null
      ? "—"
      : detectedMs < 60_000
        ? "just now"
        : `${formatElapsedShort(detectedMs)} ago`;
  const statusTone: PillTone =
    status.variant === "green" || status.variant === "success"
      ? "green"
      : status.variant === "warning"
        ? "amber"
        : status.variant === "destructive"
          ? "red"
          : "neutral";
  const riskTone: PillTone =
    displayLevel === "High"
      ? "red"
      : displayLevel === "Moderate"
        ? "amber"
        : "neutral";
  const riskLevel: "High" | "Moderate" | "Low" | undefined =
    displayLevel === "High" || displayLevel === "Moderate" || displayLevel === "Low"
      ? displayLevel
      : undefined;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleDetails();
    }
  };

  return (
    <>
      <li
        id={`intervention-row-${row.studentKey}`}
        data-highlighted={highlighted || undefined}
        style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
        className={`${styles.caseRow}${highlighted ? ` ${styles.caseRowHighlight}` : ""}${
          expanded ? ` ${styles.caseRowActive}` : ""
        }`}
        onClick={onToggleDetails}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-label={`${row.student}'s intervention case`}
      >
        <div className={styles.caseCardHead}>
          <StudentMascot name={row.student} seed={row.lrn} character={row.mascot ?? undefined} size={36} />
          <div className={styles.caseCardId}>
            <p className={styles.caseCardName}>{row.student}</p>
            <dl className={styles.caseCardHeadFacts}>
              <div className={styles.caseCardFact}>
                <dt>Risk</dt>
                <dd data-tone={riskTone}>{displayLevel}</dd>
              </div>
              <div className={styles.caseCardFact}>
                <dt>Case</dt>
                <dd>Intervention</dd>
              </div>
            </dl>
          </div>
          <span className={styles.caseCardStatus} data-tone={statusTone}>
            {status.label}
          </span>
        </div>

        <div className={styles.caseCardMetrics}>
          <div className={styles.caseCardMetric}>
            <span className={styles.caseCardMetricLabel}>Sessions</span>
            <span className={styles.caseCardMetricValue}>{doneCount}</span>
            <span className={styles.caseCardMetricHint}>completed</span>
          </div>
          <div className={styles.caseCardMetric}>
            <span className={styles.caseCardMetricLabel}>Booked</span>
            <span className={styles.caseCardMetricValue}>{scheduledCount}</span>
            <span className={styles.caseCardMetricHint}>
              {hasUpcoming ? "upcoming" : "none"}
            </span>
          </div>
          <div className={styles.caseCardMetric}>
            <span className={styles.caseCardMetricLabel}>Live in</span>
            <span
              className={`${styles.caseCardMetricValue} ${styles.caseCardMetricValueText} ${
                hasUpcoming ? styles.caseCardMetricValueLive : ""
              }`}
            >
              {liveInValue}
            </span>
            <span className={styles.caseCardMetricHint}>{liveInHint}</span>
          </div>
          <div className={styles.caseCardMetric}>
            <span className={styles.caseCardMetricLabel}>Detected</span>
            <span
              className={`${styles.caseCardMetricValue} ${styles.caseCardMetricValueText}`}
            >
              {detectedElapsed}
            </span>
            <span className={styles.caseCardMetricHint}>{latest.label}</span>
          </div>
        </div>

        <div className={styles.caseCardFoot}>
          <dl className={styles.caseCardInfo}>
            <div className={styles.caseCardFact}>
              <dt>LRN</dt>
              <dd>{row.lrn || "—"}</dd>
            </div>
            <div className={styles.caseCardFact}>
              <dt>Grade level</dt>
              <dd>{row.grade || "—"}</dd>
            </div>
            <div className={styles.caseCardFact}>
              <dt>Section</dt>
              <dd>{row.section || "—"}</dd>
            </div>
          </dl>
        </div>
      </li>
      {expanded ? (
        <GuidanceCaseDetailDialog
          presentation="drawer"
          row={{ kind: "intervention", item: row }}
          riskLevel={riskLevel}
          onClose={onToggleDetails}
          showOpenFullCase={false}
          sessionNotice="Mark done works even before a booking's scheduled time — doing so closes that booking."
          sessionActions={(session) => (
            <CaseSessionActions
              session={session}
              followUpId={followUp?.id ?? null}
              now={now}
              workable={workable}
              closed={closed}
              locked={locked}
              isActionPending={isActionPending}
              isBusy={isBusy}
              onSession={(target, dialog) => {
                onToggleDetails();
                onSession(target, dialog);
              }}
              onDocsChanged={onDocsChanged}
            />
          )}
          actions={
            <>
              {!followUp && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-6 px-2.5 text-xs"
                  disabled={locked || isActionPending}
                  title="Start the follow-up and book the first session"
                  onClick={() => {
                    onToggleDetails();
                    onSchedule();
                  }}
                >
                  {isBusy("schedule") ? "Saving…" : "Book session"}
                </Button>
              )}
              {isUnbooked && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-6 px-2.5 text-xs"
                  disabled={locked || isActionPending}
                  onClick={() => {
                    onToggleDetails();
                    onSchedule();
                  }}
                >
                  Book session
                </Button>
              )}
              {followUp?.approvalStatus === "pending" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2.5 text-xs"
                    disabled={locked || isActionPending}
                    onClick={() => {
                      onToggleDetails();
                      onChange();
                    }}
                  >
                    Change…
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2.5 text-xs"
                    disabled={locked || isActionPending}
                    onClick={() => {
                      onToggleDetails();
                      onReview("rejected");
                    }}
                  >
                    {isBusy("review") ? "Saving…" : "Reject"}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-6 px-2.5 text-xs"
                    disabled={locked || isActionPending}
                    onClick={() => {
                      onToggleDetails();
                      onReview("approved");
                    }}
                  >
                    {isBusy("review") ? "Saving…" : "Approve"}
                  </Button>
                </>
              )}
              {followUp && !closed && status.label !== "No action yet" && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-6 px-2.5 text-xs"
                  disabled={locked || isActionPending || hasUpcoming}
                  title={hasUpcoming ? upcomingHint : undefined}
                  onClick={() => {
                    onToggleDetails();
                    onOutcome();
                  }}
                >
                  Mark done
                </Button>
              )}
              {followUp && closed && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2.5 text-xs"
                  disabled={locked || isActionPending}
                  title="Update the closing notes on this finished follow-up"
                  onClick={() => {
                    onToggleDetails();
                    onOutcome();
                  }}
                >
                  Add note
                </Button>
              )}
            </>
          }
        />
      ) : null}
      {viewer && (
        <ImageViewer
          files={viewer.files}
          index={viewer.index}
          title={row.student}
          subtitle={`${row.lrn || "—"}${row.section ? ` · ${row.section}` : ""}${row.grade ? ` · ${row.grade}` : ""}`}
          onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

/**
 * Per-session actions inside the shared case drawer — reschedule / cancel the
 * booking, plus the session's documentary images (shared `Button`).
 */
function CaseSessionActions({
  session,
  followUpId,
  now,
  workable,
  closed,
  locked,
  isActionPending,
  onSession,
  onDocsChanged,
}: {
  session: CaseDetailSession;
  followUpId: string | null;
  now: number;
  workable: boolean;
  closed: boolean;
  locked: boolean;
  isActionPending: boolean;
  isBusy: (action: string) => boolean;
  onSession: (
    session: CounselingSessionItem,
    dialog: "finish" | "move" | "cancelSess"
  ) => void;
  onDocsChanged: () => void;
}) {
  const [docsOpen, setDocsOpen] = React.useState(false);
  const fullSession = session as CounselingSessionItem;
  const target = new Date(session.scheduledAt).getTime();
  const started = session.status === "completed" || (Number.isFinite(target) && target <= now);
  const actionable = workable && !closed && session.status === "scheduled";
  const docsUnlocked =
    session.status === "completed" ||
    (workable && session.status === "scheduled" && started);
  const docsCount = fullSession.attachmentsCount ?? 0;

  if (!actionable && !docsUnlocked) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actionable && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2.5 text-xs"
            disabled={locked || isActionPending}
            onClick={() => onSession(fullSession, "move")}
          >
            Reschedule
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2.5 text-xs"
            disabled={locked || isActionPending}
            onClick={() => onSession(fullSession, "cancelSess")}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 px-2.5 text-xs"
            disabled={locked || isActionPending}
            title="Record what happened and mark this booking done — works even before the scheduled time"
            onClick={() => onSession(fullSession, "finish")}
          >
            Mark done
          </Button>
        </>
      )}
      {docsUnlocked && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2.5 text-xs"
            disabled={locked || isActionPending}
            onClick={() => setDocsOpen(true)}
          >
            {docsCount > 0 ? "See attached images" : "Add docs"}
          </Button>
          {docsOpen && followUpId ? (
            <InterventionSessionDocsDialog
              followUpId={followUpId}
              session={fullSession}
              open
              onClose={() => setDocsOpen(false)}
              onChanged={onDocsChanged}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
