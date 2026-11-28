"use client";

import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import styles from "./guidance-calendar.module.css";
import {
  dateKey,
  eventsOnDay,
  formatTime,
  groupByDay,
} from "./calendar-utils";

/**
 * Month view built on the shared shadcn `Calendar`, with the exact same
 * card-fitting geometry and classNames the administrator's no-class-days desk
 * uses. A declared day carries its bookings' track dots and a clamped summary
 * line (mirroring the admin desk's reason text); clicking any date opens that
 * day's drawer, where a booking jumps to its case desk.
 */
export function CalendarMonth({
  cursor,
  grouped,
  onSelectDay,
  onMonthChange,
}: {
  cursor: Date;
  grouped: ReturnType<typeof groupByDay>;
  onSelectDay: (key: string) => void;
  onMonthChange: (month: Date) => void;
}) {
  return (
    <Calendar
      month={cursor}
      onMonthChange={onMonthChange}
      onDayClick={(day) => onSelectDay(dateKey(day))}
      className={`${styles.calendar} w-full p-0 bg-transparent`}
      classNames={{
        root: "w-full",
        months: "relative flex w-full flex-1 flex-col",
        month: "relative flex w-full flex-1 flex-col gap-4",
        month_caption: "pointer-events-none flex h-12 w-full items-center justify-center px-12",
        month_grid: "w-full flex-1",
        weekdays: "w-full",
        weekday: "py-2 text-center select-none",
        week: "w-full",
        day: "aspect-auto w-auto p-0 align-middle h-full",
      }}
      components={{
        DayButton: ({ children, ...props }) => {
          const events = eventsOnDay(grouped, dateKey(props.day.date));
          const tracks = [...new Set(events.map((event) => event.track))];
          const summary =
            events.length === 0
              ? ""
              : events.length === 1
                ? `${formatTime(events[0].start)} ${events[0].learner}`
                : `${events.length} bookings`;
          return (
            <CalendarDayButton {...props}>
              {children}
              {summary ? <div className={styles.daySummary}>{summary}</div> : null}
              {tracks.length ? (
                <div className={styles.dayDots} aria-hidden="true">
                  {tracks.map((track) => (
                    <span key={track} className={styles.dayDot} data-track={track} />
                  ))}
                </div>
              ) : null}
            </CalendarDayButton>
          );
        },
      }}
    />
  );
}
