"use client";
import * as React from "react";
import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { GcForm03PreviewDialog } from "@/app/guidance/adm/components/GcForm03PreviewDialog";
import type { GcForm03Data } from "@/services/guidance/gcform03.types";

/**
 * The endorsed-referral banner inside the shared case drawer (guidance and
 * nurse alert desks). Each desk only supplies the learner name and a loader
 * that builds the GCForm-03 in its own data shape; the banner chrome and
 * preview overlay stay identical.
 *
 * `initial` is optional fast data the desk already has (guidance seeds it from
 * the queue row); `load` refines it — or is the only source when omitted.
 */
export function GcFormBanner({
  student,
  initial,
  load,
  raised = false,
}: {
  student: string;
  initial?: GcForm03Data | null;
  load: () => Promise<GcForm03Data | null> | GcForm03Data | null;
  /** Opened from inside a drawer — paint the preview above it. */
  raised?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<GcForm03Data | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function openForm() {
    if (loading) return;
    setOpen(true);
    if (data) return;
    if (initial) setData(initial);
    setLoading(true);
    try {
      const next = await load();
      if (next) setData(next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openForm()}
        disabled={loading}
        aria-label={`Open the GCForm-03 referral form for ${student}`}
        className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <FileText className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-foreground">
            GCForm-03 — Referral form
          </span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {loading
              ? "Preparing the form…"
              : "Click to open the endorsed referral form"}
          </span>
        </span>
        {loading ? (
          <Loader2
            className="size-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </button>
      {open && data ? (
        <GcForm03PreviewDialog
          open
          data={data}
          confirming={false}
          onClose={() => setOpen(false)}
          onConfirm={() => {}}
          viewOnly
          raised={raised}
        />
      ) : null}
    </>
  );
}
