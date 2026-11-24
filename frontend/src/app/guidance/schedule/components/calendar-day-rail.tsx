"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Pill, type PillTone } from "@/components/ui/pill";
import { InsightCallout } from "@/components/ui/insight-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  TRACK_TONES,
} from "@/services/guidance/calendar.service";
import styles from "./guidance-calendar.module.css";
import {
  eventHref as defaultEventHref,
  formatTime,
  sessionTypeLabel,
  trackLabel as defaultTrackLabel,
  type CalendarEvent,
} from "./calendar-utils";

export function CalendarDayRail({
  day,
  events,
  selectedEventId,
  onSelectEvent,
  tones = TRACK_TONES,
  trackLabel = defaultTrackLabel,
  eventHref = defaultEventHref,
}: {
  day: Date;
  events: CalendarEvent[];
  selectedEventId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  /** Track pill tones — defaults to the guidance palette. */
  tones?: Record<string, import("@/components/ui/pill").PillTone>;
  trackLabel?: (track: string) => string;
  eventHref?: (event: CalendarEvent) => string | null;
}) {
  return (
    <aside className={styles.rail} aria-label="Day agenda">
      <div className={styles.railHead}>
        <h2 className={styles.railTitle}>{format(day, "EEEE, MMMM d")}</h2>
        <p className={styles.railCount}>
          {events.length === 0
            ? "Nothing booked"
            : `${events.length} booked ${events.length === 1 ? "item" : "items"}`}
        </p>
      </div>

      {events.length === 0 ? (
        <InsightCallout role="status">
          No sessions or meetings on this day. Book one from the case desk.
        </InsightCallout>
      ) : (
        <ul className={styles.railList}>
          {events.map((event) => {
            const href = eventHref(event);
            const statusTone: PillTone =
              event.status === "cancelled"
                ? "red"
                : event.status === "scheduled"
                  ? "blue"
                  : "green";
            const statusText = event.status
              ? event.status.charAt(0).toUpperCase() + event.status.slice(1)
              : "Scheduled";
            return (
              <li key={event.id}>
                <div
                  className={styles.railCard}
                  data-track={event.track}
                  data-selected={event.id === selectedEventId ? "true" : undefined}
                  onClick={() => onSelectEvent(event)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectEvent(event);
                    }
                  }}
                >
                  <div className={styles.railCardTop}>
                    <StudentMascot
                      name={event.learner}
                      seed={event.lrn}
                      character={event.mascot ?? undefined}
                      size={32}
                    />
                    <div className={styles.railIdentity}>
                      <p className={styles.railLearner}>{event.learner}</p>
                      <div className={styles.railTags}>
                        <Pill tone={tones[event.track] ?? "neutral"} label="Case type">
                          {trackLabel(event.track)}
                        </Pill>
                        <Pill label="Session type">{sessionTypeLabel(event.sessionType)}</Pill>
                        {event.invited ? (
                          <Pill tone="green" label="Invitation">
                            Invited
                          </Pill>
                        ) : null}
                      </div>
                    </div>
                    <Pill tone={statusTone} label="Session status" className="shrink-0">
                      <CalendarClock size={11} aria-hidden="true" /> {statusText}
                    </Pill>
                  </div>

                  <div className={styles.railMetrics}>
                    <div className={styles.railMetric}>
                      <span className={styles.railMetricLabel}>Starts</span>
                      <span className={styles.railMetricValue}>{formatTime(event.start)}</span>
                      <span className={styles.railMetricHint}>scheduled time</span>
                    </div>
                    <div className={styles.railMetric}>
                      <span className={styles.railMetricLabel}>Venue</span>
                      <span className={styles.railMetricValue}>
                        {event.venue || "—"}
                      </span>
                      <span className={styles.railMetricHint}>
                        {event.venue ? "meeting place" : "no venue set"}
                      </span>
                    </div>
                  </div>

                  {event.lrn || href ? (
                    <div className={styles.railFoot}>
                      {event.lrn ? (
                        <Pill label="LRN" className="tabular-nums">
                          {event.lrn}
                        </Pill>
                      ) : null}
                      {href ? (
                        <Link
                          href={href}
                          className={styles.railAction}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open case
                          <ArrowRight size={12} aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
