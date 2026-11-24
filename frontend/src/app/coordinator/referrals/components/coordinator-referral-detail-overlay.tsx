"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  Eye,
  FileText,
  History,
  Loader2,
  Share2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  admCaseStatusVariant,
  deriveAdmCaseStatus,
  eligibilityLabel,
  formatManilaDateLong,
  formatManilaTime,
  stageLabel,
  venueLabel,
} from "@/services/coordinator/labels";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import type { HistoryTarget } from "../../components/CaseHistoryDialog";
import { historyTargetFor } from "../../components/CaseHistoryDialog";
import {
  isBookableRow,
  latestUpdateFor,
} from "./coordinator-referrals-interpretation";
import styles from "./coordinator-referral-detail-overlay.module.css";

const STATUS_TONE: Record<ReturnType<typeof admCaseStatusVariant>, PillTone> = {
  amber: "amber",
  success: "green",
  default: "blue",
  destructive: "red",
  secondary: "violet",
  outline: "neutral",
  red: "red",
};

/** Maps the case-status variant onto the header accent rail. */
const ACCENT: Record<ReturnType<typeof admCaseStatusVariant>, string> = {
  amber: "amber",
  success: "green",
  default: "blue",
  destructive: "red",
  secondary: "violet",
  outline: "neutral",
  red: "red",
};

interface CoordinatorReferralDetailOverlayProps {
  row: AdmCaseRow | null;
  now: number;
  bookPendingId: string | null;
  onClose: () => void;
  onHistory: (target: HistoryTarget) => void;
  onBook: (row: AdmCaseRow) => void;
}

/**
 * Full-record overlay for one ADM referral. Opens from a table row and lays
 * the whole case out as an information card — learner identity, case status,
 * stage/eligibility, prepared/endorsed/approval facts, the parent meeting, the
 * latest action and the case forms — with the row's own actions in the footer.
 */
export function CoordinatorReferralDetailOverlay({
  row,
  now,
  bookPendingId,
  onClose,
  onHistory,
  onBook,
}: CoordinatorReferralDetailOverlayProps) {
  const router = useRouter();

  React.useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;

  const caseStatus = deriveAdmCaseStatus(
    row.stage,
    row.eligibilityStatus,
    row.approvedBy,
    row.referralStatus,
  );
  const variant = admCaseStatusVariant(caseStatus.key);
  const meeting = row.meeting ?? null;
  const bookingThis = bookPendingId === row.id;
  const bookable = isBookableRow(row);
  const latest = latestUpdateFor(row);
  const latestMs = latest.at ? msSinceDate(latest.at, now) : null;
  const detailsHref = `/coordinator/referrals/${encodeURIComponent(row.id)}`;
  const openDetails = () => router.push(detailsHref);

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={`Referral record for ${row.student}`}
      >
        {/* Header band — status-tinted accent rail. */}
        <div className={styles.head} data-accent={ACCENT[variant]}>
          <span className={styles.headGlyph} aria-hidden="true">
            <Share2 />
          </span>
          <div className={styles.headText}>
            <p className={styles.eyebrow}>ADM referral</p>
            <p className={styles.headTitle}>{caseStatus.label}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 px-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </Button>
        </div>

        <div className={styles.body}>
          {/* Learner identity + live status. */}
          <div className={styles.identity}>
            <StudentMascot
              name={row.student}
              seed={row.lrn}
              character={row.mascot ?? undefined}
              size={44}
            />
            <div className={styles.identityText}>
              <p className={styles.identityName} title={row.student}>
                {row.student}
              </p>
              <p className={styles.identityLrn}>
                {row.lrn || "No LRN on file"}
              </p>
            </div>
            <Pill
              tone={STATUS_TONE[variant]}
              label="Case status"
              className="shrink-0"
            >
              {caseStatus.label}
            </Pill>
          </div>

          {/* Meta chips: grade, ADM stage, eligibility. */}
          <div className={styles.chips}>
            <Pill tone="blue" label="Grade level">
              {row.grade || "—"}
            </Pill>
            <Pill tone="neutral" label="ADM stage">
              {stageLabel(row.stage)}
            </Pill>
            <Pill
              tone={
                row.eligibilityStatus === "eligible"
                  ? "green"
                  : row.eligibilityStatus === "ineligible"
                    ? "red"
                    : "neutral"
              }
              label="Eligibility"
            >
              {eligibilityLabel(row.eligibilityStatus)}
            </Pill>
          </div>

          {/* Fact grid. */}
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>
                <UserRound size={12} aria-hidden /> Prepared by
              </dt>
              <dd>
                {row.preparedBy || "—"}
                {row.datePrepared ? (
                  <span className={styles.factSub}>
                    {formatManilaDateLong(row.datePrepared)}
                  </span>
                ) : null}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <Eye size={12} aria-hidden /> Consult reviewer
              </dt>
              <dd>{row.consultReviewer || "Not assigned"}</dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <Share2 size={12} aria-hidden /> Endorsed
              </dt>
              <dd>
                {row.endorsedAt
                  ? formatManilaDateLong(row.endorsedAt)
                  : "Not yet endorsed"}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <ClipboardList size={12} aria-hidden /> Principal approval
              </dt>
              <dd>
                {row.approvedBy || "Pending"}
                {row.approvalDate ? (
                  <span className={styles.factSub}>
                    {formatManilaDateLong(row.approvalDate)}
                  </span>
                ) : null}
              </dd>
            </div>
            {row.section ? (
              <div className={styles.fact}>
                <dt>Section</dt>
                <dd>{row.section}</dd>
              </div>
            ) : null}
            {typeof row.modulesTotal === "number" ? (
              <div className={styles.fact}>
                <dt>Modules</dt>
                <dd className="tabular-nums">
                  {row.modulesSubmitted ?? 0} / {row.modulesTotal} submitted
                </dd>
              </div>
            ) : null}
          </dl>

          {/* Parent meeting. */}
          <div className={styles.note}>
            <span className={styles.noteIcon} aria-hidden="true">
              {meeting ? <CalendarClock size={13} /> : <CalendarPlus size={13} />}
            </span>
            <div className={styles.noteBody}>
              <p className={styles.noteTitle}>Parent meeting</p>
              {meeting ? (
                <>
                  <p className={styles.noteText}>
                    {formatManilaDateLong(meeting.datetime)}
                    {formatManilaTime(meeting.datetime)
                      ? ` · ${formatManilaTime(meeting.datetime)}`
                      : ""}
                    {" · "}
                    {venueLabel(meeting.venue)}
                  </p>
                  <span className={styles.noteMeta}>
                    <Pill
                      tone={meeting.attended ? "green" : "blue"}
                      label={
                        meeting.attended
                          ? "Meeting attended"
                          : "Booked meeting"
                      }
                    >
                      {meeting.attended ? "Attended" : "Booked"}
                    </Pill>
                    <span className={styles.noteMuted}>
                      {typeof meeting.inviteeIds?.length === "number"
                        ? `${meeting.inviteeIds.length} invitee${
                            meeting.inviteeIds.length === 1 ? "" : "s"
                          }`
                        : ""}
                    </span>
                  </span>
                </>
              ) : (
                <p className={styles.noteText}>
                  No parent meeting booked for this case yet.
                </p>
              )}
            </div>
          </div>

          {/* Latest update. */}
          <div className={styles.latest}>
            <span className={styles.latestLabel}>Latest update</span>
            <span className={styles.latestMain}>{latest.label}</span>
            {latest.at ? (
              <span className={styles.latestAt}>
                {latestMs === null
                  ? formatManilaDateLong(latest.at)
                  : `${formatElapsedShort(latestMs)} ago`}
              </span>
            ) : null}
          </div>

          {/* Case forms. */}
          {row.forms?.length ? (
            <div className={styles.forms}>
              <p className={styles.formsTitle}>Case forms</p>
              <ul className={styles.formList}>
                {row.forms.map((form) => (
                  <li key={form.id} className={styles.formRow}>
                    <span className={styles.formIcon} aria-hidden="true">
                      <FileText size={12} />
                    </span>
                    <span className={styles.formTitle} title={form.title}>
                      {form.title}
                    </span>
                    <Pill tone="neutral" label="Form status">
                      {form.status}
                    </Pill>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Footer actions — the same verbs as the table row. */}
        <div className={styles.actions}>
          <Button
            variant="outline"
            className="gap-1.5 bg-card text-xs"
            onClick={() => onHistory(historyTargetFor(row))}
          >
            <History size={14} aria-hidden />
            Track case
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 bg-card text-xs"
            disabled={bookingThis || !bookable}
            title={
              bookable
                ? meeting
                  ? "Move the booked parent meeting"
                  : "Book a parent meeting for this case"
                : "Meetings can only be booked before certification"
            }
            onClick={() => onBook(row)}
          >
            {bookingThis ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : meeting ? (
              <CalendarClock size={14} aria-hidden />
            ) : (
              <CalendarPlus size={14} aria-hidden />
            )}
            {bookingThis
              ? "Saving…"
              : meeting
                ? "Reschedule"
                : "Book meeting"}
          </Button>
          <Button className="gap-1.5 text-xs" onClick={openDetails}>
            <ArrowUpRight size={14} aria-hidden />
            Open case
          </Button>
        </div>
      </div>
    </div>
  );
}
