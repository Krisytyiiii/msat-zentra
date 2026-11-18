"use client";

import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sf10DetailContent,
  Sf10MetaToggles,
} from "@/components/registry/sf10/Sf10DetailView";
import styles from "./sf10.module.css";

/**
 * SF10 record overlay — the record report opens on top of the board/list
 * instead of navigating (the /{desk}/sf10/{id} route stays as the deep-link
 * fallback). Two-column report body; the dialog clips horizontally so the
 * board never grows a sideways scrollbar, only the vertical report scroll.
 */
export function Sf10RecordOverlay({
  desk,
  recordId,
  onClose,
}: {
  desk: "registrar" | "record-keeper";
  recordId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={recordId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 shadow-none sm:max-w-[72rem]">
        <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 pr-12 pl-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileText size={14} aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-semibold text-foreground">
                SF10 record report
              </DialogTitle>
              <p className="truncate text-[12px] text-muted-foreground">
                {desk === "registrar" ? "Grades 11–12" : "Grades 7–10"} · filed SF10,
                grade-by-grade check, and record actions
              </p>
            </div>
          </div>
          {recordId ? <Sf10MetaToggles desk={desk} id={recordId} /> : null}
        </div>
        <DialogDescription className="sr-only">
          Record report — learner details, grade-by-grade subjects, subjects not taken,
          and record actions.
        </DialogDescription>
        <div
          className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 ${styles.overlayScroll}`}
        >
          {recordId ? <Sf10DetailContent desk={desk} id={recordId} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
