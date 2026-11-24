"use client";
import * as React from "react";
import { CheckCircle2, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill, type PillTone } from "@/components/ui/pill";

const STATUS_TONE: Record<
  "present" | "absent" | "late" | "excused",
  { tone: PillTone; label: string }
> = {
  present: { tone: "green", label: "Present" },
  absent: { tone: "red", label: "Absent" },
  late: { tone: "amber", label: "Late" },
  excused: { tone: "blue", label: "Excused" },
};

export function SaveAttendanceKanban({
  open,
  saving,
  saveError,
  count,
  breakdown,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  saveError: string | null;
  count: number;
  breakdown: { status: "present" | "absent" | "late" | "excused"; count: number }[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  const noun = count === 1 ? "student" : "students";
  return (
    <SaveConfirmOverlay onClose={onClose} locked={saving}>
      <KanbanBoard
        className="bg-card shadow-2xl"
        title="Save this sheet?"
        icon={
          <span className="text-amber-500" aria-hidden>
            <ListChecks size={14} />
          </span>
        }
        actions={
          <Pill tone="amber" label="Students to save">
            {count} {noun}
          </Pill>
        }
        description={
          saving
            ? `Saving the marks for ${count} ${noun} — this only takes a moment.`
            : `Saves the marks you changed for ${count} ${noun}. You can still edit this sheet afterwards.`
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-1 pt-2 pb-1">
            <span className="text-[12px] text-muted-foreground">
              Press Esc or click outside to close
            </span>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={saving}
              autoFocus
              aria-busy={saving || undefined}
              className="h-6 gap-1.5 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  <span aria-live="polite">Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} aria-hidden />
                  Save attendance
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 px-1 py-2">
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5 dark:bg-transparent"
            aria-label="Attendance breakdown"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-amber-500">
              <ListChecks size={15} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground">
                {count} {noun} to submit
              </span>
              <span className="text-[12px] text-muted-foreground">
                Only the marks you changed are sent.
              </span>
            </span>
          </div>

          {breakdown.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {breakdown.map((item) => {
                const status = STATUS_TONE[item.status];
                return (
                  <Pill
                    key={item.status}
                    tone={status.tone}
                    label={`${status.label} — ${item.count} of ${count}`}
                  >
                    {item.count} {status.label.toLowerCase()}
                  </Pill>
                );
              })}
            </div>
          ) : null}

          {saveError ? (
            <p role="alert" className="text-[12px] text-destructive">
              {saveError}
            </p>
          ) : (
            <p className="text-[12px] leading-snug text-muted-foreground">
              Make sure every learner&apos;s status looks right before saving — this
              sheet can still be corrected later while it stays open.
            </p>
          )}
        </div>
      </KanbanBoard>
    </SaveConfirmOverlay>
  );
}

function SaveConfirmOverlay({
  children,
  onClose,
  locked,
}: {
  children: React.ReactNode;
  onClose: () => void;
  locked: boolean;
}) {
  React.useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save attendance sheet"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          if (!locked) onClose();
        }}
        disabled={locked}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
