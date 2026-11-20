"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarIcon, CalendarRange, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDock } from "@/components/dock/dock-store";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { SchoolYearOption } from "@/lib/term/TermContext";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";

export interface CreatedSchoolYear {
  id: string;
  name: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  terms: Array<{
    id: string;
    termNumber: number;
    startDate: string | null;
    endDate: string | null;
  }>;
}

/** Optimistic rows live in the term-picker cache under this id prefix. */
export const PENDING_SCHOOL_YEAR_PREFIX = "pending:";

function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })
    ?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** `SY 2027-2028` → [2027, 2028]; anything else → the current year pair. */
export function yearPair(name: string): [number, number] {
  const match = name.match(/(\d{4})\D{1,3}(\d{4})/);
  if (match) return [Number(match[1]), Number(match[2])];
  const y = new Date().getFullYear();
  return [y, y + 1];
}

function parseDateInput(value: string): Date | undefined {
  if (!value) return undefined;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function localTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Calendar popover (not a native date input) so term dates read like the rest
 * of the desk. `min` disables dates before it — used to block backdating.
 */
export function TermDateField({
  id,
  label,
  value,
  onChange,
  min,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateInput(value);
  const minDate = parseDateInput(min ?? "");

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "h-8 w-full justify-start gap-1.5 px-2 text-left text-[12px] font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon size={12} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected ? format(selected, "MMM d, yyyy") : "Pick a date"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[60] w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate ?? new Date()}
            disabled={minDate ? { before: minDate } : undefined}
            onSelect={(day) => {
              if (!day) return;
              onChange(format(day, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Create the school year only — its three trimesters come with it, and their
 * date windows are configured next (Term 1 → 2 → 3, never backdated). The year
 * window itself is derived from its label (June → March).
 *
 * Confirming closes the dialog immediately and paints an optimistic row; the
 * request keeps running in the shared Dock so nothing blocks the desk.
 */
export function AddSchoolYearKanban({
  suggestedName,
  suggestActive = false,
  onSubmitted,
  onCreated,
  onCancel,
}: {
  suggestedName: string;
  suggestActive?: boolean;
  /** Fired at confirm time (before the request settles) so the dialog closes. */
  onSubmitted?: () => void;
  onCreated?: (year: CreatedSchoolYear) => void;
  onCancel?: () => void;
}) {
  const [y1, y2] = yearPair(suggestedName);
  const [name, setName] = React.useState(suggestedName);
  const [makeActive, setMakeActive] = React.useState(suggestActive);
  const yearStartDate = `${y1}-06-15`;
  const yearEndDate = `${y2}-03-31`;
  const invalidateSchedule = useAdminScheduleInvalidate();
  const queryClient = useQueryClient();
  const dock = useDock();

  const create = useMutation({
    mutationFn: async (vars: {
      taskId: string;
      optimisticId: string;
      payload: { name: string; startDate: string; endDate: string; makeActive: boolean };
    }) => {
      const { data } = await apiClient.post<CreatedSchoolYear>(
        "/api/admin/schedule/school-years",
        vars.payload,
      );
      return data;
    },
    onSuccess: (year, vars) => {
      dock.updateTask(vars.taskId, {
        title: "School year created",
        description: `${year.name} · set its term dates next`,
      });
      dock.completeTask(vars.taskId);
      // Swap the optimistic row for the saved one.
      queryClient.setQueryData<SchoolYearOption[]>(
        ["term-picker", "school-years"],
        (prev) =>
          prev
            ? prev
                .filter((y) => y.id !== vars.optimisticId && y.id !== year.id)
                .concat({
                  id: year.id,
                  name: year.name,
                  isActive: year.isActive,
                  isCurrent: false,
                  startDate: year.startDate,
                  endDate: year.endDate,
                  terms: year.terms.map((t) => ({
                    id: t.id,
                    termNumber: t.termNumber,
                    startDate: t.startDate,
                    endDate: t.endDate,
                  })),
                })
            : prev,
      );
      invalidateSchedule();
      void queryClient.invalidateQueries({ queryKey: ["term-picker", "school-years"] });
      toast.success({
        title: "School year created",
        description: `${year.name} is ready — set its term dates.`,
      });
      onCreated?.(year);
    },
    onError: (err: unknown, vars) => {
      const message = getErrorMessage(err, "The school year was not created.");
      dock.failTask(vars.taskId, message);
      queryClient.setQueryData<SchoolYearOption[]>(
        ["term-picker", "school-years"],
        (prev) => (prev ? prev.filter((y) => y.id !== vars.optimisticId) : prev),
      );
      toast.error({ title: "Could not create the school year", description: message });
    },
  });

  const canSubmit = !create.isPending && name.trim() !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    const trimmedName = name.trim();
    // Close first: the desk never waits on the network.
    onSubmitted?.();
    const taskId = dock.startTask({
      kind: "term-context",
      title: "Creating school year",
      description: `${trimmedName} · terms 1–3`,
    });
    const optimisticId = `${PENDING_SCHOOL_YEAR_PREFIX}${trimmedName}`;
    queryClient.setQueryData<SchoolYearOption[]>(
      ["term-picker", "school-years"],
      (prev) =>
        prev
          ? prev.concat({
              id: optimisticId,
              name: trimmedName,
              isActive: makeActive,
              isCurrent: false,
              startDate: yearStartDate,
              endDate: yearEndDate,
              terms: [],
            })
          : prev,
    );
    create.mutate({
      taskId,
      optimisticId,
      payload: {
        name: trimmedName,
        startDate: yearStartDate,
        endDate: yearEndDate,
        makeActive,
      },
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <header className="flex items-start gap-2.5 border-b border-border px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
          aria-hidden
        >
          <CalendarRange size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">New school year</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Its three terms come with it — you can set their dates next.
          </p>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close new school year"
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className="flex flex-col gap-3.5 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-year-name" className="text-[12px] font-medium text-foreground">
              School year
            </label>
            <Input
              id="new-year-name"
              className="h-9 text-[13px]"
              placeholder="SY 2027-2028"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              autoComplete="off"
              aria-describedby="new-year-name-hint"
            />
            <p id="new-year-name-hint" className="text-[12px] leading-snug text-muted-foreground">
              A plain <span className="font-medium text-foreground">2027-2028</span> is stored as
              &ldquo;SY 2027-2028&rdquo;.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <CalendarRange size={13} aria-hidden className="shrink-0 text-amber-500" />
            <p className="text-[12px] leading-snug text-muted-foreground">
              Runs{" "}
              <span className="font-medium text-foreground">
                {format(parseISO(yearStartDate), "MMM d, yyyy")}
              </span>{" "}
              →{" "}
              <span className="font-medium text-foreground">
                {format(parseISO(yearEndDate), "MMM d, yyyy")}
              </span>
              . You can set the term dates after it is created.
            </p>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <input
              type="checkbox"
              checked={makeActive}
              onChange={(e) => setMakeActive(e.target.checked)}
              className="mt-0.5 size-3.5 accent-amber-500"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[12px] font-medium text-foreground">
                Set as the school-wide active year
              </span>
              <span className="text-[12px] leading-snug text-muted-foreground">
                The school year currently marked Active will stop being active. Desks that follow
                the school default will switch to this year.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-[12px] text-muted-foreground">Next: term dates</span>
          <Button
            type="submit"
            disabled={!canSubmit}
            aria-busy={create.isPending || undefined}
            className="h-6 gap-1.5 px-2.5 text-[12px]"
          >
            {create.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create school year"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
