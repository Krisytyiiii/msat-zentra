"use client";

import { createPortal } from "react-dom";
import { Loader2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";

/**
 * Shared confirm overlay for the template desk's destructive actions (section,
 * school year). Same shell as the subject delete dialog: portaled to <body> so
 * transformed / overflow-hidden board ancestors can never clip it.
 */
export function DeleteConfirmOverlay({
  title,
  description,
  detail,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  /** Optional highlighted line (the locked reason or what will be removed). */
  detail?: string | null;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 dark:bg-black/70"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div className="w-full max-w-lg min-w-0" onClick={(event) => event.stopPropagation()}>
        <KanbanBoard
          title={title}
          icon={
            <span className="text-red-500" aria-hidden>
              <Trash2 size={14} />
            </span>
          }
          description={description}
          className="bg-card text-card-foreground shadow-2xl"
          footer={
            <div className="flex justify-end gap-1.5 px-1 pb-1">
              <Button
                onClick={onCancel}
                disabled={pending}
                variant="outline"
                className="h-6 gap-1 px-2 text-[12px]"
              >
                <Undo2 size={12} aria-hidden />
                Keep
              </Button>
              <Button
                onClick={onConfirm}
                disabled={pending}
                aria-busy={pending || undefined}
                className="h-6 gap-1 border-transparent bg-red-600 px-2 text-[12px] text-white hover:bg-red-700 hover:text-white dark:border-transparent dark:bg-red-600 dark:text-white dark:hover:bg-red-700 dark:hover:text-white"
              >
                {pending ? (
                  <>
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    <span aria-live="polite">Deleting…</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={12} aria-hidden />
                    {confirmLabel}
                  </>
                )}
              </Button>
            </div>
          }
        >
          {detail ? (
            <p className="px-1 pb-1 text-[12px] text-muted-foreground">{detail}</p>
          ) : null}
        </KanbanBoard>
      </div>
    </div>,
    document.body,
  );
}
