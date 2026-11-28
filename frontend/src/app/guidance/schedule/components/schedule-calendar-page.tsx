"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, Info, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BookSessionDialog,
  type BookSessionStudentCard,
} from "@/components/session-booking/BookSessionDialog";
import { SidePanel } from "@/components/ui/side-panel";
import { useDock } from "@/components/dock/dock-store";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { bookingStatusLabel } from "@/lib/labels/status-tone";
import { cn } from "@/lib/utils";
import { useTerm } from "@/lib/term/TermContext";
import { guidanceLiveQueryOptions } from "@/lib/api/live";
import { ALL_CALENDAR_TRACKS, TRACK_LABELS } from "@/services/guidance/calendar.service";
import { CalendarMonth } from "./calendar-month";
import { GuidanceScheduleSkeleton } from "./calendar-skeleton";
import {
  dateKey,
  eventHref as defaultEventHref,
  formatTime,
  groupByDay,
  isClosed,
  sessionTypeLabel,
  type CalendarEvent,
} from "./calendar-utils";
import styles from "./guidance-calendar.module.css";

const WEEK_OPTS = { weekStartsOn: 1 as const };

function localDayStart(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString();
}

function localDayEnd(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString();
}

function longDate(key: string): string {
  return format(new Date(`${key}T00:00:00`), "EEEE, MMMM d, yyyy");
}

/** Case-desk action label per booking family. */
function openActionLabel(track: string): string {
  if (track === "intervention") return "Open intervention";
  if (track === "counseling") return "Open counseling case";
  if (track === "clinic") return "Open clinic case";
  return "Open ADM case";
}

/** Session rows carry their own id after the `session:` prefix. */
function sessionIdOf(event: CalendarEvent): string | null {
  return event.id.startsWith("session:") ? event.id.slice("session:".length) : null;
}

/** Local `YYYY-MM-DD` / `HH:MM` for the board's date + clock pickers. */
function localDateKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function localTimeKey(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function studentCardOf(event: CalendarEvent): BookSessionStudentCard {
  return {
    name: event.learner,
    lrn: event.lrn,
    grade: event.grade,
    section: event.section,
  };
}

/** One label + value cell inside a booking card's detail grid. */
function BookingDetail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] leading-none text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-[12px] font-medium leading-snug text-foreground">
        {value}
      </dd>
    </div>
  );
}

export type ScheduleRange = {
  from: string;
  to: string;
  status: "all" | "scheduled";
};

/**
 * Per-desk palette and deep-linking. The guidance desk keeps the defaults; the
 * clinic supplies its own track family, tones and case routes.
 */
export type ScheduleDeskConfig = {
  tracks?: readonly string[];
  labels?: Record<string, string>;
  tones?: Record<string, string>;
  eventHref?: (event: CalendarEvent) => string | null;
};

/**
 * The one booked-schedule desk shared by guidance and the clinic.
 *
 * Laid out exactly like the administrator's no-class-days desk: one full-width
 * calendar card (month caption with its own chevrons, card-fitting day grid,
 * legend and note) and a right-hand `SidePanel` drawer that lists the bookings
 * of whichever date was clicked. Only the query key, the fetcher, the track
 * labels/tones and the case deep-links are per-desk.
 */
export function ScheduleCalendarPage({
  queryKey,
  loadEvents,
  config,
  onReschedule,
  onRescheduleMeeting,
  fetchTakenTimes,
}: {
  /** Prefix for the TanStack cache key, e.g. "guidance-calendar". */
  queryKey: string;
  loadEvents: (
    params: ScheduleRange,
    opts: { signal?: AbortSignal },
  ) => Promise<{ events: CalendarEvent[] }>;
  config?: ScheduleDeskConfig;
  /**
   * Moves a booked session to a new instant. The drawer only offers
   * "Reschedule" when a desk supplies this, so the clinic and the counselor
   * keep their own case rules/permissions.
   */
  onReschedule?: (event: CalendarEvent, scheduledAt: string) => Promise<unknown>;
  /**
   * Moves an ADM parent meeting (`meeting:` rows). Meetings are not counseling
   * sessions, so they use the coordinator's meeting route instead.
   */
  onRescheduleMeeting?: (
    event: CalendarEvent,
    meetingDatetime: string,
  ) => Promise<unknown>;
  /** Optional taken-slot lookup for the move overlay (same as booking). */
  fetchTakenTimes?: (dateKey: string, signal: AbortSignal) => Promise<string[]>;
}) {
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const router = useRouter();
  const queryClient = useQueryClient();
  const dock = useDock();

  const [cursor, setCursor] = React.useState(() => new Date());
  const [drawerDate, setDrawerDate] = React.useState<string | null>(null);
  const [movingEvent, setMovingEvent] = React.useState<CalendarEvent | null>(null);

  const tracks: readonly string[] = config?.tracks ?? ALL_CALENDAR_TRACKS;
  const labels: Record<string, string> = config?.labels ?? TRACK_LABELS;
  const eventHref = config?.eventHref ?? defaultEventHref;

  const range = React.useMemo(
    () => ({
      start: startOfWeek(startOfMonth(cursor), WEEK_OPTS),
      end: endOfWeek(endOfMonth(cursor), WEEK_OPTS),
    }),
    [cursor],
  );

  const fromISO = localDayStart(range.start);
  const toISO = localDayEnd(range.end);

  const calendarQuery = useQuery({
    ...guidanceLiveQueryOptions,
    queryKey: [queryKey, termKey, fromISO, toISO],
    queryFn: ({ signal }) =>
      loadEvents({ from: fromISO, to: toISO, status: "scheduled" }, { signal }),
    enabled: termReady,
  });

  const events = React.useMemo(
    () => calendarQuery.data?.events ?? [],
    [calendarQuery.data],
  );
  const grouped = React.useMemo(() => groupByDay(events), [events]);
  const drawerEvents = drawerDate ? (grouped.get(drawerDate) ?? []) : [];

  // The fetched window is padded to whole weeks; the legend counts only the
  // dates actually shown in this month.
  const monthCount = React.useMemo(() => {
    const from = dateKey(startOfMonth(cursor));
    const to = dateKey(endOfMonth(cursor));
    return events.filter((event) => {
      const key = dateKey(new Date(event.start));
      return key >= from && key <= to;
    }).length;
  }, [cursor, events]);

  const moveMutation = useMutation({
    mutationFn: async ({
      event,
      scheduledAt,
    }: {
      event: CalendarEvent;
      scheduledAt: string;
    }) => {
      if (event.id.startsWith("meeting:")) {
        if (!onRescheduleMeeting) {
          throw new Error("Rescheduling is not available on this desk.");
        }
        return onRescheduleMeeting(event, new Date(scheduledAt).toISOString());
      }
      if (!onReschedule) {
        throw new Error("Rescheduling is not available on this desk.");
      }
      return onReschedule(event, scheduledAt);
    },
    onSuccess: () => {
      setMovingEvent(null);
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
  });

  function startMove(event: CalendarEvent) {
    moveMutation.reset();
    setMovingEvent(event);
  }

  function closeMove() {
    if (moveMutation.isPending) return;
    setMovingEvent(null);
    moveMutation.reset();
  }

  /**
   * Confirm closes both the move board and the day drawer immediately so the
   * shared task dock (bottom-right) is visible while the reschedule saves.
   */
  function submitMove(event: CalendarEvent, scheduledAt: string) {
    setMovingEvent(null);
    setDrawerDate(null);

    let taskId: string | null = null;
    try {
      taskId = dock.startTask({
        kind: "generic",
        title: "Moving session",
        description: `${event.learner} · ${new Date(scheduledAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`,
      });
    } catch {
      taskId = null;
    }

    moveMutation.mutate(
      { event, scheduledAt },
      {
        onSuccess: () => {
          if (taskId) dock.completeTask(taskId, "Session moved.");
        },
        onError: (error) => {
          if (taskId) {
            dock.failTask(
              taskId,
              error instanceof Error ? error.message : "Couldn't move the session.",
            );
          }
        },
      },
    );
  }

  function openEvent(event: CalendarEvent) {
    const href = eventHref(event);
    if (href) router.push(href);
  }

  return (
    <section className={styles.page} aria-label="Schedule">
      {calendarQuery.isLoading || !termReady ? (
        <GuidanceScheduleSkeleton />
      ) : calendarQuery.isError ? (
        <div className={styles.errorCard}>
          <p className={styles.errorTitle}>Couldn&apos;t load the calendar.</p>
          <p className={styles.errorHint}>
            {calendarQuery.error instanceof Error
              ? calendarQuery.error.message
              : "Check your connection and try again."}
          </p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => calendarQuery.refetch()}
            aria-label="Retry"
          >
            <RefreshCw size={16} className={calendarQuery.isFetching ? styles.spin : undefined} />
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          <section className={styles.calendarCard} aria-label="Booked schedule">
            <CalendarMonth
              cursor={cursor}
              grouped={grouped}
              onSelectDay={setDrawerDate}
              onMonthChange={(month) => setCursor(startOfMonth(month))}
            />

            <div className={styles.legend} aria-label="Calendar legend">
              {tracks.map((track) => (
                <span key={track} className={styles.legendItem}>
                  <span className={styles.legendDot} data-track={track} aria-hidden="true" />
                  {labels[track] ?? track}
                </span>
              ))}
              <span className={styles.legendCount}>
                {calendarQuery.isPending ? "Loading…" : `${monthCount} booked this month`}
              </span>
            </div>

            <div className={styles.note}>
              <Info size={13} aria-hidden className={styles.noteIcon} />
              <p>
                Pick a date to see its bookings. Reschedule a booked session right here, or open
                it to jump to its case desk for notes, outcomes and cancellation — those keep
                their rules, notifications and sounds. <strong>Cancelled</strong> bookings stay
                crossed out until the month ends.
              </p>
            </div>
          </section>
        </div>
      )}

      <SidePanel
        open={drawerDate !== null}
        onClose={() => setDrawerDate(null)}
        label={drawerDate ? longDate(drawerDate) : "Booked sessions"}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
          <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
              aria-hidden
            >
              <CalendarDays size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                {drawerDate ? longDate(drawerDate) : "Booked sessions"}
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {drawerEvents.length === 0
                  ? "No sessions are booked on this date."
                  : `${drawerEvents.length} booked ${drawerEvents.length === 1 ? "session" : "sessions"} on this date.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerDate(null)}
              aria-label="Close booked sessions"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
            {drawerEvents.length === 0 ? (
              <p className="text-[12px] leading-snug text-muted-foreground">
                Nothing is scheduled for this date. Bookings are created from the case desks and
                appear here once saved.
              </p>
            ) : (
              drawerEvents.map((event) => {
                const href = eventHref(event);
                const closed = isClosed(event);
                const trackLabel = labels[event.track] ?? event.track;
                const canMove =
                  event.status === "scheduled" &&
                  event.reschedulable !== false &&
                  (event.id.startsWith("meeting:")
                    ? onRescheduleMeeting !== undefined
                    : onReschedule !== undefined && sessionIdOf(event) !== null);
                return (
                  <article
                    key={event.id}
                    className="rounded-md border border-border bg-card p-3 transition-colors duration-150"
                  >
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 overflow-hidden rounded-full border border-border bg-muted/40">
                        <StudentMascot
                          name={event.learner}
                          seed={event.lrn || event.learner}
                          character={event.mascot ?? undefined}
                          size={40}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "truncate text-[15px] font-semibold leading-tight text-foreground",
                              closed && "line-through opacity-60",
                            )}
                            title={event.learner}
                          >
                            {event.learner}
                          </p>
                          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium leading-none text-muted-foreground">
                            <span
                              className={styles.statusDot}
                              data-status={event.status}
                              aria-hidden="true"
                            />
                            {bookingStatusLabel(event.status)}
                          </span>
                        </div>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                          <span>
                            LRN:{" "}
                            <span className="font-semibold tabular-nums text-foreground">
                              {event.lrn || "—"}
                            </span>
                          </span>
                          <span aria-hidden className="text-border">
                            |
                          </span>
                          <span>
                            Grade level:{" "}
                            <span className="font-semibold text-foreground">
                              {event.grade || "—"}
                            </span>
                          </span>
                          <span aria-hidden className="text-border">
                            |
                          </span>
                          <span>
                            Section:{" "}
                            <span className="font-semibold text-foreground">
                              {event.section || "—"}
                            </span>
                          </span>
                          <span aria-hidden className="text-border">
                            |
                          </span>
                          <span>
                            Case:{" "}
                            <span className="font-semibold text-foreground">{trackLabel}</span>
                          </span>
                        </p>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-border pt-3">
                      <BookingDetail label="Time" value={formatTime(event.start)} />
                      <BookingDetail
                        label="Session"
                        value={sessionTypeLabel(event.sessionType)}
                      />
                      <BookingDetail label="Venue" value={event.venue || "To be confirmed"} />
                      {event.invited !== null ? (
                        <BookingDetail
                          label="RSVP"
                          value={event.invited ? "You're invited" : "Not invited"}
                        />
                      ) : null}
                      {event.outcome ? (
                        <div className="col-span-2 min-w-0">
                          <dt className="text-[12px] leading-none text-muted-foreground">
                            Outcome
                          </dt>
                          <dd className="mt-1 text-[12px] font-medium leading-snug text-foreground">
                            {event.outcome}
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-2.5">
                      {canMove ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => startMove(event)}
                          className="px-2.5 text-[12px]"
                        >
                          Reschedule
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        onClick={() => openEvent(event)}
                        disabled={!href}
                        className="px-2.5 text-[12px]"
                      >
                        {openActionLabel(event.track)}
                      </Button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              onClick={() => setDrawerDate(null)}
              className="px-2.5 text-[12px]"
            >
              Close
            </Button>
          </div>
        </div>
      </SidePanel>

      <BookSessionDialog
        open={movingEvent !== null}
        onClose={closeMove}
        onSubmit={(fields) => {
          if (movingEvent) submitMove(movingEvent, fields.scheduledAt);
        }}
        title="Move session"
        description={
          movingEvent
            ? `Move ${movingEvent.learner}'s ${sessionTypeLabel(
                movingEvent.sessionType,
              ).toLowerCase()} to a new date and time. The case desk, adviser and learner are notified automatically.`
            : undefined
        }
        studentCard={movingEvent ? studentCardOf(movingEvent) : null}
        fetchTakenTimes={fetchTakenTimes}
        hideDetails
        initialDate={movingEvent ? localDateKey(movingEvent.start) : ""}
        initialTime={movingEvent ? localTimeKey(movingEvent.start) : ""}
        submitLabel="Move session"
        busyLabel="Moving…"
        busy={moveMutation.isPending}
        serverError={
          moveMutation.isError
            ? moveMutation.error instanceof Error
              ? moveMutation.error.message
              : "Couldn't move the session."
            : null
        }
        idPrefix="move-session"
        variant="board"
      />

      {calendarQuery.isFetching && !calendarQuery.isLoading ? (
        <span className={styles.srOnly} role="status">
          <Loader2 size={12} /> Refreshing schedule
        </span>
      ) : null}
    </section>
  );
}

/**
 * Route-level Suspense fallback: the same shimmer skeleton the page shows
 * while the range loads, so a cold navigation never flashes an empty page.
 */
export function SchedulePageFallback() {
  return <GuidanceScheduleSkeleton />;
}
