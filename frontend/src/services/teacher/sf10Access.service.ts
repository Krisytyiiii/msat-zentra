"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

/**
 * The SF10 desk is a live board: a registry decision, a missing answer or a
 * filed auto-fill render can land while the adviser is reading it. The realtime
 * channel already invalidates these keys the instant a matching notification
 * arrives; this poll is the safety net for writes that emit no notification
 * (a registry desk uploading the missing form, another session's auto-fill), so
 * the card list and the drawer never need a manual reload.
 *
 * Faster than the shared 60s teacher cadence on purpose: this desk has a small
 * fixed set of queries (requests + own records + one verification per request)
 * and its whole point is watching registry work complete.
 */
const SF10_LIVE_REFETCH_MS = 15_000;

const sf10LiveOptions = {
  refetchInterval: SF10_LIVE_REFETCH_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

export type AccessStatus = "pending" | "approved" | "denied";

export interface MyAccessRequest {
  id: string;
  sectionId: string;
  section: string;
  gradeLevel: string;
  reason: string;
  requestedLrns: string[];
  status: AccessStatus;
  decisionReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  /** Term the request was filed in (null when term dates are missing). */
  termNumber: number | null;
  total: number;
  has: number;
  missing: number;
}

export interface VerificationRecord {
  id: string;
  source: string;
  status: string;
  fileUrl: string | null;
  verifiedAt: string | null;
  validatedAt: string | null;
  currentVersion: number;
  /** Most recent Bama auto-fill render, kept separate from the original file. */
  autoFill: { fileUrl: string; version: number; at: string | null } | null;
}

export interface HasRow {
  lrn: string;
  name: string;
  /** Persisted sprite mascot (StudentMascot pool); null falls back to the derived one. */
  mascot: string | null;
  hasAccount: boolean;
  gradeLevel: string;
  section: string;
  /** Advisory section the grant belongs to — the template endpoint needs it. */
  sectionId: string;
  sf10Status: "verified" | "validated" | "pending";
  /** Per-student grant (whole-request approval grants every row). */
  approved: boolean;
  /** ISO timestamp of the per-student grant, if granted individually. */
  approvedAt?: string | null;
  /** Term the SF10 access was granted in — shared across the school year. */
  grantedTermNumber?: number | null;
  record: VerificationRecord | null;
}

export interface Sf10HistorySubject {
  subject: string;
  quarters: Array<number | null>;
  rating: number | null;
  remarks: string | null;
}

export interface Sf10HistoryVersion {
  versionNumber: number;
  at: string;
  reason: string;
  /** Public render of this version (kept separate from the uploaded original). */
  fileUrl: string | null;
  subjectCount: number;
  subjects: Sf10HistorySubject[];
}

export interface Sf10History {
  lrn: string;
  name: string;
  gradeLevel: string;
  section: string;
  sectionId: string;
  recordId: string | null;
  status: string;
  currentVersion: number | null;
  originalFileUrl: string | null;
  versions: Sf10HistoryVersion[];
}

export interface MissingRow {
  lrn: string;
  name: string;
  /** Persisted sprite mascot (StudentMascot pool); null falls back to the derived one. */
  mascot: string | null;
  hasAccount: boolean;
  gradeLevel: string;
  section: string;
}

export interface VerificationResult {
  requestId: string;
  section: string;
  gradeLevel: string;
  status: string;
  requestedLrns: string[];
  canDownload: boolean;
  canEdit: boolean;
  summary: { total: number; has: number; missing: number };
  hasSf10: HasRow[];
  missingSf10: MissingRow[];
}

export async function fetchMyAccessRequests(): Promise<MyAccessRequest[]> {
  const { data } = await apiClient.get<{ requests: MyAccessRequest[] }>(
    "/api/teacher/advisory/sf10-access-requests",
  );
  return data.requests;
}

export async function createAccessRequest(payload: {
  sectionId: string;
  reason: string;
  studentLrns?: string[];
}): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post<{ id: string; status: string }>(
    "/api/teacher/advisory/sf10-access-requests",
    payload,
  );
  return data;
}

export async function fetchMyVerification(requestId: string): Promise<VerificationResult> {
  const { data } = await apiClient.get<VerificationResult>(
    `/api/teacher/advisory/sf10-access-requests/${requestId}/records`,
  );
  return data;
}

export function useMyAccessRequests(enabled = true) {
  return useQuery<MyAccessRequest[]>({
    ...sf10LiveOptions,
    queryKey: ["teacher-sf10-access"],
    queryFn: fetchMyAccessRequests,
    enabled,
    staleTime: 0,
  });
}

export function useMyVerification(requestId: string | null) {
  return useQuery<VerificationResult>({
    ...sf10LiveOptions,
    queryKey: ["teacher-sf10-access", requestId, "records"],
    queryFn: () => fetchMyVerification(requestId as string),
    enabled: !!requestId,
    staleTime: 0,
  });
}

/**
 * One live verification query per access request (the desk merges them into a
 * single learner list). Same 15s cadence as the rest of the desk so a decision
 * taken on the registry side shows up without a reload.
 */
export function useSf10Verifications(requestIds: readonly string[]) {
  return useQueries({
    queries: requestIds.map((id) => ({
      ...sf10LiveOptions,
      queryKey: ["teacher-sf10-access", id, "records"],
      queryFn: () => fetchMyVerification(id),
      staleTime: 0,
    })),
  });
}

/**
 * Grade-7 and Grade-11 records the adviser's own desk owns: G7 enrolment opens
 * the first SF10 and G11 anchors the SHS form, so auto-fill needs no registry
 * grant and this desk lists them without an approved access request. Every
 * other grade stays behind the request flow.
 */
export async function fetchMyFirstSf10Records(): Promise<HasRow[]> {
  const { data } = await apiClient.get<{ hasSf10: HasRow[] }>(
    "/api/teacher/advisory/sf10-access/own-records",
  );
  return data.hasSf10;
}

export function useMyFirstSf10Records() {
  return useQuery<HasRow[]>({
    ...sf10LiveOptions,
    queryKey: ["teacher-sf10-access", "own-records"],
    queryFn: fetchMyFirstSf10Records,
    staleTime: 0,
  });
}

/** Every Bama auto-fill render filed on one advisee's SF10, newest first. */
export async function fetchSf10History(
  sectionId: string,
  lrn: string,
): Promise<Sf10History> {
  const { data } = await apiClient.get<Sf10History>(
    `/api/teacher/advisory/sf10-access/records/${encodeURIComponent(lrn)}/history`,
    { params: { sectionId } },
  );
  return data;
}

export function useSf10History(sectionId: string | null, lrn: string | null) {
  return useQuery<Sf10History>({
    ...sf10LiveOptions,
    queryKey: ["teacher-sf10-access", "history", sectionId ?? "", lrn ?? ""],
    queryFn: () => fetchSf10History(sectionId as string, lrn as string),
    enabled: !!sectionId && !!lrn,
    staleTime: 0,
  });
}
