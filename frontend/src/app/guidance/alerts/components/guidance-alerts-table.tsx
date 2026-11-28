"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { PillTone } from "@/components/ui/pill";
import type {
  CounselingSessionItem as GuidanceSessionItem,
  GuidanceRiskLevel,
} from "@/services/guidance/guidance.types";
import type {
  CounselingSessionItem as InterventionSessionItem,
  CounselingSessionType,
} from "@/services/guidance/interventions.types";
import type { GuidanceReferralItem } from "@/services/guidance/guidance.types";
import type {
  AlertCaseType,
  GuidanceAlertCasesSummary,
} from "@/services/guidance/alerts.types";
import { msSinceDate, useNowTick } from "@/lib/clock";
import {
  AlertsCasesTable,
  type AlertsTableRow,
  type AlertsTypeOption,
} from "@/components/desk-alerts/alerts-table";
import {
  referralStatusVariant,
  rowKey,
  rowRisk,
  rowSearchText,
  type GuidanceAlertRow,
  type TypeFilter,
} from "./guidance-alerts-helpers";
import { pipelinePillTone, statusPillTone } from "./guidance-alerts-row";
import {
  GuidanceBookedSessionButton,
  GuidanceReferralBookSessionButton,
} from "./GuidanceAlertsRowActions";
import { GuidanceCaseDetailDialog } from "../../components/GuidanceCaseDetailDialog";
import {
  ReferralSessionButtons,
  referralSessionsManageable,
} from "../../components/ReferralSessionButtons";
import { SessionDocsDialog } from "../../referrals/components/GuidanceSessionDocsDialog";
import { GuidanceSessionDialogs } from "../../referrals/components/GuidanceSessionDialogs";
import { useGuidanceReferralActions } from "../../referrals/components/use-guidance-referral-actions";
import { useInterventionActions } from "../../interventions/components/use-intervention-actions";
import { InterventionFinishDialog } from "../../interventions/components/intervention-finish-dialog";
import { InterventionMoveDialog } from "../../interventions/components/intervention-move-dialog";
import { InterventionCancelDialog } from "../../interventions/components/intervention-cancel-dialog";
import { InterventionSessionDocsDialog } from "../../interventions/components/InterventionSessionDocsDialog";
import { GuidanceAdmReferralFormSheet } from "../../adm/components/GuidanceAdmReferralFormSheet";
import { useGuidanceInvalidate } from "../../overview/components/use-guidance-mutation";
import { rowStatusLabel } from "../../referrals/components/guidance-referrals-format";
import { pipelineStatus } from "../../interventions/components/intervention-row-helpers";
export type { GuidanceAlertRow };

const TYPE_OPTIONS: AlertsTypeOption[] = [
  { value: "", label: "All", tone: "neutral" },
  { value: "ADM", label: "ADM", tone: "blue" },
  { value: "Counseling", label: "Counseling", tone: "blue" },
  { value: "Intervention", label: "Intervention", tone: "amber" },
];

/* Plain text colours for the Status column — same semantics as the status
   pills, without the chip outline. */
const STATUS_TEXT: Record<PillTone, string> = {
  neutral: "text-foreground",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  green: "text-emerald-600 dark:text-emerald-400",
  blue: "text-blue-600 dark:text-blue-400",
  violet: "text-violet-600 dark:text-violet-400",
  teal: "text-teal-600 dark:text-teal-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  rose: "text-rose-600 dark:text-rose-400",
  sky: "text-sky-600 dark:text-sky-400",
};

/**
 * Client-side board: the page loads the whole alerts desk once and hands every
 * row here, so typing in the search box filters instantly with no request (same
 * behaviour as the adviser-access desk). Low-risk rows never reach the desk —
 * the backend drops them.
 */
export function GuidanceAlertsTable({
  rows,
  riskByStudent,
  query,
  type,
  onQueryChange,
  onTypeChange,
}: {
  rows: GuidanceAlertRow[];
  riskByStudent: Record<string, GuidanceRiskLevel>;
  summary: GuidanceAlertCasesSummary;
  query: string;
  type: AlertCaseType;
  onQueryChange: (next: string) => void;
  onTypeChange: (next: AlertCaseType) => void;
}) {
  // Pending ADM cases can go straight to the GCForm-03 referral sheet from the
  // drawer footer — the same endorsement the ADM queue performs after review.
  const [referralFormFor, setReferralFormFor] =
    React.useState<GuidanceReferralItem | null>(null);
  const invalidateGuidance = useGuidanceInvalidate("alerts");
  // Session actions on the drawer (mark done / reschedule / cancel / docs) run
  // through the referrals desk's own action manager so both boards behave the
  // same. The manager only needs the referral rows on screen.
  const referralRows = React.useMemo(
    () => rows.flatMap((row) => (row.kind === "referral" ? [row.referral] : [])),
    [rows],
  );
  const referralActions = useGuidanceReferralActions(referralRows);
  const [docsTarget, setDocsTarget] = React.useState<{
    referralId: string;
    session: GuidanceSessionItem;
  } | null>(null);
  // Intervention sessions on the same drawer use the interventions desk's
  // action engine, so a booked session can be marked done here too.
  const interventionActions = useInterventionActions(() => {});
  const [ivDialog, setIvDialog] = React.useState<{
    key: string;
    followUpId: string;
    session: InterventionSessionItem;
    dialog: "finish" | "move" | "cancelSess";
    studentCard: {
      name: string;
      lrn?: string;
      section?: string;
      grade?: string;
      sub?: string;
    };
  } | null>(null);
  const [ivDocs, setIvDocs] = React.useState<{
    followUpId: string;
    session: InterventionSessionItem;
  } | null>(null);
  const now = useNowTick();

  const tableRows = React.useMemo<AlertsTableRow[]>(
    () =>
      rows.map((row) => {
        const riskLevel = rowRisk(row, riskByStudent);
        if (row.kind === "intervention") {
          const item = row.item;
          const iv = item.intervention;
          const doneCount = iv?.completedSessions ?? 0;
          const scheduledCount =
            iv?.sessions.filter((s) => s.status === "scheduled").length ?? 0;
          const pipeline = pipelineStatus(item, iv, scheduledCount, doneCount);
          const detectedRaw = item.detectedAt || iv?.createdAt || "";
          return {
            key: rowKey(row),
            typeLabel: "Intervention",
            typeTone: "amber",
            student: item.student,
            lrn: item.lrn,
            mascot: item.mascot,
            grade: item.grade,
            section: item.section,
            statusLabel: pipeline.label,
            statusTone: STATUS_TEXT[pipelinePillTone(pipeline.variant)],
            riskLevel,
            elapsedMs: detectedRaw ? msSinceDate(detectedRaw, now) : null,
            elapsedLabel: "Detected",
            searchText: rowSearchText(row).toLowerCase(),
          };
        }
        const r = row.referral;
        const doneCount = r.sessions.filter((s) => s.status === "completed").length;
        const bookedCount = r.sessions.filter((s) => s.status === "scheduled").length;
        const allDone = doneCount > 0 && bookedCount === 0;
        const referredRaw = r.referredAt || r.date || "";
        return {
          key: rowKey(row),
          typeLabel: r.type === "ADM" ? "ADM" : "Counseling",
          typeTone: "blue",
          student: r.student,
          lrn: r.lrn,
          mascot: r.mascot,
          grade: r.grade,
          section: r.section,
          statusLabel: allDone ? "Done" : rowStatusLabel(r.type, r.status, r),
          statusTone:
            STATUS_TEXT[
              statusPillTone(
                allDone ? "success" : referralStatusVariant(r.type, r.status),
              )
            ],
          riskLevel,
          elapsedMs: referredRaw ? msSinceDate(referredRaw, now) : null,
          elapsedLabel: "Referred",
          searchText: rowSearchText(row).toLowerCase(),
        };
      }),
    [rows, riskByStudent, now],
  );

  return (
    <>
      <AlertsCasesTable
        rows={tableRows}
        type={type as TypeFilter}
        typeOptions={TYPE_OPTIONS}
        query={query}
        onQueryChange={onQueryChange}
        onTypeChange={(next) => onTypeChange(next as AlertCaseType)}
        emptyAll={
          <>
            <strong>No referred cases.</strong> New ADM, counseling, and
            intervention cases will appear here.
          </>
        }
        renderDrawer={(activeKey, close) => {
          const activeRow = activeKey
            ? rows.find((row) => rowKey(row) === activeKey) ?? null
            : null;
          return (
            <>
              <GuidanceCaseDetailDialog
                presentation="drawer"
                row={activeRow}
                showGcFormBanner={false}
                riskLevel={
                  activeRow ? rowRisk(activeRow, riskByStudent) : undefined
                }
                onClose={close}
                sessionNotice={
                  activeRow
                    ? "Mark done works even before a booking's scheduled time — doing so closes that booking."
                    : undefined
                }
                sessionActions={
                  activeRow?.kind === "referral"
                    ? (session) => {
                        const referral = activeRow.referral;
                        const original = referral.sessions.find(
                          (s) => s.id === session.id,
                        );
                        if (!original) return null;
                        return (
                          <ReferralSessionButtons
                            session={session}
                            manageable={referralSessionsManageable(referral)}
                            actionPending={referralActions.isActionPending}
                            onDocs={() => {
                              close();
                              setDocsTarget({
                                referralId: referral.id,
                                session: original,
                              });
                            }}
                            onSession={(dialog) => {
                              close();
                              referralActions.openSessionDialog(
                                referral.id,
                                original,
                                dialog,
                              );
                            }}
                          />
                        );
                      }
                    : activeRow?.kind === "intervention"
                      ? (session) => {
                          const item = activeRow.item;
                          const followUp = item.intervention;
                          if (!followUp) return null;
                          const original = followUp.sessions.find(
                            (s) => s.id === session.id,
                          );
                          if (!original) return null;
                          const manageable =
                            followUp.outcomeStatus !== "resolved" &&
                            followUp.approvalStatus !== "rejected";
                          return (
                            <ReferralSessionButtons
                              session={session}
                              manageable={manageable}
                              actionPending={interventionActions.isActionPending}
                              onDocs={() => {
                                close();
                                setIvDocs({
                                  followUpId: followUp.id,
                                  session: original,
                                });
                              }}
                              onSession={(dialog) => {
                                if (dialog === "deleteSess") return;
                                close();
                                setIvDialog({
                                  key: item.studentKey,
                                  followUpId: followUp.id,
                                  session: original,
                                  dialog,
                                  studentCard: {
                                    name: item.student,
                                    lrn: item.lrn,
                                    section: item.section,
                                    grade: item.grade,
                                    sub: [item.grade, item.section]
                                      .filter(Boolean)
                                      .join(" · "),
                                  },
                                });
                              }}
                            />
                          );
                        }
                      : undefined
                }
                actions={
                  activeRow?.kind === "referral" &&
                  activeRow.referral.type === "ADM" &&
                  activeRow.referral.status === "pending" ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setReferralFormFor(activeRow.referral);
                        close();
                      }}
                    >
                      Create referral
                    </Button>
                  ) : undefined
                }
                emptyFollowUpAction={
                  activeRow?.kind === "intervention" &&
                  activeRow.item.intervention?.outcomeStatus !== "resolved" &&
                  activeRow.item.intervention?.approvalStatus !== "rejected" ? (
                    <GuidanceBookedSessionButton
                      item={activeRow.item}
                      onBeforeOpen={close}
                      keepOverlayOnOpen
                    />
                  ) : undefined
                }
                emptySessionAction={
                  activeRow?.kind === "intervention" &&
                  activeRow.item.intervention?.outcomeStatus !== "resolved" &&
                  activeRow.item.intervention?.approvalStatus !== "rejected" ? (
                    <GuidanceBookedSessionButton
                      item={activeRow.item}
                      keepOverlayOnOpen
                      onBeforeOpen={close}
                    />
                  ) : activeRow?.kind === "referral" &&
                    referralSessionsManageable(activeRow.referral) ? (
                    <GuidanceReferralBookSessionButton
                      referral={activeRow.referral}
                      onBeforeOpen={close}
                    />
                  ) : undefined
                }
              />
              <GuidanceSessionDialogs
                dialogs={referralActions.dialogs}
                activeRow={referralActions.activeRow}
                activeSession={referralActions.activeSession}
                isActionPending={referralActions.isActionPending}
                closeDialog={referralActions.closeDialog}
                handleAction={referralActions.handleAction}
              />
              {docsTarget ? (
                <SessionDocsDialog
                  referralId={docsTarget.referralId}
                  session={docsTarget.session}
                  open
                  onClose={() => setDocsTarget(null)}
                  onChanged={() => invalidateGuidance()}
                />
              ) : null}
              {ivDialog?.dialog === "finish" ? (
                <InterventionFinishDialog
                  open
                  onClose={() => setIvDialog(null)}
                  activeSession={ivDialog.session}
                  now={now}
                  isActionPending={interventionActions.isActionPending}
                  onSubmit={(fields) => {
                    const target = ivDialog;
                    setIvDialog(null);
                    interventionActions.runAction(target.key, "finish", {
                      followUpId: target.followUpId,
                      sessionId: target.session.id,
                      sessionNotes: fields.sessionNotes,
                      ...(fields.outcome ? { outcome: fields.outcome } : {}),
                      ...(fields.followUpSession
                        ? {
                            followUpSession: {
                              scheduledAt: fields.followUpSession.scheduledAt,
                              sessionType:
                                fields.followUpSession
                                  .sessionType as CounselingSessionType,
                              ...(fields.followUpSession.venue
                                ? { venue: fields.followUpSession.venue }
                                : {}),
                            },
                          }
                        : {}),
                    });
                  }}
                />
              ) : null}
              {ivDialog?.dialog === "move" ? (
                <InterventionMoveDialog
                  open
                  onClose={() => setIvDialog(null)}
                  studentCard={ivDialog.studentCard}
                  activeSession={ivDialog.session}
                  isActionPending={interventionActions.isActionPending}
                  onSubmit={(fields) => {
                    const target = ivDialog;
                    setIvDialog(null);
                    interventionActions.runAction(target.key, "move", {
                      followUpId: target.followUpId,
                      sessionId: target.session.id,
                      scheduledAt: fields.scheduledAt,
                      sessionType: fields.sessionType as CounselingSessionType,
                    });
                  }}
                />
              ) : null}
              {ivDialog?.dialog === "cancelSess" ? (
                <InterventionCancelDialog
                  open
                  onClose={() => setIvDialog(null)}
                  activeSession={ivDialog.session}
                  isActionPending={interventionActions.isActionPending}
                  onSubmit={(reason) => {
                    const target = ivDialog;
                    setIvDialog(null);
                    interventionActions.runAction(target.key, "cancelSess", {
                      followUpId: target.followUpId,
                      sessionId: target.session.id,
                      ...(reason ? { cancelReason: reason } : {}),
                    });
                  }}
                />
              ) : null}
              {ivDocs ? (
                <InterventionSessionDocsDialog
                  followUpId={ivDocs.followUpId}
                  session={ivDocs.session}
                  open
                  onClose={() => setIvDocs(null)}
                  onChanged={() => interventionActions.invalidateGuidance()}
                />
              ) : null}
            </>
          );
        }}
      />
      {referralFormFor && (
        <GuidanceAdmReferralFormSheet
          open
          onClose={() => setReferralFormFor(null)}
          adapter={{
            id: referralFormFor.id,
            student: referralFormFor.student,
            lrn: referralFormFor.lrn,
            section: referralFormFor.section,
            grade: referralFormFor.grade,
            stage: "consultation",
            stageLabel: "Consultation and referral",
            eligibility: "pending",
            referralId: referralFormFor.id,
            referralStatus: referralFormFor.status,
            reason: referralFormFor.reason,
            referredBy: referralFormFor.referredBy,
            preparedBy: referralFormFor.referredBy,
            date: referralFormFor.date,
            meetingAttended: null,
            hasHomeVisit: false,
            approved: false,
            approvedAt: null,
            anecdotalId: referralFormFor.anecdotalId || undefined,
            category: referralFormFor.category,
            anecdotalExcerpt: referralFormFor.anecdotalExcerpt,
            recommendations: referralFormFor.recommendations,
          }}
          anecdotalId={referralFormFor.anecdotalId || null}
          lrn={referralFormFor.lrn}
          initialDraft={{ recommendation: referralFormFor.recommendations || "" }}
          onChanged={invalidateGuidance}
        />
      )}
    </>
  );
}
