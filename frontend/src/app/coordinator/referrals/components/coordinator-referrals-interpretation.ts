"use client";
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import { friendlyActionType, latestActionFallback } from "@/services/coordinator/labels";
export function isBookableRow(r: AdmCaseRow): boolean {
  if (r.referralStatus === "dismissed" || r.referralStatus === "resolved") return false;
  if (r.id.startsWith("referral:")) return true;
  return r.stage === "meeting_parents";
}
/** The latest audit action on a case, falling back to its milestone dates. */
export function latestUpdateFor(r: AdmCaseRow): { label: string; at: string | null } {
  if (r.lastActionType) {
    return { label: friendlyActionType(r.lastActionType), at: r.lastActionAt ?? null };
  }
  const fb = latestActionFallback(r);
  return fb ? { label: fb.label, at: fb.at } : { label: "—", at: null };
}
export function buildInterpretation(rows: AdmCaseRow[]): string {
  const atMeeting = rows.filter((r) => r.stage === "meeting_parents").length;
  const unbooked = rows.filter((r) => !r.meeting && isBookableRow(r)).length;
  return (
    `${rows.length} case${rows.length === 1 ? "" : "s"} on this page` +
    ` · ${atMeeting} at parent meeting` +
    ` · ${unbooked} bookable without a meeting booked.`
  );
}
