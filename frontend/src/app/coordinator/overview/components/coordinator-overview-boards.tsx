"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  TabletSmartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import {
  formatManilaDateLong,
  formatManilaTime,
} from "@/services/coordinator/labels";
import {
  BookedMeetingInfoContent,
  type BookedMeetingInfo,
} from "@/components/session-booking/BookedMeetingInfoPanel";
import type {
  AdmCaseRow,
  AdmDeviceRow,
} from "@/services/coordinator/coordinator.types";
import styles from "./coordinator-overview-boards.module.css";

interface CoordinatorOverviewBoardsProps {
  devicesIssued: number | null;
  devicesReturned: number | null;
  devicesPending: boolean;
  oldestOut: AdmDeviceRow[];
  bookedMeetings: AdmCaseRow[];
  bookedPending: boolean;
  now: number;
}

function rowMeetingInfo(r: AdmCaseRow): BookedMeetingInfo | null {
  const m = r.meeting;
  if (!m) return null;
  return {
    studentName: r.student,
    lrn: r.lrn,
    grade: r.grade,
    datetime: m.datetime,
    venue: m.venue,
    attended: m.attended,
    inviteeCount: m.inviteeIds?.length ?? 0,
  };
}

/**
 * Right rail of the command center — two quiet panels instead of a
 * three-board grid: the devices still out with a duration meter, and the
 * parent meetings already on the calendar (click a row for full details).
 */
export function CoordinatorOverviewBoards({
  devicesIssued,
  devicesReturned,
  devicesPending,
  oldestOut,
  bookedMeetings,
  bookedPending,
  now,
}: CoordinatorOverviewBoardsProps) {
  const [infoRow, setInfoRow] = React.useState<AdmCaseRow | null>(null);

  const meetingInfo = React.useMemo<BookedMeetingInfo | null>(
    () => (infoRow ? rowMeetingInfo(infoRow) : null),
    [infoRow],
  );

  const oldestDevice = oldestOut[0];
  const oldestOutMs = oldestDevice
    ? msSinceDate(oldestDevice.issuedDate, now)
    : null;
  const maxOutMs = Math.max(
    1,
    ...oldestOut.map((d) => msSinceDate(d.issuedDate, now) ?? 0),
  );

  const firstMeeting = bookedMeetings.find((r) => r.meeting)?.meeting;

  return (
    <div className={styles.rail}>
      <section className={styles.panel} aria-label="Learning devices out">
        <header className={styles.panelHead}>
          <span className={styles.panelIcon} aria-hidden="true">
            <TabletSmartphone size={15} />
          </span>
          <div className={styles.panelHeading}>
            <h2 className={styles.panelTitle}>Devices out</h2>
            <p className={styles.panelSub}>
              {devicesPending || devicesIssued === null
                ? "Checking device counts"
                : `${devicesIssued} out · ${devicesReturned ?? 0} returned`}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
          >
            <Link href="/coordinator/devices">
              Open
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </header>

        {devicesPending ? (
          <ul className={styles.rows} aria-busy="true" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className={styles.skelRow} />
            ))}
          </ul>
        ) : oldestOut.length === 0 ? (
          <p className={styles.empty}>
            <CheckCircle2 size={15} aria-hidden="true" />
            No tablets are out with a learner right now.
          </p>
        ) : (
          <ul className={styles.rows}>
            {oldestOut.map((d) => {
              const out = msSinceDate(d.issuedDate, now);
              const pct = out === null ? 0 : Math.min(100, (out / maxOutMs) * 100);
              return (
                <li key={d.id} className={styles.deviceRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowName} title={d.student}>
                      {d.student}
                    </span>
                    <span className={styles.rowMeta}>
                      {out === null ? "—" : `${formatElapsedShort(out)} ago`}
                    </span>
                  </div>
                  <div className={styles.meter} aria-hidden="true">
                    <span
                      className={styles.meterFill}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.note}>
          {devicesPending
            ? "Device counts are still loading."
            : devicesIssued === null
              ? "Device counts are unavailable right now."
              : devicesIssued === 0
                ? "Every issued tablet has been returned."
                : `${devicesIssued} tablet${devicesIssued === 1 ? "" : "s"} still out${
                    oldestOutMs !== null
                      ? ` — the oldest for ${formatElapsedShort(oldestOutMs)}`
                      : ""
                  }. Longest waits sit at the top.`}
        </p>
      </section>

      <section className={styles.panel} aria-label="Booked parent meetings">
        <header className={styles.panelHead}>
          <span className={styles.panelIcon} aria-hidden="true">
            <CalendarClock size={15} />
          </span>
          <div className={styles.panelHeading}>
            <h2 className={styles.panelTitle}>
              {infoRow && meetingInfo
                ? infoRow.meeting?.attended
                  ? "Attended meeting"
                  : "Booked meeting"
                : "Parent meetings"}
            </h2>
            <p className={styles.panelSub}>
              {infoRow && meetingInfo
                ? "Schedule, venue and invitees"
                : bookedPending
                  ? "Loading the calendar"
                  : `${bookedMeetings.length} on the calendar`}
            </p>
          </div>
          {infoRow && meetingInfo ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => setInfoRow(null)}
            >
              Back to list
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
            >
              <Link href="/coordinator/referrals">
                Open
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </header>

        {infoRow && meetingInfo ? (
          <BookedMeetingInfoContent info={meetingInfo} />
        ) : bookedPending ? (
          <ul className={styles.rows} aria-busy="true" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className={styles.skelRow} />
            ))}
          </ul>
        ) : bookedMeetings.length === 0 ? (
          <p className={styles.empty}>
            <CalendarClock size={15} aria-hidden="true" />
            No parent meetings are on the calendar yet.
          </p>
        ) : (
          <ul className={styles.rows}>
            {bookedMeetings.map((r) => {
              const m = r.meeting;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={styles.meetRow}
                    onClick={() => setInfoRow(r)}
                  >
                    <span className={styles.rowTop}>
                      <span className={styles.rowName} title={r.student}>
                        {r.student}
                      </span>
                      {m?.attended ? (
                        <span className={styles.attended}>Attended</span>
                      ) : null}
                    </span>
                    <span className={styles.meetWhen}>
                      {m
                        ? `${formatManilaDateLong(m.datetime)} · ${formatManilaTime(m.datetime)}`
                        : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.note}>
          {bookedPending
            ? "Meetings are still loading."
            : bookedMeetings.length === 0
              ? "Bookings made from the case queue show up here."
              : `${bookedMeetings.length} parent meeting${
                  bookedMeetings.length === 1 ? "" : "s"
                } on the calendar${
                  firstMeeting
                    ? ` — next on ${formatManilaDateLong(firstMeeting.datetime)} at ${formatManilaTime(firstMeeting.datetime)}`
                    : ""
                }.`}
        </p>
      </section>
    </div>
  );
}
