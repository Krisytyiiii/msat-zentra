"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Loader2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { useDock } from "@/components/dock/dock-store";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import type { SchoolYearOption } from "@/lib/term/TermContext";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";
import { localTodayKey, TermDateField } from "./add-school-year-kanban";

interface TermDraft {
  termId: string;
  termNumber: number;
  startDate: string;
  endDate: string;
  /** Stored values, so a past date that was already on file can be kept. */
  storedStart: string;
  storedEnd: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })
    ?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Stored ISO date → "Jun 8, 2026", so the footer reads like the rest of the page. */
function fmtDay(value: string): string {
  if (!value) return "—";
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : format(date, "MMM d, yyyy");
}

function draftFromYear(year: SchoolYearOption): TermDraft[] {
  return [...year.terms]
    .sort((a, b) => a.termNumber - b.termNumber)
    .map((t) => ({
      termId: t.id,
      termNumber: t.termNumber,
      startDate: t.startDate?.slice(0, 10) ?? "",
      endDate: t.endDate?.slice(0, 10) ?? "",
      storedStart: t.startDate?.slice(0, 10) ?? "",
      storedEnd: t.endDate?.slice(0, 10) ?? "",
    }));
}

/**
 * Trimesters are fixed at 1–3 — only their date windows are chosen here, in
 * order and never in the past. Confirming closes at once and paints the dates
 * on the board optimistically while the request runs in the shared Dock.
 */
export function ConfigureTermsKanban({
  year,
  onSubmitted,
  onCancel,
}: {
  year: SchoolYearOption;
  /** Fired at confirm time so the dialog closes without waiting. */
  onSubmitted?: () => void;
  onCancel?: () => void;
}) {
  const [drafts, setDrafts] = React.useState<TermDraft[]>(() => draftFromYear(year));
  const today = localTodayKey();
  const invalidateSchedule = useAdminScheduleInvalidate();
  const queryClient = useQueryClient();
  const dock = useDock();

  const patchTerm = (termId: string, patch: Partial<Pick<TermDraft, "startDate" | "endDate">>) => {
    setDrafts((prev) => prev.map((d) => (d.termId === termId ? { ...d, ...patch } : d)));
  };

  // Same rules the API enforces, so the admin sees them before submitting.
  const problems = React.useMemo(() => {
    const map = new Map<string, string>();
    const ordered = [...drafts].sort((a, b) => a.termNumber - b.termNumber);
    for (const d of ordered) {
      if (!d.startDate || !d.endDate) {
        map.set(d.termId, "Both dates are required.");
        continue;
      }
      if (d.endDate <= d.startDate) {
        map.set(d.termId, "The end date must be after the start date.");
        continue;
      }
      if (d.startDate < today && d.startDate !== d.storedStart) {
        map.set(d.termId, "A term cannot start in the past.");
        continue;
      }
      if (d.endDate < today && d.endDate !== d.storedEnd) {
        map.set(d.termId, "A term cannot end in the past.");
      }
    }
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const next = ordered[i];
      if (map.has(prev.termId) || map.has(next.termId)) continue;
      if (next.startDate < prev.endDate) {
        map.set(
          next.termId,
          `Term ${next.termNumber} must not start before Term ${prev.termNumber} ends.`,
        );
      }
    }
    return map;
  }, [drafts, today]);

  const create = useMutation({
    mutationFn: async (vars: {
      taskId: string;
      payload: { terms: Array<{ termId: string; startDate: string; endDate: string }> };
    }) => {
      const { data } = await apiClient.patch<{
        schoolYearId: string;
        name: string;
        terms: Array<{ id: string; termNumber: number; startDate: string; endDate: string }>;
      }>(`/api/admin/schedule/school-years/${year.id}/terms`, vars.payload);
      return data;
    },
    onSuccess: (data, vars) => {
      dock.updateTask(vars.taskId, {
        title: "Term dates saved",
        description: `${data.name} · terms 1–3`,
      });
      dock.completeTask(vars.taskId);
      invalidateSchedule();
      void queryClient.invalidateQueries({ queryKey: ["term-picker", "school-years"] });
      toast.success({
        title: "Term dates saved",
        description: `${data.name} · pick a term to work on.`,
      });
    },
    onError: (err: unknown, vars) => {
      const message = getErrorMessage(err, "The term dates were not saved.");
      dock.failTask(vars.taskId, message);
      // The optimistic dates are suspect — pull the stored ones back in.
      void queryClient.invalidateQueries({ queryKey: ["term-picker", "school-years"] });
      toast.error({ title: "Could not save the term dates", description: message });
    },
  });

  const canSubmit = create.isPending === false && problems.size === 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmitted?.();
    const payload = {
      terms: drafts.map((d) => ({
        termId: d.termId,
        startDate: d.startDate,
        endDate: d.endDate,
      })),
    };
    const taskId = dock.startTask({
      kind: "term-context",
      title: "Saving term dates",
      description: `${year.name} · terms 1–3`,
    });
    // Instant paint: the board shows the new windows right away.
    queryClient.setQueryData<SchoolYearOption[]>(
      ["term-picker", "school-years"],
      (prev) =>
        prev
          ? prev.map((y) =>
              y.id === year.id
                ? {
                    ...y,
                    terms: y.terms.map((t) => {
                      const next = payload.terms.find((p) => p.termId === t.id);
                      return next ? { ...t, startDate: next.startDate, endDate: next.endDate } : t;
                    }),
                  }
                : y,
            )
          : prev,
    );
    create.mutate({ taskId, payload });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <header className="flex items-start gap-2.5 border-b border-border px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
          aria-hidden
        >
          <CalendarRange size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">
            Term dates · {year.name}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Enter the start and end date of each term. Dates in the past cannot be chosen.
          </p>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close term dates"
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
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
          {drafts.map((d) => {
            const problem = problems.get(d.termId);
            return (
              <div
                key={d.termId}
                className={`rounded-lg border p-2.5 ${
                  problem ? "border-red-500/50 bg-red-500/[0.04]" : "border-border bg-muted/20"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-5 min-w-5 items-center justify-center rounded bg-amber-500/15 px-1 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                    {d.termNumber}
                  </span>
                  <span className="text-[12px] font-medium text-foreground">
                    Term {d.termNumber}
                  </span>
                  {problem ? (
                    <span className="ml-auto text-[12px] text-red-600 dark:text-red-400">
                      {problem}
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TermDateField
                    id={`term-${d.termNumber}-start`}
                    label="Starts"
                    value={d.startDate}
                    min={today}
                    onChange={(startDate) => patchTerm(d.termId, { startDate })}
                  />
                  <TermDateField
                    id={`term-${d.termNumber}-end`}
                    label="Ends"
                    value={d.endDate}
                    min={d.startDate || today}
                    onChange={(endDate) => patchTerm(d.termId, { endDate })}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-[12px] text-muted-foreground">
            School year {fmtDay(year.startDate)} – {fmtDay(year.endDate)}
          </span>
          <Button
            type="submit"
            disabled={!canSubmit}
            aria-busy={create.isPending || undefined}
            className="h-6 gap-1.5 px-2.5 text-[12px]"
          >
            {create.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save term dates"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
