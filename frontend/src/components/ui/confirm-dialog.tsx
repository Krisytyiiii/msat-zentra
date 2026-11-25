"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MessageOverlay, type MessageOverlayTone } from "./message-overlay";

/**
 * The two-action wrapper over `MessageOverlay`: a question, its consequence,
 * and Cancel / Confirm. The confirm button carries the pending state (spinner +
 * "Publishing…" style label), and nothing closes the dialog while it settles.
 *
 * Desk confirmations mount this while their own state says "ask", so there is
 * no `open` prop — rendering it is the question.
 */
export function ConfirmDialog({
  title,
  description,
  icon,
  tone = "primary",
  meta,
  detail,
  children,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmIcon,
  pendingLabel = "Working…",
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  /** One sentence on what happens if they confirm. */
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Extract<MessageOverlayTone, "primary" | "danger">;
  /** Right-aligned chip in the header (counts, scope…). */
  meta?: React.ReactNode;
  /** Highlighted consequence line (what exactly is discarded / affected). */
  detail?: React.ReactNode;
  /** Optional body — the rows this action touches. */
  children?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  confirmIcon?: React.ReactNode;
  pendingLabel?: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <MessageOverlay
      role="alertdialog"
      tone={tone}
      title={title}
      description={description}
      icon={icon}
      meta={meta}
      detail={detail}
      onDismiss={onCancel}
      dismissable={!pending}
      showClose={false}
      footerHint="Esc to cancel"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-[12px]"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            className={cn(
              "h-8 gap-1 px-3 text-[12px]",
              tone === "danger" &&
                "border-transparent bg-red-600 text-white hover:bg-red-700 dark:border-transparent dark:bg-red-600 dark:text-white dark:hover:bg-red-700",
            )}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? (
              <>
                <span
                  className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
                  aria-hidden
                />
                <span aria-live="polite">{pendingLabel}</span>
              </>
            ) : (
              <>
                {confirmIcon}
                {confirmLabel}
              </>
            )}
          </Button>
        </>
      }
    >
      {children}
    </MessageOverlay>
  );
}
