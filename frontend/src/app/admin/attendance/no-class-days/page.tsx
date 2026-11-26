"use client";

import * as React from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Info, Loader2, Save, Trash2, X } from "lucide-react";

import { useDock } from "@/components/dock/dock-store";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SidePanel } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/api/errors";
import {
  NO_CLASS_KEY,
  useDeleteNoClassDay,
  useNoClassDays,
  useSaveNoClassDay,
  type NoClassDay,
  type NoClassDayList,
  type NoClassScope,
} from "@/services/admin/noClassDays.service";
import styles from "./no-class-days.module.css";

function parseDayKey(key: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return undefined;
  const day = new Date(`${key}T00:00:00`);
  return Number.isNaN(day.getTime()) ? undefined : day;
}

function dayKey(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

function longDate(key: string): string {
  return format(new Date(`${key}T00:00:00`), "EEEE, MMMM d, yyyy");
}

const SCOPES: { value: NoClassScope; label: string; hint: string }[] = [
  { value: "whole_day", label: "Whole day", hint: "Every meetup is cancelled." },
  { value: "am", label: "Morning only", hint: "Only periods before lunch." },
  { value: "pm", label: "Afternoon only", hint: "Only periods after lunch." },
];

const SCOPE_BADGE: Record<NoClassScope, { label: string; variant: "red" | "amber" | "blue" }> = {
  whole_day: { label: "Whole day", variant: "red" },
  am: { label: "Morning", variant: "amber" },
  pm: { label: "Afternoon", variant: "blue" },
};

const LEGEND: { scope: NoClassScope; label: string }[] = [
  { scope: "whole_day", label: "Whole day" },
  { scope: "am", label: "Morning" },
  { scope: "pm", label: "Afternoon" },
];

/**
 * Loading shell for the school calendar — the same card as the loaded board
 * (month caption, 7-column weekday header, six week rows, legend and note) so
 * declaring a date never shifts the desk.
 */
function NoClassDaysSkeleton() {
  return (
    <ShimmerGroup>
      <section
        className={styles.page}
        role="status"
        aria-label="Loading no-class days"
        aria-busy="true"
      >
        <div className={styles.grid}>
          <section className={styles.calendarCard}>
            <Skeleton className="mx-auto h-5 w-40 rounded-md" />

            <div className="grid w-full grid-cols-7 gap-1" aria-hidden="true">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={`weekday-${i}`} className="mx-auto h-3 w-8" />
              ))}
            </div>

            <div
              className="grid w-full flex-1 auto-rows-[minmax(0,1fr)] grid-cols-7 gap-1"
              aria-hidden="true"
            >
              {Array.from({ length: 42 }).map((_, i) => (
                <Skeleton key={`day-${i}`} className="h-full min-h-[3.75rem] w-full" />
              ))}
            </div>

            <div className={styles.legend} aria-hidden="true">
              {LEGEND.map((item) => (
                <span key={item.scope} className={styles.legendItem}>
                  <ShimmerSkeleton className={styles.legendDot} />
                  <ShimmerSkeleton className="h-3 w-14" />
                </span>
              ))}
              <span className={`${styles.legendCount} inline-flex`}>
                <ShimmerSkeleton className="h-3 w-44" />
              </span>
            </div>

            <div className={styles.note} aria-hidden="true">
              <ShimmerSkeleton className={`${styles.noteIcon} size-3.5 rounded-sm`} />
              <div className="flex w-full flex-col gap-1.5">
                <ShimmerSkeleton className="h-3 w-full" />
                <ShimmerSkeleton className="h-3 w-4/5" />
              </div>
            </div>
          </section>
        </div>
      </section>
    </ShimmerGroup>
  );
}

export default function AdminNoClassDaysPage() {
  const [drawerDate, setDrawerDate] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<NoClassDay | null>(null);
  const [scope, setScope] = React.useState<NoClassScope>("whole_day");
  const [reason, setReason] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<NoClassDay | null>(null);

  const listQuery = useNoClassDays();
  const save = useSaveNoClassDay();
  const remove = useDeleteNoClassDay();
  const queryClient = useQueryClient();
  const dock = useDock();

  const entries = listQuery.data?.entries ?? [];

  const byDate = React.useMemo(() => {
    const map = new Map<string, NoClassDay>();
    for (const entry of entries) map.set(entry.date, entry);
    return map;
  }, [entries]);

  const modifiers = React.useMemo(() => {
    const buckets: Record<NoClassScope, Date[]> = { whole_day: [], am: [], pm: [] };
    for (const entry of entries) {
      const day = parseDayKey(entry.date);
      if (day) buckets[entry.scope].push(day);
    }
    return { whole_day: buckets.whole_day, am: buckets.am, pm: buckets.pm };
  }, [entries]);

  if (listQuery.isPending) {
    return <NoClassDaysSkeleton />;
  }

  const openDay = (key: string) => {
    const entry = byDate.get(key) ?? null;
    setDrawerDate(key);
    setEditing(entry);
    setScope(entry?.scope ?? "whole_day");
    setReason(entry?.reason ?? "");
    setFormError(null);
  };

  const closeDrawer = () => {
    setDrawerDate(null);
    setEditing(null);
    setFormError(null);
  };

  const handleSave = () => {
    if (!drawerDate) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setFormError("Describe why there are no classes (at least 3 characters).");
      return;
    }
    setFormError(null);
    const date = drawerDate;
    const isEditing = editing !== null;
    const scopeLabel = SCOPE_BADGE[scope].label;
    const dateLabel = format(new Date(`${date}T00:00:00`), "MMM d, yyyy");

    // Paint the mark on the calendar before the request leaves: the drawer
    // closes and the shared Dock carries the save, like the schedule drawers.
    queryClient.setQueryData<NoClassDayList>(NO_CLASS_KEY, (current) => {
      if (!current) return current;
      const existing = current.entries.find((entry) => entry.date === date);
      const now = new Date().toISOString();
      const optimistic: NoClassDay = existing
        ? { ...existing, scope, reason: trimmed, updatedAt: now }
        : {
            id: `pending-${date}`,
            date,
            scope,
            reason: trimmed,
            schoolYearId: current.schoolYearId,
            createdBy: "",
            createdAt: now,
            updatedAt: now,
          };
      const nextEntries = existing
        ? current.entries.map((entry) => (entry.date === date ? optimistic : entry))
        : [...current.entries, optimistic];
      return { ...current, entries: nextEntries };
    });
    closeDrawer();

    const taskId = dock.startTask({
      kind: "generic",
      title: isEditing ? "Updating no-class day…" : "Saving no-class day…",
      description: `${dateLabel} · ${scopeLabel}`,
    });

    save.mutate(
      { date, scope, reason: trimmed },
      {
        onSuccess: (row) => {
          dock.completeTask(taskId, `${dateLabel} · ${scopeLabel}`);
          toast.success({
            title: isEditing ? "No-class day updated" : "No-class day saved",
            description: `${format(new Date(`${row.date}T00:00:00`), "MMM d, yyyy")} — ${SCOPE_BADGE[row.scope].label.toLowerCase()}.`,
          });
        },
        onError: (err) => {
          const message = apiErrorMessage(err, "Could not save the no-class day.");
          // Drop the optimistic mark and go back to the server's list.
          void queryClient.invalidateQueries({ queryKey: NO_CLASS_KEY });
          dock.failTask(taskId, message);
          toast.error({ title: "Could not save", description: message });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const dateLabel = format(new Date(`${target.date}T00:00:00`), "MMM d, yyyy");
    const scopeLabel = SCOPE_BADGE[target.scope].label;

    // Close at once and drop the mark optimistically; the shared Dock carries
    // the request, same as saving a date.
    setDeleteTarget(null);
    queryClient.setQueryData<NoClassDayList>(NO_CLASS_KEY, (current) =>
      current
        ? {
            ...current,
            entries: current.entries.filter(
              (entry) => entry.id !== target.id && entry.date !== target.date,
            ),
          }
        : current,
    );

    const taskId = dock.startTask({
      kind: "generic",
      title: "Removing no-class day…",
      description: `${dateLabel} · ${scopeLabel}`,
    });

    remove.mutate(target.id, {
      onSuccess: () => {
        dock.completeTask(taskId, `${dateLabel} · ${scopeLabel}`);
        toast.success({ title: "No-class day removed" });
      },
      onError: (err) => {
        const message = apiErrorMessage(err, "Could not remove the no-class day.");
        void queryClient.invalidateQueries({ queryKey: NO_CLASS_KEY });
        dock.failTask(taskId, message);
        toast.error({ title: "Could not remove", description: message });
      },
    });
  };

  return (
    <section className={styles.page}>
      <div className={styles.grid}>
        <section className={styles.calendarCard} aria-label="School calendar">
          <Calendar
            onDayClick={(day) => openDay(dayKey(day))}
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
            modifiers={modifiers}
            modifiersClassNames={{
              whole_day: styles.wholeDayCell,
              am: styles.amCell,
              pm: styles.pmCell,
            }}
            components={{
              // Each declared date carries its reason inside the cell, so the
              // calendar reads as a schedule of suspensions instead of a row of
              // unexplained colour dots.
              DayButton: ({ children, ...props }) => {
                const entry = byDate.get(dayKey(props.day.date));
                return (
                  <CalendarDayButton {...props}>
                    {children}
                    {entry ? (
                      <span className={styles.dayReason} title={entry.reason}>
                        {entry.reason}
                      </span>
                    ) : null}
                  </CalendarDayButton>
                );
              },
            }}
          />

          <div className={styles.legend} aria-label="Calendar legend">
            {LEGEND.map((item) => (
              <span key={item.scope} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  data-scope={item.scope}
                  aria-hidden="true"
                />
                {item.label}
              </span>
            ))}
            <span className={styles.legendCount}>
              {listQuery.isPending
                ? "Loading…"
                : `${entries.length} declared this school year`}
            </span>
          </div>

          <div className={styles.note}>
            <Info size={13} aria-hidden className={styles.noteIcon} />
            <p>
              A no-class day cancels its meetups: teachers cannot take attendance for them, and
              they are left out of attendance rates and risk checks. <strong>Whole day</strong>{" "}
              cancels every period; <strong>Morning</strong> or <strong>Afternoon</strong> cancels
              only that half of the schedule.
            </p>
          </div>
        </section>
      </div>

      <SidePanel
        open={drawerDate !== null}
        onClose={closeDrawer}
        label={drawerDate ? longDate(drawerDate) : "No-class day"}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
          <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
              aria-hidden
            >
              <CalendarOff size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                {drawerDate ? longDate(drawerDate) : "No-class day"}
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                {editing
                  ? "This date is already declared. Saving updates its scope and reason."
                  : "Declare why classes are suspended on this date."}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close no-class day"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-foreground">Scope</span>
                <div className={styles.scopeGroup} role="group" aria-label="No-class scope">
                  {SCOPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={styles.scopeOption}
                      data-active={scope === option.value ? "true" : undefined}
                      aria-pressed={scope === option.value}
                      onClick={() => setScope(option.value)}
                    >
                      <span className={styles.scopeLabel}>{option.label}</span>
                      <span className={styles.scopeHint}>{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  className="text-[12px] font-medium text-foreground"
                  htmlFor="no-class-reason"
                >
                  Why are there no classes?
                </label>
                <Textarea
                  id="no-class-reason"
                  className="min-h-24 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/25"
                  value={reason}
                  maxLength={500}
                  rows={4}
                  placeholder="e.g. Typhoon signal no. 2 — localized class suspension"
                  aria-invalid={formError ? true : undefined}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (formError) setFormError(null);
                  }}
                />
                {formError ? (
                  <p className="text-[12px] text-destructive" role="alert">
                    {formError}
                  </p>
                ) : (
                  <p className="text-[12px] leading-snug text-muted-foreground">
                    Shown to teachers on the cancelled sheet.
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto gap-1.5 px-2.5 text-[12px] text-destructive hover:text-destructive"
                  onClick={() => {
                    setDeleteTarget(editing);
                    closeDrawer();
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                  Remove this date
                </Button>
              ) : null}
              <Button type="submit" disabled={save.isPending} className="gap-1.5 px-2.5 text-[12px]">
                {save.isPending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Save size={14} aria-hidden />
                )}
                {editing ? "Update no-class day" : "Save no-class day"}
              </Button>
            </div>
          </form>
        </div>
      </SidePanel>

      {deleteTarget ? (
        <ConfirmDialog
          tone="danger"
          title="Remove this no-class day?"
          description="The date will count as a regular school day again and teachers can take attendance for it."
          detail={`${format(new Date(`${deleteTarget.date}T00:00:00`), "MMMM d, yyyy")} — ${SCOPE_BADGE[deleteTarget.scope].label}`}
          confirmLabel="Remove"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      ) : null}
    </section>
  );
}
