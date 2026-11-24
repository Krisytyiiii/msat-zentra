"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import type { PillTone } from "@/components/ui/pill";
import { useTerm } from "@/lib/term/TermContext";
import { guidanceLiveQueryOptions } from "@/lib/api/live";
import {
  CalendarToolbar,
  type CalendarView,
} from "./calendar-toolbar";
import { CalendarMonth } from "./calendar-month";
import { CalendarWeek } from "./calendar-week";
import { CalendarDayRail } from "./calendar-day-rail";
import { GuidanceScheduleSkeleton } from "./calendar-skeleton";
import {
  dateKey,
  groupByDay,
  parseDateKey,
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

export type ScheduleRange = {
  from: string;
  to: string;
  status: "all" | "scheduled";
};

export type SchedulePageHeader = React.ComponentType<{
  title: string;
  description?: string;
}>;

/**
 * The one booked-schedule desk shared by guidance and the clinic.
 *
 * Both routes render this exact tree (kanban board shell + toolbar + month/week
 * grid + day rail) and the same `GuidanceScheduleSkeleton` while the range
 * loads, so the two desks cannot drift in layout. Only the query key, the
 * fetcher, the page header and the rail's track labels/tones are per-desk.
 */
export function ScheduleCalendarPage({
  queryKey,
  loadEvents,
  Header,
  description,
  rail,
}: {
  /** Prefix for the TanStack cache key, e.g. "guidance-calendar". */
  queryKey: string;
  loadEvents: (
    params: ScheduleRange,
    opts: { signal?: AbortSignal },
  ) => Promise<{ events: CalendarEvent[] }>;
  Header: SchedulePageHeader;
  description: string;
  rail?: {
    tones?: Record<string, PillTone>;
    trackLabel?: (track: string) => string;
    eventHref?: (event: CalendarEvent) => string | null;
  };
}) {
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const view: CalendarView = searchParams.get("view") === "week" ? "week" : "month";
  const cursor = React.useMemo(
    () => parseDateKey(searchParams.get("date") ?? "") ?? new Date(),
    [searchParams],
  );
  const selectedKey = dateKey(cursor);

  const [query, setQuery] = React.useState("");
  const [selectedEventId, setSelectedEventId] = React.useState<string | null>(null);

  const range = React.useMemo(() => {
    if (view === "week") {
      return {
        start: startOfWeek(cursor, WEEK_OPTS),
        end: endOfWeek(cursor, WEEK_OPTS),
      };
    }
    return {
      start: startOfWeek(startOfMonth(cursor), WEEK_OPTS),
      end: endOfWeek(endOfMonth(cursor), WEEK_OPTS),
    };
  }, [cursor, view]);

  const fromISO = localDayStart(range.start);
  const toISO = localDayEnd(range.end);

  const calendarQuery = useQuery({
    ...guidanceLiveQueryOptions,
    queryKey: [queryKey, termKey, view, fromISO, toISO],
    queryFn: ({ signal }) =>
      loadEvents({ from: fromISO, to: toISO, status: "scheduled" }, { signal }),
    enabled: termReady,
  });

  const events = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (calendarQuery.data?.events ?? []).filter((event) => {
      if (!needle) return true;
      return `${event.learner} ${event.lrn} ${event.section}`.toLowerCase().includes(needle);
    });
  }, [calendarQuery.data, query]);

  const grouped = React.useMemo(() => groupByDay(events), [events]);
  const dayEvents = grouped.get(selectedKey) ?? [];
  const hasAnyInRange = (calendarQuery.data?.events.length ?? 0) > 0;

  function pushState(next: { view?: CalendarView; date?: Date }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextView = next.view ?? view;
    const nextDate = next.date ?? cursor;
    if (nextView === "month") params.delete("view");
    else params.set("view", nextView);
    params.set("date", dateKey(nextDate));
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  function step(direction: 1 | -1) {
    const next = view === "week" ? addWeeks(cursor, direction) : addMonths(cursor, direction);
    pushState({ date: next });
  }

  function selectEvent(event: CalendarEvent) {
    setSelectedEventId(event.id);
    pushState({ date: new Date(event.start) });
  }

  const label =
    view === "week"
      ? `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`
      : format(cursor, "MMMM yyyy");

  return (
    <section className={styles.page} aria-label="Schedule">
      <Header title="Schedule" description={description} />

      {calendarQuery.isLoading || !termReady ? (
        <GuidanceScheduleSkeleton
          view={view}
          cursor={cursor}
          showTitle={false}
          showViewToggle={false}
          showFilters={false}
          toolbarAlign="start"
        />
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
        <div className={styles.body}>
          <div className={styles.mainCol}>
            <KanbanBoard
              className={styles.boardSurface}
              headerDivider={false}
              ariaLabel="Booked schedule"
              headerToolbarAlign="start"
              headerToolbar={
                <CalendarToolbar
                  label={label}
                  view={view}
                  align="start"
                  showViewToggle={false}
                  onViewChange={(next) => pushState({ view: next })}
                  onPrev={() => step(-1)}
                  onNext={() => step(1)}
                  onToday={() => pushState({ date: new Date() })}
                  query={query}
                  onQueryChange={setQuery}
                />
              }
            >
              {events.length === 0 ? (
                <div className={styles.boardEmpty}>
                  <PageEmptyCallout fit>
                    {hasAnyInRange
                      ? "No sessions match your search."
                      : `Nothing is booked in this ${view === "week" ? "week" : "month"} yet. Book a session from the case desk and it will appear here.`}
                  </PageEmptyCallout>
                </div>
              ) : null}

              {view === "month" ? (
                <CalendarMonth
                  cursor={cursor}
                  selectedKey={selectedKey}
                  grouped={grouped}
                  onSelectDay={(key) => pushState({ date: parseDateKey(key) ?? cursor })}
                  onSelectEvent={selectEvent}
                />
              ) : (
                <CalendarWeek
                  cursor={cursor}
                  selectedKey={selectedKey}
                  grouped={grouped}
                  onSelectDay={(key) => pushState({ date: parseDateKey(key) ?? cursor })}
                  onSelectEvent={selectEvent}
                />
              )}
            </KanbanBoard>
          </div>

          <CalendarDayRail
            day={cursor}
            events={dayEvents}
            selectedEventId={selectedEventId}
            onSelectEvent={selectEvent}
            tones={rail?.tones}
            trackLabel={rail?.trackLabel}
            eventHref={rail?.eventHref}
          />
        </div>
      )}

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
  const [today] = React.useState(() => new Date());
  return (
    <GuidanceScheduleSkeleton
      view="month"
      cursor={today}
      showTitle={false}
      showViewToggle={false}
      showFilters={false}
      toolbarAlign="start"
    />
  );
}
