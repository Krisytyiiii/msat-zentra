"use client";

import * as React from "react";
import { NursePageHeader } from "../components/NursePageHeader";
import {
  NURSE_TRACK_TONES,
  fetchNurseCalendar,
  nurseEventHref,
  nurseTrackLabel,
} from "@/services/nurse/calendar.service";
import {
  ScheduleCalendarPage,
  SchedulePageFallback,
} from "@/app/guidance/schedule/components/schedule-calendar-page";

/**
 * Clinic desk calendar: every booked session on the nurse's referrals (clinic
 * matters and the ADM consultations the nurse reviews) plus the ADM parent
 * meetings the nurse is invited to or that belong to a case on the desk.
 * Read-only — "Open case" deep-links into the existing nurse desks, so booking
 * keeps its slot rules, notifications and sounds.
 *
 * The board is live: `guidanceLiveQueryOptions` refetches every 15s (and while
 * the tab is hidden), and `nurseChannel.ts` invalidates the `nurse-calendar`
 * key the moment a referral/session/meeting row changes.
 *
 * The layout itself is `ScheduleCalendarPage`, shared verbatim with the
 * guidance calendar — the clinic only supplies its own fetcher and track
 * labels/tones, so both desks render the identical board and shimmer skeleton.
 */
export default function NurseSchedulePage() {
  return (
    <React.Suspense fallback={<SchedulePageFallback />}>
      <ScheduleCalendarPage
        queryKey="nurse-calendar"
        loadEvents={fetchNurseCalendar}
        Header={NursePageHeader}
        description="Booked clinic sessions, ADM case consultations and parent meetings on the clinic desk."
        rail={{
          tones: NURSE_TRACK_TONES,
          trackLabel: nurseTrackLabel,
          eventHref: nurseEventHref,
        }}
      />
    </React.Suspense>
  );
}
