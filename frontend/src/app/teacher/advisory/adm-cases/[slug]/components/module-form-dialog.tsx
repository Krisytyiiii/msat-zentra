"use client";

import * as React from "react";
import { format } from "date-fns";
import { BookOpen, CalendarDays, CalendarIcon, Check, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  AdmModulePayload,
  AdmMonitoredModule,
} from "@/services/teacher/admMonitoring.service";

/** Local-midnight ISO for a picked day, matching what the API stores. */
const toIso = (value: Date | undefined) =>
  value ? new Date(`${format(value, "yyyy-MM-dd")}T00:00:00`).toISOString() : null;

const fromIso = (iso: string | null) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function ModuleFormDialog({
  module,
  pending,
  onClose,
  onSubmit,
}: {
  /** The case module being edited. New modules are released from the advisory Modules desk. */
  module: AdmMonitoredModule;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: AdmModulePayload) => void;
}) {
  const [moduleName, setModuleName] = React.useState(module?.moduleName ?? "");
  const [dueDate, setDueDate] = React.useState<Date | undefined>(
    fromIso(module?.dueDate ?? null)
  );
  const [dueOpen, setDueOpen] = React.useState(false);
  const [submissionUrl, setSubmissionUrl] = React.useState(module?.submissionUrl ?? "");
  const [submitted, setSubmitted] = React.useState(module?.submitted ?? false);
  const releasedOn = fromIso(module?.releaseDate ?? null);

  const canSubmit = moduleName.trim().length > 0 && !pending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      moduleName: moduleName.trim(),
      dueDate: toIso(dueDate),
      // Where the adviser uploaded the module for the learner.
      submissionUrl: submissionUrl.trim() ? submissionUrl.trim() : null,
      // The student hands in the answered module; the adviser records it.
      submitted,
    });
  };

  const statusMeta = module?.submitted
    ? { label: "Submitted", tone: "green" as const }
    : module?.status === "overdue"
      ? { label: "Overdue", tone: "red" as const }
      : { label: "Pending", tone: "amber" as const };

  return (
    <KanbanOverlay
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissable={!pending}
      title="Edit module"
      ariaLabel="Edit module"
      icon={
        <span
          className="flex size-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400"
          aria-hidden
        >
          <BookOpen size={14} />
        </span>
      }
      headerActions={
        <Pill tone={statusMeta.tone} label="Module status">
          {statusMeta.label}
        </Pill>
      }
      description="Update the module details, its link, and the learner's submission."
      width="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2 px-0.5 pb-0.5">
          <p className="m-0 text-[12px] text-muted-foreground">
            Changes apply to this ADM case only.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              className="gap-1.5"
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-busy={pending || undefined}
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Check size={14} aria-hidden />
              )}
              Save changes
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Module identity + release stamp */}
        <section
          className="flex flex-col gap-2 rounded-md border bg-background/60 p-3"
          aria-label="Module details"
        >
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="module-name">Module name</Label>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {moduleName.length}/120
            </span>
          </div>
          <div className="relative">
            <BookOpen
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="module-name"
              className="pl-8"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="e.g. Module 1 · Reading Comprehension"
              maxLength={120}
              autoFocus
            />
          </div>
          <p className="m-0 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <CalendarDays size={11} className="shrink-0" aria-hidden />
            {releasedOn
              ? `Released ${format(releasedOn, "MMM d, yyyy")} — set automatically on upload.`
              : "Release date is set automatically once the module is uploaded."}
          </p>
        </section>

        {/* Schedule + where the module lives */}
        <section
          className="flex flex-col divide-y rounded-md border bg-background/60"
          aria-label="Schedule and link"
        >
          <div className="flex flex-col gap-1.5 p-3">
            <Label htmlFor="module-due">Due date (optional)</Label>
            <Popover open={dueOpen} onOpenChange={setDueOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  id="module-due"
                  variant="outline"
                  aria-label="Module due date"
                  className={cn(
                    "w-full justify-start gap-2 text-left font-normal",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon size={14} aria-hidden />
                  {dueDate ? format(dueDate, "MMM d, yyyy") : "No due date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  defaultMonth={dueDate}
                  onSelect={(day) => {
                    setDueDate(day);
                    setDueOpen(false);
                  }}
                />
                {dueDate ? (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center text-xs"
                      onClick={() => {
                        setDueDate(undefined);
                        setDueOpen(false);
                      }}
                    >
                      Clear due date
                    </Button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
            <p className="m-0 text-[12px] text-muted-foreground">
              Optional — leave empty when the module has no deadline.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 p-3">
            <Label htmlFor="module-url">Module link (Google Drive)</Label>
            <div className="relative">
              <Link2
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="module-url"
                className="pl-8"
                type="url"
                inputMode="url"
                value={submissionUrl}
                onChange={(e) => setSubmissionUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
              />
            </div>
            <p className="m-0 text-[12px] text-muted-foreground">
              Where the module is posted for the learner. Saving a link releases the module today.
            </p>
          </div>
        </section>

        {/* Submission state */}
        <label
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors duration-150",
            submitted
              ? "border-emerald-500/40 bg-emerald-500/[0.06]"
              : "bg-background/60 hover:border-foreground/20",
            pending && "pointer-events-none opacity-60"
          )}
          onClick={(event) => {
            if (pending) return;
            // The Radix checkbox toggles itself; every other click on the card
            // toggles too, so the whole row is a hit target.
            if ((event.target as HTMLElement).closest('[data-slot="checkbox"]')) return;
            event.preventDefault();
            setSubmitted((value) => !value);
          }}
        >
          <Checkbox
            checked={submitted}
            disabled={pending}
            onCheckedChange={(value) => setSubmitted(value === true)}
            className="mt-0.5"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">
              Learner submitted the answered module
            </span>
            <span className="text-[12px] text-muted-foreground">
              {submitted
                ? "Recorded as submitted — uncheck if it still needs to be handed in."
                : "Tick once the answered work is handed in; the submission date is recorded."}
            </span>
          </span>
        </label>
      </div>
    </KanbanOverlay>
  );
}
