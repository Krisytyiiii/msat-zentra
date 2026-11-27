import type { VerificationRecord } from "@/services/teacher/sf10Access.service";

/**
 * One row on the SF10 access desk: a granted/owned learner with a filed SF10,
 * or an advisee the registry desk reports as missing (`record` null).
 */
export interface Sf10DeskRow {
  lrn: string;
  name: string;
  mascot: string | null;
  gradeLevel: string;
  section: string;
  sectionId: string;
  record: VerificationRecord | null;
  sf10Status: "verified" | "validated" | "pending";
  grantedTermNumber: number | null;
  approved: boolean;
  missing: boolean;
}

export function fileExtOf(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  } catch {
    return url.split("?")[0].split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  }
}
