"use client";
import * as React from "react";
import { CheckCircle2, ListChecks } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function SaveAttendanceKanban({
  open,
  saving,
  saveError,
  count,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  saveError: string | null;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  const noun = count === 1 ? "student" : "students";
  return (
    <ConfirmDialog
      title="Save this sheet?"
      description={`Saves the marks you changed for ${count} ${noun}. You can still edit this sheet afterwards.`}
      icon={<ListChecks size={16} aria-hidden />}
      meta={`${count} ${noun}`}
      confirmLabel="Save attendance"
      confirmIcon={<CheckCircle2 size={14} aria-hidden />}
      pendingLabel="Saving…"
      pending={saving}
      onCancel={onClose}
      onConfirm={onConfirm}
    >
      {saveError ? (
        <p role="alert" className="text-[12px] text-destructive">
          {saveError}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
