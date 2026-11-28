"use client";

import type { GuidanceReferralItem } from "@/services/guidance/guidance.types";
import { isWithdrawn } from "../referrals/components/guidance-referrals-format";

export {
  ReferralSessionButtons,
  type ReferralSessionDialogKey,
} from "@/components/desk-alerts/session-buttons";

/**
 * Whether a referral still takes session changes: an ADM case only while it
 * sits on the ADM queue (pending), a counseling case until it is closed.
 */
export function referralSessionsManageable(row: GuidanceReferralItem): boolean {
  if (isWithdrawn(row)) return false;
  if (row.type === "ADM") return row.status === "pending";
  return row.status !== "resolved" && row.status !== "dismissed";
}
