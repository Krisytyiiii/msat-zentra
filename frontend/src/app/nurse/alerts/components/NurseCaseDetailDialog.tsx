"use client";
import * as React from "react";
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Flag,
  Lightbulb,
  Lock,
  MapPin,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatActionTime, toDateInputValue } from "@/lib/labels/datetime";
import { OcForm01PreviewDialog } from "@/components/ocform01/OcForm01PreviewDialog";
import { PrivacyNoticeDialog } from "@/components/privacy-notice-dialog";
import { fetchOcForm01Detail } from "@/components/ocform01/ocform01";
import { GcFormBanner as SharedGcFormBanner } from "@/components/desk-alerts/gcform-banner";
import {
  buildGcForm03Data,
  consultRecommendation,
} from "@/services/guidance/gcform03.service";
import type { GcForm03Data } from "@/services/guidance/gcform03.types";
import {
  CaseDetailDrawer,
  CaseDetailFooter,
  DetailField,
  LabeledPill,
  PILL,
  riskTone,
  SectionHeading,
  SessionList,
  SessionNotice,
  statusTextTone,
} from "@/components/desk-alerts/case-detail-drawer";
import {
  ReferralSessionButtons,
  type ReferralSessionDialogKey,
} from "@/components/desk-alerts/session-buttons";
import { cn } from "@/lib/utils";
import type {
  NurseAlertItem,
  NurseRiskLevel,
  NurseSessionItem,
} from "@/services/nurse/nurse.types";
import { deriveActionStatus } from "@/services/nurse/labels";
import {
  CancelSessionDialog,
  DeleteSessionDialog,
  FinishSessionDialog,
  MoveSessionDialog,
  ScheduleSessionDialog,
} from "../../referrals/components/NurseSessionDialogs";
import { SessionDocsDialog } from "../../referrals/components/SessionDocsDialog";
import { NurseAdmReferralFormSheet } from "../../referrals/components/NurseAdmReferralFormSheet";
import type { AdmReviewDraft } from "@/components/adm-review/AdmReviewDialog";
import { isCaseDone, isEndorsed } from "@/lib/labels/referral-status";

/** Nurse action status key → the shared status tone variants. */
function nurseStatusVariant(key: string): string {
  switch (key) {
    case "endorsed":
    case "done":
    case "done_session":
      return "success";
    case "rejected":
    case "cancelled":
    case "escalated":
      return "destructive";
    case "needs_review":
    case "booked":
    case "followup":
      return "amber";
    default:
      return "secondary";
  }
}

/**
 * Nurse case drawer. Renders the exact same shared drawer chrome, referral
 * details grid, session list and session buttons as the guidance alerts drawer
 * — only the data scope (nurse ADM + clinic cases) differs.
 */
export function NurseCaseDetailDialog({
  alert,
  riskLevel,
  onClose,
  onChanged,
}: {
  alert: NurseAlertItem | null;
  riskLevel: NurseRiskLevel | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [sessionDialog, setSessionDialog] = React.useState<{
    session: NurseSessionItem;
    kind: ReferralSessionDialogKey;
  } | null>(null);
  /** A cancelled session is being deleted — keep the session actions disabled. */
  const [deletingSession, setDeletingSession] = React.useState(false);
  const [docsSession, setDocsSession] = React.useState<NurseSessionItem | null>(
    null,
  );
  const [referralDraft, setReferralDraft] = React.useState<AdmReviewDraft | null>(
    null,
  );
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  /** A finished / endorsed case never re-opens its report — the notice says why. */
  const [notice, setNotice] = React.useState<"endorsed" | "finished" | null>(
    null,
  );

  if (!alert) return null;

  const row = alert.row;
  const status = deriveActionStatus(
    row.type,
    row.status,
    row.sessions,
    row.dismissedByRole,
  );
  const isAdm = row.type === "ADM";
  const isClosed = row.status === "resolved" || row.status === "dismissed";
  const withdrawn =
    row.dismissedByRole === "adviser" ||
    row.dismissedByRole === "subject_teacher";
  const bookedSession = row.sessions.find((s) => s.status === "scheduled");
  const canManageSessions = !isAdm || row.status === "pending";
  const manageable = canManageSessions && !isClosed && !withdrawn;
  /** Open case with no booking on the calendar (completed/cancelled sessions
      don't block a new one). An ADM case only books while it still sits on
      this queue (pending), matching the guidance drawer; endorsed / done /
      rejected / cancelled cases never offer another booking. */
  const canBookSession =
    (!isAdm || row.status === "pending") &&
    !isClosed &&
    row.status !== "rejected" &&
    !withdrawn &&
    !bookedSession &&
    !isCaseDone(row) &&
    !isEndorsed(row.type, row.status);
  /* Endorsed / closed cases keep the report banner as a record but never open
     the file again (same rules as the guidance drawer). */
  const reportEndorsed = row.type === "ADM" && row.status === "in_progress";
  const reportClosed = isClosed;

  const note =
    [row.reason, row.recommendations]
      .filter((t) => t && t.trim() !== "")
      .join(" — ") || null;

  const fullCaseHref = isAdm
    ? `/nurse/referrals/adm?highlight=${row.id}`
    : `/nurse/referrals/clinic?highlight=${row.id}`;

  /* GCForm-03 — the endorsed referral form. Same banner the guidance drawer
     shows: seeded from the queue row, refined with the filed OCForm-01. */
  const stampForm = (form: GcForm03Data): GcForm03Data => {
    const day = toDateInputValue(
      row.lastActionAt || row.referredAt || row.date || "",
    );
    if (day) {
      form.receivedDate = day;
      form.counselorDate = day;
    }
    return form;
  };

  const gcFormBanner = reportEndorsed ? (
    <SharedGcFormBanner
      student={row.student}
      raised
      initial={stampForm(
        buildGcForm03Data(row, null, consultRecommendation(row.notes)),
      )}
      load={async () => {
        if (!row.anecdotalId) return null;
        const report = await fetchOcForm01Detail(row.anecdotalId).catch(
          () => null,
        );
        return report
          ? stampForm(
              buildGcForm03Data(
                row,
                report,
                consultRecommendation(row.notes),
              ),
            )
          : null;
      }}
    />
  ) : null;

  /* OCForm-01 — the anecdotal report filed with this case. */
  const anecdotalBanner = row.anecdotalId ? (
    <button
      type="button"
      onClick={() => {
        if (reportEndorsed) {
          setNotice("endorsed");
        } else if (reportClosed) {
          setNotice("finished");
        } else {
          setPreviewId(row.anecdotalId);
        }
      }}
      aria-label={`Open the OCForm-01 anecdotal report for ${row.student}`}
      className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <FileText className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-foreground">
          OCForm-01 — Anecdotal report
        </span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">
          {reportEndorsed
            ? "No longer viewable here — the case was endorsed"
            : reportClosed
              ? "Kept private — this case is closed"
              : "Click to open the report filed with this case"}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  ) : null;

  const body = (
    <div className="space-y-5 px-1 py-1">
      {note ? (
        <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
          <span className="mt-px flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <FileText className="size-[15px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
              Note
            </p>
            <p className="mt-1 text-[13px] leading-5 text-foreground">{note}</p>
          </div>
        </div>
      ) : null}

      {anecdotalBanner || gcFormBanner ? (
        <div
          className={`grid grid-cols-1 gap-3 ${
            anecdotalBanner && gcFormBanner ? "sm:grid-cols-2" : ""
          }`}
        >
          {anecdotalBanner}
          {gcFormBanner}
        </div>
      ) : null}

      <section className="space-y-3">
        <SectionHeading icon={ClipboardList}>Referral details</SectionHeading>
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/50 sm:grid-cols-2">
          <DetailField icon={ClipboardList} label="Category" value={row.category} />
          <DetailField icon={User} label="Referred by" value={row.referredBy} />
          <DetailField
            icon={Calendar}
            label="Date referred"
            value={formatActionTime(row.referredAt || row.date)}
          />
          <DetailField icon={MapPin} label="Location" value={row.location} />
          <DetailField icon={Flag} label="Priority" value={row.priority} />
          <DetailField icon={Lock} label="Confidentiality" value={row.confidentiality} />
          <DetailField
            icon={CheckCircle2}
            label="Status"
            value={status.label}
            valueClassName={statusTextTone(nurseStatusVariant(status.key))}
          />
          <DetailField
            icon={Lightbulb}
            label="Recommendations"
            value={row.recommendations}
            className="sm:col-span-2"
          />
          <DetailField
            icon={CheckCircle2}
            label="Resolution"
            value={row.resolutionSummary}
            className="sm:col-span-2"
          />
        </dl>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={Calendar}>Sessions</SectionHeading>
        <SessionNotice>
          Mark done works even before a booking&apos;s scheduled time — doing so
          closes that booking.
        </SessionNotice>
        <SessionList
          sessions={row.sessions}
          renderActions={(session) => (
            <ReferralSessionButtons
              session={session}
              manageable={manageable}
              actionPending={deletingSession}
              onSession={(dialog) => {
                const original = row.sessions.find((s) => s.id === session.id);
                if (!original) return;
                setSessionDialog({ session: original, kind: dialog });
              }}
              onDocs={() => {
                const original = row.sessions.find((s) => s.id === session.id);
                if (original) setDocsSession(original);
              }}
            />
          )}
          emptyTitle="No clinic sessions booked yet"
          emptyHint="Clinic sessions booked from this case will appear here."
          emptyAction={
            canBookSession ? (
              <Button
                type="button"
                size="xs"
                variant="default"
                className="h-6 shrink-0 gap-1 px-2 text-[12px] font-semibold"
                onClick={() => setScheduleOpen(true)}
              >
                <CalendarPlus size={13} aria-hidden />
                Book session
              </Button>
            ) : undefined
          }
        />
      </section>
    </div>
  );

  const headerPills = (
    <span className="flex flex-wrap items-center gap-1.5">
      <LabeledPill
        label="Case type"
        className={cn(
          PILL,
          isAdm
            ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        )}
      >
        {isAdm ? <ClipboardList className="size-3 shrink-0" aria-hidden /> : null}
        {isAdm ? "ADM" : "Clinic"}
      </LabeledPill>
      <LabeledPill label="Risk level" className={cn(PILL, riskTone(riskLevel))}>
        {riskLevel ? `${riskLevel} risk` : "No risk"}
      </LabeledPill>
    </span>
  );

  // Footer actions mirror the guidance drawer: a pending ADM case opens the
  // referral form (GCForm-03), an open clinic case books its next session.
  const footerActions =
    isAdm && row.status === "pending" ? (
      <Button
        type="button"
        size="sm"
        onClick={() =>
          setReferralDraft({
            recommendation: row.recommendations || row.reason || "",
          })
        }
      >
        Create referral
      </Button>
    ) : canBookSession && row.sessions.length > 0 ? (
      <Button type="button" size="sm" onClick={() => setScheduleOpen(true)}>
        <CalendarPlus size={13} aria-hidden />
        Book session
      </Button>
    ) : undefined;

  return (
    <>
      <CaseDetailDrawer
        student={row.student}
        lrn={row.lrn}
        mascot={row.mascot}
        grade={row.grade}
        section={row.section}
        detectedLabel="Referred"
        detectedText={formatActionTime(row.referredAt || row.date)}
        headerPills={headerPills}
        body={body}
        footer={
          <CaseDetailFooter
            actions={footerActions}
            fullCaseHref={fullCaseHref}
            showOpenFullCase={false}
          />
        }
        onClose={onClose}
      />

      <ScheduleSessionDialog
        row={row}
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onChanged={onChanged}
      />
      {referralDraft ? (
        <NurseAdmReferralFormSheet
          open
          onClose={() => setReferralDraft(null)}
          row={row}
          initialDraft={referralDraft}
          onChanged={onChanged}
        />
      ) : null}
      <OcForm01PreviewDialog
        recordId={previewId}
        onClose={() => setPreviewId(null)}
        raised
      />
      <PrivacyNoticeDialog
        open={notice !== null}
        onClose={() => setNotice(null)}
        studentName={row.student}
        reason={notice === "endorsed" ? "endorsed" : undefined}
      />
      {sessionDialog?.kind === "finish" ? (
        <FinishSessionDialog
          referralId={row.id}
          session={sessionDialog.session}
          open
          onClose={() => setSessionDialog(null)}
          onConfirmed={() => setSessionDialog(null)}
          onChanged={onChanged}
        />
      ) : null}
      {sessionDialog?.kind === "move" ? (
        <MoveSessionDialog
          referralId={row.id}
          session={sessionDialog.session}
          row={row}
          open
          onClose={() => setSessionDialog(null)}
          onConfirmed={() => setSessionDialog(null)}
          onChanged={onChanged}
        />
      ) : null}
      {sessionDialog?.kind === "cancelSess" ? (
        <CancelSessionDialog
          referralId={row.id}
          session={sessionDialog.session}
          student={row.student}
          open
          onClose={() => setSessionDialog(null)}
          onConfirmed={() => setSessionDialog(null)}
          onChanged={onChanged}
        />
      ) : null}
      {sessionDialog?.kind === "deleteSess" ? (
        <DeleteSessionDialog
          referralId={row.id}
          session={sessionDialog.session}
          open
          onClose={() => setSessionDialog(null)}
          onChanged={onChanged}
          onDeletingChange={setDeletingSession}
        />
      ) : null}
      {docsSession ? (
        <SessionDocsDialog
          referralId={row.id}
          session={docsSession}
          open
          onClose={() => setDocsSession(null)}
          onConfirmed={() => setDocsSession(null)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
