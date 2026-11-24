import { apiClient } from "@/lib/api/client";
import type {
  NurseRiskFactors,
  NurseRiskLevel,
  RawReferral,
} from "./nurse.types";

export interface NurseReportsPayload {
  referrals: RawReferral[];
  riskLevels: Record<string, NurseRiskLevel>;
  riskFactors: Record<string, NurseRiskFactors>;
}

/**
 * One request for the whole reports page: every case on the term's nurse desk
 * (narrow projection, no attachments) plus the risk levels/factors of the
 * learners involved. The backend builds it from the term scope directly, so
 * the charts are never computed from a single page of the queue.
 */
export async function fetchNurseReports(
  signal?: AbortSignal,
): Promise<NurseReportsPayload> {
  const { data } = await apiClient.get<NurseReportsPayload>(
    "/api/nurse/reports",
    { signal },
  );
  return {
    referrals: Array.isArray(data?.referrals) ? data.referrals : [],
    riskLevels: data?.riskLevels ?? {},
    riskFactors: data?.riskFactors ?? {},
  };
}
