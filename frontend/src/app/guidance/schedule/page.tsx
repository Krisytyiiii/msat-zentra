"use client";

import * as React from "react";
import { fetchGuidanceCalendar } from "@/services/guidance/calendar.service";
import { rescheduleFollowUpSession } from "@/services/guidance/interventions.service";
import {
  fetchDaySchedule,
  rescheduleAdmMeeting,
  rescheduleSession,
} from "@/services/guidance/sessions.service";
import type { CalendarEvent } from "./components/calendar-utils";
import {
  ScheduleCalendarPage,
  SchedulePageFallback,
} from "./components/schedule-calendar-page";

/** Session rows carry their id after the `session:` prefix. */
function sessionIdOf(event: CalendarEvent): string | null {
  return event.id.startsWith("session:") ? event.id.slice("session:".length) : null;
}

/**
 * Move a booked session from the calendar drawer. Intervention follow-ups and
 * referral sessions live on different routes but share the same slot rules and
 * notification fanout as their case desks.
 */
function moveGuidanceBooking(
  event: CalendarEvent,
  scheduledAt: string,
): Promise<unknown> {
  const sessionId = sessionIdOf(event);
  if (!sessionId) {
    return Promise.reject(new Error("This booking can't be moved here."));
  }
  if (event.interventionId) {
    return rescheduleFollowUpSession(
      event.interventionId,
      sessionId,
      scheduledAt,
      event.sessionType,
    );
  }
  if (event.referralId) {
    return rescheduleSession(
      event.referralId,
      sessionId,
      scheduledAt,
      event.sessionType,
    );
  }
  return Promise.reject(new Error("This booking can't be moved here."));
}

/** ADM parent meetings (`meeting:` rows) live on the coordinator's route. */
function moveAdmMeeting(
  event: CalendarEvent,
  meetingDatetime: string,
): Promise<unknown> {
  const meetingId = event.id.startsWith("meeting:")
    ? event.id.slice("meeting:".length)
    : null;
  if (!meetingId) {
    return Promise.reject(new Error("This booking can't be moved here."));
  }
  const venue = event.venue === "home" ? "home" : "school";
  return rescheduleAdmMeeting(meetingId, meetingDatetime, venue);
}

/**
 * Guidance desk calendar: every booked counseling session (intervention,
 * counseling, ADM case) plus ADM parent meetings, laid out on the same
 * full-width calendar card as the administrator's no-class-days desk.
 * Sessions and ADM parent meetings can be moved from the day drawer (the
 * backend still refuses a closed/resolved case, an attended meeting or a
 * certified one); opening a booking jumps to its case desk for notes, outcomes
 * and cancellation, so those keep their rules, notifications and sounds.
 *
 * The board is live: `guidanceLiveQueryOptions` refetches every 15s (and while
 * the tab is hidden), and the guidance realtime channel invalidates the
 * `guidance-calendar` key the moment a referral/session/intervention/ADM row
 * changes. The sidebar dot comes from `/api/guidance/nav-counts`, which diffs
 * session + meeting versions against what the counselor last saw.
 *
 * The layout itself is `ScheduleCalendarPage`, shared verbatim with the clinic
 * calendar — see that file before changing either desk.
 */
export default function GuidanceSchedulePage() {
  return (
    <React.Suspense fallback={<SchedulePageFallback />}>
      <ScheduleCalendarPage
        queryKey="guidance-calendar"
        loadEvents={fetchGuidanceCalendar}
        onReschedule={moveGuidanceBooking}
        onRescheduleMeeting={moveAdmMeeting}
        fetchTakenTimes={(dateKey, signal) => fetchDaySchedule(dateKey, { signal })}
      />
    </React.Suspense>
  );
}
