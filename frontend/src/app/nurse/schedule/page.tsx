"use client";

import * as React from "react";
import {
  ALL_NURSE_CALENDAR_TRACKS,
  NURSE_TRACK_LABELS,
  NURSE_TRACK_TONES,
  fetchNurseCalendar,
  nurseEventHref,
} from "@/services/nurse/calendar.service";
import { rescheduleClinicSession } from "@/services/nurse/sessions.service";
import type { CalendarEvent } from "@/app/guidance/schedule/components/calendar-utils";
import {
  ScheduleCalendarPage,
  SchedulePageFallback,
} from "@/app/guidance/schedule/components/schedule-calendar-page";

/** Session rows carry their id after the `session:` prefix. */
function sessionIdOf(event: CalendarEvent): string | null {
  return event.id.startsWith("session:") ? event.id.slice("session:".length) : null;
}

/** Move a booked clinic/ADM-consult session from the calendar drawer. */
function moveClinicBooking(
  event: CalendarEvent,
  scheduledAt: string,
): Promise<void> {
  const sessionId = sessionIdOf(event);
  if (!sessionId || !event.referralId) {
    return Promise.reject(new Error("This booking can't be moved here."));
  }
  return rescheduleClinicSession(
    event.referralId,
    sessionId,
    scheduledAt,
    event.sessionType,
  );
}

/**
 * Clinic desk calendar: every booked session on the nurse's referrals (clinic
 * matters and the ADM consultations the nurse reviews) plus the ADM parent
 * meetings the nurse is invited to or that belong to a case on the desk.
 * Clinic sessions can be moved from the day drawer; opening a booking jumps to
 * its card desk, so completion/cancellation keep their slot rules,
 * notifications and sounds.
 *
 * The board is live: `guidanceLiveQueryOptions` refetches every 15s (and while
 * the tab is hidden), and `nurseChannel.ts` invalidates the `nurse-calendar`
 * key the moment a referral/session/meeting row changes.
 *
 * The layout itself is `ScheduleCalendarPage`, shared verbatim with the
 * guidance calendar — the clinic only supplies its own fetcher and track
 * labels, so both desks render the identical card and shimmer skeleton.
 */
export default function NurseSchedulePage() {
  return (
    <React.Suspense fallback={<SchedulePageFallback />}>
      <ScheduleCalendarPage
        queryKey="nurse-calendar"
        loadEvents={fetchNurseCalendar}
        config={{
          tracks: ALL_NURSE_CALENDAR_TRACKS,
          labels: NURSE_TRACK_LABELS,
          tones: NURSE_TRACK_TONES,
          eventHref: nurseEventHref,
        }}
        onReschedule={moveClinicBooking}
      />
    </React.Suspense>
  );
}
