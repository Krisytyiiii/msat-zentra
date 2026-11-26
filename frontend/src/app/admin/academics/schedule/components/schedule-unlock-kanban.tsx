"use client";

import { CalendarDays, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ScheduleSection } from "../page";

interface Props {
  section: ScheduleSection;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Approved-schedule edit gate. A message-only confirmation — confirming starts
 * a local edit session, it does not rewrite the approved slots. Nothing is
 * unpublished until the admin actually saves a change, so an abandoned edit
 * leaves the published grid untouched.
 */
export function ScheduleUnlockConfirm({ section, onCancel, onConfirm }: Props) {
  return (
    <ConfirmDialog
      tone="primary"
      title={`Edit ${section.name}'s approved schedule?`}
      description="Nothing changes yet. These slots stay approved while you edit — they only go back to draft when you save a change."
      icon={<CalendarDays size={16} />}
      cancelLabel="Keep approved"
      confirmLabel="Start editing"
      confirmIcon={<Pencil size={13} />}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
