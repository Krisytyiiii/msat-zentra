"use client";
import * as React from "react";
import { ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { InsightCallout } from "@/components/ui/insight-callout";
import type { PillTone } from "@/components/ui/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
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
import { formatElapsedShort, msSinceDate, useNowTick } from "@/lib/clock";
import {
  referralStatusVariant,
  rowKey,
  rowRisk,
  rowSearchText,
  rowType,
  type GuidanceAlertRow,
  type TypeFilter,
} from "./guidance-alerts-helpers";
import {
  RowTypeLabel,
  pipelinePillTone,
  statusPillTone,
} from "./guidance-alerts-row";
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
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import cascade from "@/components/shared/desk-cascade.module.css";
import styles from "./guidance-alerts-table.module.css";
export type { GuidanceAlertRow };

const TYPE_OPTIONS: {
  value: TypeFilter;
  label: string;
  tone: "neutral" | "blue" | "amber";
}[] = [
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

const RISK_TEXT: Record<GuidanceRiskLevel, string> = {
  High: "text-red-600 dark:text-red-400",
  Moderate: "text-amber-600 dark:text-amber-400",
  Low: "text-emerald-600 dark:text-emerald-400",
};

/**
 * Client-side board: the page loads the whole alerts desk once and hands every
 * row here, so typing in the search box filters instantly with no request (same
 * behaviour as the adviser-access desk). Low-risk rows never reach the desk —
 * the backend drops them. Layout is the same data table as the guidance
 * overview grade board: a muted header, clickable hairline rows and a chevron,
 * with the full case detail opening in a right-hand drawer.
 */
export function GuidanceAlertsTable({
  rows,
  riskByStudent,
  summary,
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
  // Hold the open row's key, not the row object: the board refetches live, so a
  // captured object would pin the drawer to the pre-refresh status (an endorsed
  // ADM case kept showing "Needs action" and its Create referral button).
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const activeRow = React.useMemo(
    () => (activeKey ? rows.find((row) => rowKey(row) === activeKey) ?? null : null),
    [activeKey, rows],
  );
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
  const interventionActions = useInterventionActions(() => setActiveKey(null));
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
  const [page, setPage] = React.useState(1);
  const now = useNowTick();
  const hasRows = summary.total > 0;
  const searching = query.trim().length > 0;

  const filteredRows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (type && rowType(row) !== type) return false;
      if (needle && !rowSearchText(row).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, type, query]);

  // Any filter change starts the board back at page 1.
  const changeType = (next: AlertCaseType) => {
    setPage(1);
    onTypeChange(next);
  };
  const changeQuery = (next: string) => {
    setPage(1);
    onQueryChange(next);
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = React.useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage],
  );
  const isEmpty = filteredRows.length === 0;

  return (
    <>
      {/* No parent card: the toolbar, the data table and the pager sit directly
          on the page canvas (the table is the only surface). */}
      <section
        aria-label="Referred cases"
        className={`flex min-w-0 flex-col gap-3 ${styles.boardIn}${
          isEmpty ? ` ${styles.emptyFill}` : ""
        }`}
      >
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className={`${styles.filterRow} ${styles.filterRowScroll}`}>
            <FilterTabs
              label="Filter cases by type"
              variant="tags"
              options={TYPE_OPTIONS}
              value={type}
              onChange={(next) => changeType(next as AlertCaseType)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SearchField
              className="w-60"
              placeholder="Search cases..."
              value={query}
              onChange={changeQuery}
              aria-label="Search referred cases"
            />
          </div>
        </div>

        {pageRows.length > 0 ? (
          <div className={styles.tableWrap}>
            <Table className={`${cascade.table} w-full table-fixed`}>
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:border-t-0">
                  <TableHead style={{ width: 120 }} className="h-10 truncate">
                    Case
                  </TableHead>
                  <TableHead style={{ width: 240 }} className="h-10 truncate">
                    Learner
                  </TableHead>
                  <TableHead style={{ width: 150 }} className="h-10 truncate">
                    Grade &amp; section
                  </TableHead>
                  <TableHead style={{ width: 150 }} className="h-10 truncate">
                    Status
                  </TableHead>
                  <TableHead style={{ width: 100 }} className="h-10 truncate">
                    Risk
                  </TableHead>
                  <TableHead style={{ width: 120 }} className="h-10 truncate">
                    Referred
                  </TableHead>
                  <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row, index) => (
                  <GuidanceAlertTableRow
                    key={rowKey(row)}
                    row={row}
                    index={index}
                    riskLevel={rowRisk(row, riskByStudent)}
                    now={now}
                    onOpen={() => setActiveKey(rowKey(row))}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className={styles.emptyCenter}>
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              {searching ? (
                <>
                  <strong>No cases match your search.</strong> Try a different
                  name, LRN, or keyword — or clear the search to see every
                  referred case.
                </>
              ) : hasRows ? (
                <>
                  <strong>No cases match the selected filters.</strong> Pick a
                  different filter above the board, or show every case.
                </>
              ) : (
                <>
                  <strong>No referred cases.</strong> New ADM, counseling, and
                  intervention cases will appear here.
                </>
              )}
            </InsightCallout>
          </div>
        )}

        <Pagination
          currentPage={safePage}
          totalItems={filteredRows.length}
          onPageChange={setPage}
        />
      </section>
      <GuidanceCaseDetailDialog
        presentation="drawer"
        row={activeRow}
        riskLevel={activeRow ? rowRisk(activeRow, riskByStudent) : undefined}
        onClose={() => setActiveKey(null)}
        sessionNotice={
          activeRow
            ? "Mark done works even before a booking's scheduled time — doing so closes that booking."
            : undefined
        }
        sessionActions={
          activeRow?.kind === "referral"
            ? (session) => {
                const referral = activeRow.referral;
                const original = referral.sessions.find((s) => s.id === session.id);
                if (!original) return null;
                return (
                  <ReferralSessionButtons
                    session={session}
                    manageable={referralSessionsManageable(referral)}
                    actionPending={referralActions.isActionPending}
                    onDocs={() => {
                      setActiveKey(null);
                      setDocsTarget({ referralId: referral.id, session: original });
                    }}
                    onSession={(dialog) => {
                      setActiveKey(null);
                      referralActions.openSessionDialog(referral.id, original, dialog);
                    }}
                  />
                );
              }
            : activeRow?.kind === "intervention"
              ? (session) => {
                  const item = activeRow.item;
                  const followUp = item.intervention;
                  if (!followUp) return null;
                  const original = followUp.sessions.find((s) => s.id === session.id);
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
                        setActiveKey(null);
                        setIvDocs({ followUpId: followUp.id, session: original });
                      }}
                      onSession={(dialog) => {
                        if (dialog === "deleteSess") return;
                        setActiveKey(null);
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
                setActiveKey(null);
              }}
            >
              Create referral
            </Button>
          ) : undefined
        }
        emptyFollowUpAction={
          activeRow?.kind === "intervention" ? (
            <GuidanceBookedSessionButton
              item={activeRow.item}
              onBeforeOpen={() => setActiveKey(null)}
              keepOverlayOnOpen
            />
          ) : undefined
        }
        emptySessionAction={
          activeRow?.kind === "intervention" ? (
            <GuidanceBookedSessionButton
              item={activeRow.item}
              keepOverlayOnOpen
              onBeforeOpen={() => setActiveKey(null)}
            />
          ) : activeRow?.kind === "referral" ? (
            <GuidanceReferralBookSessionButton
              referral={activeRow.referral}
              onBeforeOpen={() => setActiveKey(null)}
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
                        fields.followUpSession.sessionType as CounselingSessionType,
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

/**
 * One case row: the important columns only — case type, learner, grade &
 * section, concern, status, risk and when it reached the desk. Everything
 * else (sessions, referral fields, plan) lives in the drawer.
 */
function GuidanceAlertTableRow({
  row,
  index,
  riskLevel,
  now,
  onOpen,
}: {
  row: GuidanceAlertRow;
  index: number;
  riskLevel: GuidanceRiskLevel | undefined;
  now: number;
  onOpen: () => void;
}) {
  let type: "ADM" | "Counseling" | "Intervention";
  let name: string;
  let lrn: string;
  let mascot: string | null | undefined;
  let grade: string;
  let section: string;
  let status: { label: string; tone: ReturnType<typeof statusPillTone> };
  let elapsedMs: number | null;
  let elapsedLabel: string;

  if (row.kind === "intervention") {
    const item = row.item;
    const iv = item.intervention;
    type = "Intervention";
    name = item.student;
    lrn = item.lrn;
    mascot = item.mascot;
    grade = item.grade;
    section = item.section;
    const doneCount = iv?.completedSessions ?? 0;
    const scheduledCount =
      iv?.sessions.filter((s) => s.status === "scheduled").length ?? 0;
    const pipeline = pipelineStatus(item, iv, scheduledCount, doneCount);
    status = { label: pipeline.label, tone: pipelinePillTone(pipeline.variant) };
    const detectedRaw = item.detectedAt || iv?.createdAt || "";
    elapsedMs = detectedRaw ? msSinceDate(detectedRaw, now) : null;
    elapsedLabel = "Detected";
  } else {
    const r = row.referral;
    type = r.type === "ADM" ? "ADM" : "Counseling";
    name = r.student;
    lrn = r.lrn;
    mascot = r.mascot;
    grade = r.grade;
    section = r.section;
    const doneCount = r.sessions.filter((s) => s.status === "completed").length;
    const bookedCount = r.sessions.filter((s) => s.status === "scheduled").length;
    const allDone = doneCount > 0 && bookedCount === 0;
    status = {
      label: allDone ? "Done" : rowStatusLabel(r.type, r.status, r),
      tone: statusPillTone(allDone ? "success" : referralStatusVariant(r.type, r.status)),
    };
    // The column reports when the case entered the desk (referral filing time),
    // not the anecdote's incident date — that stays on the record.
    const referredRaw = r.referredAt || r.date || "";
    elapsedMs = referredRaw ? msSinceDate(referredRaw, now) : null;
    elapsedLabel = "Referred";
  }

  return (
    <TableRow
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      aria-label={`Open case details for ${name}`}
      className={styles.alertRow}
      style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
    >
      <TableCell className="truncate">
        <RowTypeLabel type={type} />
      </TableCell>
      <TableCell className="truncate">
        <span className="flex min-w-0 items-center gap-2">
          <StudentMascot
            name={name}
            seed={lrn}
            character={mascot ?? undefined}
            size={28}
          />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-primary" title={name}>
              {name}
            </span>
            <span className="mt-0.5 block truncate text-[12px] tabular-nums text-muted-foreground">
              {lrn || "—"}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell className="truncate">
        <span className="block truncate text-[12px] font-medium text-foreground">
          {grade || "—"}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
          {section || "—"}
        </span>
      </TableCell>
      <TableCell className="truncate">
        <span
          className={`text-[12px] font-semibold ${STATUS_TEXT[status.tone]}`}
          title="Status"
        >
          {status.label}
        </span>
      </TableCell>
      <TableCell className="truncate">
        {riskLevel ? (
          <span
            className={`text-[12px] font-semibold ${RISK_TEXT[riskLevel]}`}
            title="Risk level"
          >
            {riskLevel}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="truncate">
        <span
          className={styles.elapsedPill}
          title={
            elapsedMs === null
              ? `${elapsedLabel} time unknown`
              : `${elapsedLabel} ${formatElapsedShort(elapsedMs)} ago`
          }
        >
          <Clock size={11} aria-hidden />
          {elapsedMs === null ? "—" : `${formatElapsedShort(elapsedMs)} ago`}
        </span>
      </TableCell>
      <TableCell className="truncate">
        <ChevronRight size={15} className="text-muted-foreground" aria-hidden />
      </TableCell>
    </TableRow>
  );
}
