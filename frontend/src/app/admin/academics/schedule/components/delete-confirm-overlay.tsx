"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Confirmation for the template desk's destructive actions (section, school
 * year, staged slots). Same dialog as every other confirm, tinted red so the
 * consequence never reads like a save. Message-only: title + consequence +
 * the two actions.
 */
export function DeleteConfirmOverlay({
  title,
  description,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      tone="danger"
      title={title}
      description={description}
      icon={<Trash2 size={16} />}
      cancelLabel="Keep"
      confirmLabel={confirmLabel}
      confirmIcon={<Trash2 size={13} />}
      pendingLabel="Removing…"
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
