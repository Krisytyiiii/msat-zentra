"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface DeleteSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  keepLabel?: string;
  submitLabel?: string;
  busy?: boolean;
  serverError?: string | null;
}

/**
 * Confirm deleting a cancelled session. Renders the shared message overlay
 * (`ConfirmDialog` → `MessageOverlay`) so it matches every other destructive
 * confirmation: red icon tile, one-sentence consequence, 32px actions.
 *
 * While `busy` the overlay stays up, both actions are disabled and the confirm
 * button shows "Deleting…", so a second click can never fire the same delete
 * twice.
 */
export function DeleteSessionDialog({
  open,
  onClose,
  onConfirm,
  title = "Delete cancelled session?",
  description = "This permanently removes the cancelled session from the list. The case itself stays open. This cannot be undone.",
  keepLabel = "Keep it",
  submitLabel = "Delete session",
  busy = false,
  serverError = null,
}: DeleteSessionDialogProps) {
  if (!open) return null;

  return (
    <ConfirmDialog
      tone="danger"
      title={title}
      description={description}
      icon={<Trash2 size={16} />}
      cancelLabel={keepLabel}
      confirmLabel={submitLabel}
      confirmIcon={<Trash2 size={13} />}
      pendingLabel="Deleting…"
      pending={busy}
      onCancel={onClose}
      onConfirm={onConfirm}
    >
      {serverError ? (
        <p
          role="alert"
          className="m-0 rounded-lg border border-red-500/25 bg-red-500/5 px-2.5 py-2 text-[12px] leading-[1.5] text-red-600 dark:text-red-400"
        >
          {serverError}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
