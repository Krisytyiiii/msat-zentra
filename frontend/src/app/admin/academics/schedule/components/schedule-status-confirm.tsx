"use client";

import { createPortal } from "react-dom";
import { Download, Loader2, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { ScrollList } from "@/components/ui/scroll-list";
import { Pill } from "@/components/ui/pill";
import { WEEK_LABELS_FULL, WEEK_LABELS_SHORT } from "@/services/teacher/schedule";
import styles from "@/components/schedule/subject-kanban.module.css";

export type PublishConfirmMode = "publish" | "unpublish";

export interface StatusConfirmSlot {
  day: number;
  period: number;
  subjectName: string;
  teacherName: string;
}

interface Props {
  mode: PublishConfirmMode;
  title: string;
  description: string;
  /** Right-aligned count chip in the board header. */
  countLabel: string;
  /** Pass a slot list to show what is affected; omit for bulk actions. */
  slots?: StatusConfirmSlot[];
  /** Current state of the affected grid, so the slot pills read correctly. */
  published?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Publish / draft confirmation drawn as a Kanban board overlay (same shape
 * as the unlock and catalog confirm boards). The action only runs after the
 * admin confirms, then the overlay closes and the shared Dock reports progress.
 */
export function ScheduleStatusConfirm({
  mode,
  title,
  description,
  countLabel,
  slots,
  published = false,
  pending,
  onCancel,
  onConfirm,
}: Props) {
  const publishing = mode === "publish";

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 dark:bg-black/70"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={pending ? undefined : onCancel}
    >
      <div className="w-full max-w-lg min-w-0" onClick={(e) => e.stopPropagation()}>
        <KanbanBoard
          title={title}
          icon={
            <span className="text-amber-500" aria-hidden>
              {publishing ? <Upload size={14} /> : <Download size={14} />}
            </span>
          }
          count={countLabel}
          description={description}
          className="bg-card font-sans text-card-foreground shadow-2xl"
          footer={
            <div className="flex justify-end gap-1.5 px-1 pb-1">
              <Button
                onClick={onCancel}
                variant="outline"
                disabled={pending}
                className="h-6 gap-1 px-2 font-sans text-[12px]"
              >
                <Undo2 size={12} aria-hidden />
                {publishing ? "Keep as draft" : published ? "Keep published" : "Cancel"}
              </Button>
              <Button
                onClick={onConfirm}
                disabled={pending}
                aria-busy={pending || undefined}
                className="h-6 gap-1 px-2 font-sans text-[12px]"
              >
                {pending ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : publishing ? (
                  <Upload size={12} aria-hidden />
                ) : (
                  <Download size={12} aria-hidden />
                )}
                {publishing ? "Publish" : published ? "Move to draft" : "Save draft"}
              </Button>
            </div>
          }
        >
          {slots ? (
            <ScrollList className="max-h-[40dvh] gap-1.5 px-1" ariaLabel="Timetable slots">
              {slots.map((entry) => (
                <div
                  key={`${entry.day}:${entry.period}`}
                  className={`${styles.card} min-w-0`}
                  aria-label={`${entry.subjectName} — ${WEEK_LABELS_SHORT[entry.day - 1] ?? `Day ${entry.day}`}`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`${styles.name} min-w-0 font-sans`} title={entry.subjectName}>
                      {entry.subjectName}
                    </span>
                    <span className="truncate font-sans text-[12px] text-muted-foreground">
                      {entry.teacherName}
                    </span>
                  </span>
                  <span className={styles.meta}>
                    <Pill
                      tone="neutral"
                      label={`Slot — ${WEEK_LABELS_FULL[entry.day - 1] ?? `Day ${entry.day}`}, Period ${entry.period + 1}`}
                    >
                      {WEEK_LABELS_SHORT[entry.day - 1] ?? `Day ${entry.day}`} · Period{" "}
                      {entry.period + 1}
                    </Pill>
                    <Pill
                      tone={publishing ? "amber" : published ? "green" : "neutral"}
                      label={
                        publishing
                          ? "Goes live when you publish"
                          : published
                            ? "Currently published"
                            : "Working draft — teachers do not see this yet"
                      }
                    >
                      {publishing ? "Draft" : published ? "Published" : "Draft"}
                    </Pill>
                  </span>
                </div>
              ))}
              {slots.length === 0 ? (
                <p className="flex min-h-24 items-center justify-center px-1 py-8 text-center text-xs text-muted-foreground">
                  No slots on this timetable yet.
                </p>
              ) : null}
            </ScrollList>
          ) : null}
        </KanbanBoard>
      </div>
    </div>,
    document.body,
  );
}
