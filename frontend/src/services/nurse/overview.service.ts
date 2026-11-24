import { apiClient } from "@/lib/api/client";
import { toQueueRow } from "./labels";
import type { NurseOverviewData, RawReferral } from "./nurse.types";

/**
 * The clinic overview is one server-computed payload: aggregates over the
 * whole term scope plus the two short case lists the page renders (5 latest
 * + 8 longest-waiting). Only those list rows carry case detail — the old
 * implementation downloaded the first referral-queue page (attachments and
 * all) and computed every number from it.
 */
type NurseOverviewPayload = Omit<
  NurseOverviewData,
  "latestReferrals" | "needsReview"
> & {
  latestReferrals: RawReferral[];
  needsReview: RawReferral[];
};

export async function fetchNurseOverview(
  signal?: AbortSignal,
): Promise<NurseOverviewData> {
  const { data } = await apiClient.get<NurseOverviewPayload>(
    "/api/nurse/overview",
    { signal },
  );
  return {
    kpis: data.kpis,
    statusBreakdown: data.statusBreakdown ?? [],
    clinicStatusBreakdown: data.clinicStatusBreakdown ?? [],
    admStatusBreakdown: data.admStatusBreakdown ?? [],
    dailyTrend: data.dailyTrend ?? [],
    latestReferrals: (data.latestReferrals ?? []).map(toQueueRow),
    needsReview: (data.needsReview ?? []).map(toQueueRow),
  };
}
