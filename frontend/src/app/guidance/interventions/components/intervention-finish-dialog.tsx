"use client";

import {
  FinishSessionDialog as SharedFinishSessionDialog,
  type FinishSessionFields,
} from "@/components/session-booking/FinishSessionDialog";
import { SESSION_KIND_OPTIONS, sessionTypeLabel } from "@/lib/labels/sessions";
import type { CounselingSessionItem } from "@/services/guidance/interventions.types";
import { formatDateTime } from "../../referrals/components/guidance-referrals-format";

/**
 * Interventions desk wrapper for the one shared "Mark session done" overlay.
 * The referral desks already render `FinishSessionDialog`; routing this through
 * the same component keeps the dialog identical on every guidance page (and it
 * is intentionally not time-gated — a booking can be closed before its slot).
 */
export function InterventionFinishDialog({
  open,
  onClose,
  activeSession,
  isActionPending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  activeSession: CounselingSessionItem | null;
  /** Kept for the callers' shared prop shape; the overlay no longer gates. */
  now: number;
  isActionPending: boolean;
  onSubmit: (fields: FinishSessionFields) => void;
}) {
  if (!open) return null;
  return (
    <SharedFinishSessionDialog
      open
      onClose={onClose}
      onSubmit={onSubmit}
      description={
        activeSession
          ? undefined
          : "Record what happened in this session."
      }
      sessionMeta={
        activeSession
          ? {
              type: sessionTypeLabel(activeSession.sessionType),
              when: formatDateTime(activeSession.scheduledAt),
              ...(activeSession.venue ? { venue: activeSession.venue } : {}),
            }
          : undefined
      }
      followUpTitle="Book a follow-up session (optional)"
      followUpHint="If this needs another talk, book it now so it stays on the plan."
      followUpDateLabel="Follow-up date"
      followUpTimeLabel="Follow-up time"
      venuePlaceholder="e.g. Guidance office"
      showSessionType
      sessionTypeOptions={SESSION_KIND_OPTIONS}
      busy={isActionPending}
      idPrefix="iv-done"
    />
  );
}
