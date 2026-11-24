"use client";

import * as React from "react";
import { GuidancePageHeader } from "../components/GuidancePageHeader";
import { fetchGuidanceCalendar } from "@/services/guidance/calendar.service";
import {
  ScheduleCalendarPage,
  SchedulePageFallback,
} from "./components/schedule-calendar-page";

/**
 * Guidance desk calendar: every booked counseling session (intervention,
 * counseling, ADM case) plus ADM parent meetings, laid out in the same kanban
 * card language as the other desks. Read-only — "Open case" deep-links into the
 * existing desks, so booking keeps its slot rules, notifications and sounds.
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
        Header={GuidancePageHeader}
        description="Booked interventions, counseling sessions, ADM case sessions and parent meetings."
      />
    </React.Suspense>
  );
}
