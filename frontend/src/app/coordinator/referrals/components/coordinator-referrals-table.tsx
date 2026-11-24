"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarClock, CalendarPlus, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { isBookableRow, latestUpdateFor } from "./coordinator-referrals-interpretation";
import styles from "./coordinator-referrals-table.module.css";

const STATUS_TONE: Record<ReturnType<typeof admCaseStatusVariant>, PillTone> = {
  amber: "amber",
  success: "green",
  default: "blue",
  destructive: "red",
  secondary: "violet",
  outline: "neutral",
  red: "red",
};

/**
 * The same ADM case queue rendered as a scannable data table — the important
 * columns only (learner, grade, stage, eligibility, status, meeting, latest
 * update, actions). Clicking a row opens the record overlay; the footer action
 * buttons open the full case page or the tracker.
 */
export function CoordinatorReferralsTable({
  rows,
  now,
  bookPendingId,
  onHistory,
  onBook,
  onOpenDetail,
}: {
  rows: AdmCaseRow[];
  now: number;
  bookPendingId: string | null;
  onHistory: (target: HistoryTarget) => void;
  onBook: (row: AdmCaseRow) => void;
  onOpenDetail: (row: AdmCaseRow) => void;
}) {
  const router = useRouter();

  return (
    <div className={styles.tableWrap}>
      <Table aria-label="ADM referrals">
        <TableHeader>
          <TableRow>
            <TableHead>Learner</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>ADM stage</TableHead>
            <TableHead>Eligibility</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Parent meeting</TableHead>
            <TableHead>Latest update</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, index) => {
            const caseStatus = deriveAdmCaseStatus(
              r.stage,
              r.eligibilityStatus,
              r.approvedBy,
              r.referralStatus,
            );
            const meeting = r.meeting ?? null;
            const bookingThis = bookPendingId === r.id;
            const bookable = isBookableRow(r);
            const closedRow =
              r.referralStatus === "dismissed" || r.referralStatus === "resolved";
            const latest = latestUpdateFor(r);
            const latestMs = latest.at ? msSinceDate(latest.at, now) : null;
            const detailsHref = `/coordinator/referrals/${encodeURIComponent(r.id)}`;

            return (
              <TableRow
                key={r.id}
                className={styles.row}
                style={{ animationDelay: `${40 + Math.min(index, 11) * 30}ms` }}
                tabIndex={0}
                aria-label={`Open record for ${r.student}`}
                onClick={() => onOpenDetail(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenDetail(r);
                  }
                }}
              >
                <TableCell>
                  <div className={styles.learnerCell}>
                    <StudentMascot name={r.student} seed={r.lrn} size={28} />
                    <span className={styles.learnerMeta}>
                      <span className={styles.learnerName} title={r.student}>
                        {r.student}
                      </span>
                      <span className={styles.learnerLrn}>{r.lrn}</span>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Pill tone="blue" label="Grade level">
                    {r.grade}
                  </Pill>
                </TableCell>
                <TableCell className={styles.stageCell}>{stageLabel(r.stage)}</TableCell>
                <TableCell>
                  <Pill
                    tone={r.eligibilityStatus === "eligible" ? "green" : "neutral"}
                    label="Eligibility"
                  >
                    {eligibilityLabel(r.eligibilityStatus)}
                  </Pill>
                </TableCell>
                <TableCell>
                  <Pill
                    tone={STATUS_TONE[admCaseStatusVariant(caseStatus.key)]}
                    label="Case status"
                  >
                    {caseStatus.label}
                  </Pill>
                </TableCell>
                <TableCell>
                  {meeting ? (
                    <span className={styles.meetingCell}>
                      <span className={styles.meetingWhen}>
                        {formatManilaDateLong(meeting.datetime)}
                        {formatManilaTime(meeting.datetime)
                          ? ` · ${formatManilaTime(meeting.datetime)}`
                          : ""}
                      </span>
                      <span className={styles.meetingMeta}>
                        {venueLabel(meeting.venue)}
                        <span
                          className={styles.meetingState}
                          data-attended={meeting.attended || undefined}
                        >
                          {meeting.attended ? "Attended" : "Booked"}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className={styles.muted}>Not booked</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={styles.updateCell}>
                    <span className={styles.updateLabel}>{latest.label}</span>
                    {latest.at ? (
                      <span className={styles.updateAt}>
                        {latestMs === null
                          ? formatManilaDateLong(latest.at)
                          : `${formatElapsedShort(latestMs)} ago`}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className={styles.actionsCell}>
                  <div
                    className={styles.actions}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {meeting === null ? (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={bookingThis || !bookable}
                        title={
                          bookable
                            ? "Book a parent meeting for this case"
                            : closedRow
                              ? "This referral was cancelled/resolved — meetings can no longer be booked"
                              : "Meetings can only be booked before certification"
                        }
                        onClick={() => onBook(r)}
                      >
                        {bookingThis ? (
                          <Loader2 className={styles.spin} aria-hidden="true" />
                        ) : (
                          <CalendarPlus className="size-3.5" aria-hidden="true" />
                        )}
                        {bookingThis ? "Booking…" : "Book"}
                      </Button>
                    ) : !meeting.attended && bookable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={bookingThis}
                        title="Move the booked parent meeting to a new date, time, or venue"
                        onClick={() => onBook(r)}
                      >
                        {bookingThis ? (
                          <Loader2 className={styles.spin} aria-hidden="true" />
                        ) : (
                          <CalendarClock className="size-3.5" aria-hidden="true" />
                        )}
                        {bookingThis ? "Moving…" : "Reschedule"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      aria-label={`Open case details for ${r.student}`}
                      title="Open case"
                      onClick={() => router.push(detailsHref)}
                    >
                      Open
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`${styles.iconBtn} ${styles.trackBtn}`}
                      aria-label={`Track case for ${r.student}`}
                      title="Track case"
                      onClick={() => onHistory(historyTargetFor(r))}
                    >
                      <History className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
