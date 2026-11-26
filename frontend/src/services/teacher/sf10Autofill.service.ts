"use client";

import { useLiveQuery } from "@/lib/api/live";
import { apiClient } from "@/lib/api/client";

export interface AutofillCandidate {
  lrn: string;
  name: string;
  mascot: string | null;
  gradeLevel: string;
  section: string;
  recordId: string | null;
  recordStatus: string | null;
  currentVersion: number | null;
  subjectsReady: number;
  subjectsSkipped: number;
  ready: boolean;
  templateReady: boolean;
  reason: string | null;
}

export interface AutofillRow {
  subject: string;
  norm: string;
  rating: number;
  quarters: Array<number | null>;
  remarks: "PASSED" | "FAILED";
}

export interface AutofillSkip {
  subject: string;
  terms: number;
  reason: string;
}

export interface AutofillPreviewStudent extends AutofillCandidate {
  rows: AutofillRow[];
  skipped: AutofillSkip[];
}

export interface AutofillPreview {
  sectionId: string;
  section: string;
  gradeLevel: string;
  schoolYear: { id: string; name: string };
  students: AutofillPreviewStudent[];
}

export interface AutofillResultRow {
  lrn: string;
  name: string;
  status: "updated" | "skipped" | "failed";
  recordId: string | null;
  version: number | null;
  added: number;
  replaced: number;
  message: string;
}

export interface AutofillResult {
  sectionId: string;
  section: string;
  updated: number;
  skipped: number;
  failed: number;
  results: AutofillResultRow[];
}

export async function fetchAutofillCandidates(sectionId: string): Promise<AutofillCandidate[]> {
  const { data } = await apiClient.get<{ candidates: AutofillCandidate[] }>(
    "/api/teacher/advisory/sf10-autofill/candidates",
    { params: { sectionId } },
  );
  return data.candidates;
}

export async function fetchAutofillPreview(
  sectionId: string,
  studentLrns: string[],
): Promise<AutofillPreview> {
  const { data } = await apiClient.get<AutofillPreview>(
    "/api/teacher/advisory/sf10-autofill/preview",
    { params: { sectionId, studentLrns: studentLrns.join(",") } },
  );
  return data;
}

export async function runAutofill(payload: {
  sectionId: string;
  studentLrns: string[];
}): Promise<AutofillResult> {
  const { data } = await apiClient.post<AutofillResult>(
    "/api/teacher/advisory/sf10-autofill",
    payload,
  );
  return data;
}

/**
 * Download the SF10 built from the school template for one advisee (JHS book
 * for Grades 7–10, Strengthened SHS book for 11–12). The request writes the
 * rendered file onto the learner's SF10 record, so the caller should refresh the
 * records queries afterwards.
 */
export async function downloadSf10Template(
  sectionId: string,
  lrn: string,
  format: "xlsx" | "pdf",
): Promise<void> {
  const response = await apiClient.get<Blob>(
    `/api/teacher/advisory/sf10-template/${encodeURIComponent(lrn)}`,
    { params: { sectionId, format }, responseType: "blob" },
  );
  const blob = response.data;
  const disposition = String(response.headers?.["content-disposition"] ?? "");
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1]?.trim() || `SF10-${lrn}.${format}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function useAutofillCandidates(sectionId: string | null, enabled = true) {
  return useLiveQuery<AutofillCandidate[]>({
    queryKey: ["teacher-sf10-autofill", "candidates", sectionId ?? ""],
    queryFn: () => fetchAutofillCandidates(sectionId as string),
    enabled: enabled && !!sectionId,
    staleTime: 30_000,
  });
}

export function useAutofillPreview(
  sectionId: string | null,
  studentLrns: string[],
  enabled = true,
) {
  const key = studentLrns.slice().sort().join(",");
  return useLiveQuery<AutofillPreview>({
    queryKey: ["teacher-sf10-autofill", "preview", sectionId ?? "", key],
    queryFn: () => fetchAutofillPreview(sectionId as string, studentLrns),
    enabled: enabled && !!sectionId && studentLrns.length > 0,
    staleTime: 30_000,
  });
}
