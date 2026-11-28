"use client";

import * as React from "react";
import { CalendarPlus, ChevronRight, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { anecdotalCategoryPillClass } from "@/lib/labels/anecdotal";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import type {
  CounselingSessionItem,
  GuidanceReferralItem,
} from "@/services/guidance/guidance.types";
import { GuidanceCaseDetailDialog } from "../../components/GuidanceCaseDetailDialog";
import { GuidanceAdmReferralFormSheet } from "../../adm/components/GuidanceAdmReferralFormSheet";
import {
  ReferralSessionButtons,
  referralSessionsManageable,
} from "../../components/ReferralSessionButtons";
import { SessionDocsDialog } from "./GuidanceSessionDocsDialog";
import {
  hasScheduledSession,
  isCaseDone,
  isEndorsed,
  isWithdrawn,
  rowStatusLabel,
  statusVariant,
} from "./guidance-referrals-format";
import cascade from "@/components/shared/desk-cascade.module.css";
import styles from "./guidance-referrals-table.module.css";

/* Plain text colours for the Status column — the same semantics as the status
   chips, without the chip outline (matches /guidance/alerts). */
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

/** Referral status variant → plain-text colour (same map as the alerts list). */
function statusTone(variant: string): PillTone {
  switch (variant) {
    case "success":
      return "green";
    case "amber":
      return "amber";
    case "destructive":
      return "red";
    case "default":
      return "blue";
    default:
      return "neutral";
  }
}

/**
 * Locked desk (ADM / Counseling) data list — the same table anatomy as
 * /guidance/alerts: a muted column head, clickable hairline rows and a
 * chevron. Clicking a row opens the shared case-detail drawer with the whole
 * case (referral fields, sessions, parent meetings, record banners). Actions
 * that used to live on the folder cards (review, book, report, session
 * changes) are kept in the drawer footer/session rows.
 */
export function GuidanceCasesTable({
  referrals,
  now,
  highlightId,
  actionPending,
  onBookSession,
  onPreview,
  onPrivacy,
  onEndorsedNotice,
  onOpenSession,
  onChanged,
}: {
  referrals: GuidanceReferralItem[];
  now: number;
  highlightId: string | null;
  actionPending: boolean;
  onBookSession: (row: GuidanceReferralItem) => void;
  onPreview: (recordId: string) => void;
  onPrivacy: (studentName: string) => void;
  /** Endorsed case — the record is no longer viewable from the desk. */
  onEndorsedNotice: (studentName: string) => void;
  onOpenSession: (
    referralId: string,
    session: CounselingSessionItem,
    dialog: "finish" | "move" | "cancelSess" | "deleteSess"
  ) => void;
  onChanged: () => void;
}) {
  // Hold the open row's id, not the row object: the desk refetches live, so a
  // captured object would pin the drawer to the pre-refresh status.
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Docs keeps its own target: the drawer closes first so the two overlays
  // never stack, which means it can't read the row from `activeId` any more.
  const [docsTarget, setDocsTarget] = React.useState<{
    referralId: string;
    session: CounselingSessionItem;
  } | null>(null);
  // Pending ADM cases can go straight to the GCForm-03 referral sheet from the
  // drawer footer — the same direct endorsement /guidance/alerts offers.
  const [referralFormFor, setReferralFormFor] =
    React.useState<GuidanceReferralItem | null>(null);

  const activeRow = React.useMemo(
    () => (activeId ? referrals.find((row) => row.id === activeId) ?? null : null),
    [activeId, referrals]
  );

  const closeDrawer = () => setActiveId(null);

  /* A case still takes a booking while it is open, not done and has no live
     session. The alerts drawer offers exactly this, so the locked desks match. */
  const canBookSession = (row: GuidanceReferralItem) =>
    !isWithdrawn(row) &&
    !isEndorsed(row.type, row.status) &&
    row.status !== "resolved" &&
    row.status !== "dismissed" &&
    !isCaseDone(row) &&
    !hasScheduledSession(row.sessions);

  return (
    <>
      <div className={styles.tableWrap}>
        <Table className={`${cascade.table} w-full table-fixed`}>
          <TableHeader>
            <TableRow className="bg-muted/50 [&>th]:border-t-0">
              <TableHead style={{ width: 140 }} className="h-10 truncate">
                Concern
              </TableHead>
              <TableHead style={{ width: 240 }} className="h-10 truncate">
                Learner
              </TableHead>
              <TableHead style={{ width: 150 }} className="h-10 truncate">
                Grade &amp; section
              </TableHead>
              <TableHead style={{ width: 110 }} className="h-10 truncate">
                Sessions
              </TableHead>
              <TableHead style={{ width: 150 }} className="h-10 truncate">
                Status
              </TableHead>
              <TableHead style={{ width: 120 }} className="h-10 truncate">
                Referred
              </TableHead>
              <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.map((row) => {
              const doneCount = row.sessions.filter((s) => s.status === "completed").length;
              const bookedCount = row.sessions.filter((s) => s.status === "scheduled").length;
              const allDone = doneCount > 0 && bookedCount === 0;
              const statusLabel = allDone
                ? "Done"
                : rowStatusLabel(row.type, row.status, row);
              const tone = statusTone(
                allDone ? "success" : statusVariant(row.status, row.type, row)
              );
              const referredRaw = row.referredAt || row.date || "";
              const referredMs = referredRaw ? msSinceDate(referredRaw, now) : null;
              const highlighted = highlightId !== null && highlightId === row.id;
              const category =
                row.category?.trim() && row.category !== "—"
                  ? row.category
                  : row.type === "ADM"
                    ? "ADM case"
                    : "Counseling case";

              return (
                <TableRow
                  key={row.id}
                  id={`guidance-case-${row.id}`}
                  onClick={() => setActiveId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveId(row.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Open case details for ${row.student}`}
                  className={`${styles.admRow}${highlighted ? ` ${styles.admRowHighlight}` : ""}`}
                >
                  <TableCell className="truncate">
                    <span
                      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[12px] font-semibold capitalize ${
                        anecdotalCategoryPillClass(row.category) ??
                        "border-border bg-muted text-muted-foreground"
                      }`}
                      title={`Concern: ${category}`}
                    >
                      {category}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span className="flex min-w-0 items-center gap-2">
                      <StudentMascot
                        name={row.student}
                        seed={row.lrn}
                        character={row.mascot ?? undefined}
                        size={28}
                      />
                      <span className="min-w-0">
                        <span
                          className="block truncate text-[13px] font-semibold text-primary"
                          title={row.student}
                        >
                          {row.student}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] tabular-nums text-muted-foreground">
                          {row.lrn || "—"}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span className="block truncate text-[12px] font-medium text-foreground">
                      {row.grade || "—"}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {row.section || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span className="block text-[12px] font-medium text-foreground">
                      {doneCount} done
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {bookedCount} booked
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span
                      className={`text-[12px] font-semibold ${STATUS_TEXT[tone]}`}
                      title="Status"
                    >
                      {statusLabel}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span
                      className={styles.elapsedPill}
                      title={
                        referredMs === null
                          ? "Referred time unknown"
                          : `Referred ${formatElapsedShort(referredMs)} ago`
                      }
                    >
                      <Clock size={11} aria-hidden />
                      {referredMs === null ? "—" : `${formatElapsedShort(referredMs)} ago`}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <ChevronRight size={15} className="text-muted-foreground" aria-hidden />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <GuidanceCaseDetailDialog
        presentation="drawer"
        row={activeRow ? { kind: "referral", referral: activeRow } : null}
        riskLevel={undefined}
        onClose={closeDrawer}
        showOpenFullCase={false}
        sessionNotice="Mark done works even before a booking's scheduled time — doing so closes that booking."
        recordsBanner={
          activeRow?.anecdotalId ? (
            <button
              type="button"
              onClick={() => {
                const row = activeRow;
                closeDrawer();
                if (isEndorsed(row.type, row.status)) {
                  onEndorsedNotice(row.student);
                } else if (row.status === "resolved" || row.status === "dismissed") {
                  onPrivacy(row.student);
                } else {
                  onPreview(row.anecdotalId);
                }
              }}
              aria-label={`Open the OCForm-01 anecdotal report for ${activeRow.student}`}
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
                  {isEndorsed(activeRow.type, activeRow.status)
                    ? "No longer viewable here — the case was endorsed"
                    : activeRow.status === "resolved" ||
                        activeRow.status === "dismissed"
                      ? "Kept private — this case is closed"
                      : "Click to open the report filed with this case"}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          ) : null
        }
        actions={
          activeRow ? (
            <>
              {activeRow.type === "ADM" && activeRow.status === "pending" ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={actionPending}
                  onClick={() => {
                    const row = activeRow;
                    closeDrawer();
                    setReferralFormFor(row);
                  }}
                >
                  Create referral
                </Button>
              ) : null}
              {activeRow.sessions.length > 0 && canBookSession(activeRow) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={actionPending}
                  onClick={() => {
                    const row = activeRow;
                    closeDrawer();
                    onBookSession(row);
                  }}
                >
                  Book session
                </Button>
              ) : null}
            </>
          ) : null
        }
        emptySessionAction={
          activeRow && activeRow.sessions.length === 0 && canBookSession(activeRow) ? (
            <Button
              type="button"
              size="xs"
              className="h-6 shrink-0 gap-1 px-2 text-[12px] font-semibold"
              disabled={actionPending}
              aria-label={`Book a session for ${activeRow.student}`}
              onClick={() => {
                const row = activeRow;
                closeDrawer();
                onBookSession(row);
              }}
            >
              <CalendarPlus size={13} aria-hidden />
              Book session
            </Button>
          ) : undefined
        }
        sessionActions={
          activeRow
            ? (session) => {
                const original = activeRow.sessions.find((s) => s.id === session.id);
                if (!original) return null;
                return (
                  <ReferralSessionButtons
                    session={session}
                    manageable={referralSessionsManageable(activeRow)}
                    actionPending={actionPending}
                    onDocs={() => {
                      closeDrawer();
                      setDocsTarget({ referralId: activeRow.id, session: original });
                    }}
                    onSession={(dialog) => {
                      closeDrawer();
                      onOpenSession(activeRow.id, original, dialog);
                    }}
                  />
                );
              }
            : undefined
        }
      />

      {docsTarget ? (
        <SessionDocsDialog
          referralId={docsTarget.referralId}
          session={docsTarget.session}
          open
          onClose={() => setDocsTarget(null)}
          onChanged={onChanged}
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
          onChanged={onChanged}
        />
      )}
    </>
  );
}
