"use client";

import { CalendarCheck, Check } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ScheduleConfigPreset } from "./use-schedule-catalog";

/**
 * Confirmation shown when a configuration card (or its select circle) is
 * clicked. Switching the day shape is retrospective — it re-times every term's
 * timetable for the school year — so the admin confirms before the preset
 * becomes the live one. Message-only, like every other confirm.
 */
export function ApplyConfigOverlay({
  preset,
  yearName,
  pending,
  onCancel,
  onConfirm,
}: {
  preset: ScheduleConfigPreset;
  yearName: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      tone="primary"
      title={`Use ${preset.name}?`}
      description={`This becomes the school day for ${yearName}. Every term and section timetable of that school year follows it — published slots keep their subjects and teachers, but class times shift to the new start, lesson length, lunch and breaks.`}
      icon={<CalendarCheck size={16} />}
      cancelLabel="Keep current"
      confirmLabel="Use this configuration"
      confirmIcon={<Check size={13} />}
      pendingLabel="Applying…"
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
