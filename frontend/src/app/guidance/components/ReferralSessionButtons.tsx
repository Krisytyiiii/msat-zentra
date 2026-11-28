"use client";

import { Button } from "@/components/ui/button";
import type { CaseDetailSession } from "./GuidanceCaseDetailDialog";
import type { GuidanceReferralItem } from "@/services/guidance/guidance.types";
import { isWithdrawn } from "../referrals/components/guidance-referrals-format";

export type ReferralSessionDialogKey =
  | "finish"
  | "move"
  | "cancelSess"
  | "deleteSess";

/**
 * Whether a referral still takes session changes: an ADM case only while it
 * sits on the ADM queue (pending), a counseling case until it is closed.
 */
export function referralSessionsManageable(row: GuidanceReferralItem): boolean {
  if (isWithdrawn(row)) return false;
  if (row.type === "ADM") return row.status === "pending";
  return row.status !== "resolved" && row.status !== "dismissed";
}

/**
 * The one per-session action set inside the shared case drawer. Used by the
 * ADM/counseling data list and the alerts board so both desks behave the same:
 * reschedule, cancel, mark done and docs. "Mark done" is deliberately not
 * time-gated — a booking can be closed before its slot, and doing so marks
 * that same booking done.
 */
export function ReferralSessionButtons({
  session,
  manageable,
  actionPending,
  onSession,
  onDocs,
}: {
  session: CaseDetailSession;
  manageable: boolean;
  actionPending: boolean;
  onSession: (dialog: ReferralSessionDialogKey) => void;
  onDocs: () => void;
}) {
  // A finished session keeps its documentation available at any time, even
  // after the case closes.
  if (session.status === "completed") {
    return (
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-6 px-2 text-[12px]"
        onClick={onDocs}
      >
        Docs
      </Button>
    );
  }

  if (!manageable) return null;

  if (session.status === "cancelled") {
    return (
      <Button
        type="button"
        size="xs"
        variant="destructive"
        className="h-6 px-2 text-[12px]"
        disabled={actionPending}
        onClick={() => onSession("deleteSess")}
      >
        Delete
      </Button>
    );
  }

  if (session.status !== "scheduled") return null;

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-6 px-2 text-[12px]"
        disabled={actionPending}
        onClick={() => onSession("move")}
      >
        Reschedule
      </Button>
      <Button
        type="button"
        size="xs"
        variant="destructive"
        className="h-6 px-2 text-[12px]"
        disabled={actionPending}
        onClick={() => onSession("cancelSess")}
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="xs"
        className="h-6 px-2 text-[12px]"
        disabled={actionPending}
        title="Record what happened and mark this booking done — works even before the scheduled time"
        onClick={() => onSession("finish")}
      >
        Mark done
      </Button>
    </>
  );
}
