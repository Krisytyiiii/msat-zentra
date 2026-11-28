"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

/** Endpoint prefix for the administrator-owned account approval queue. */
export const ACCOUNT_APPROVALS_BASE = "/api/admin/account-approvals";

/** Query-key root — every approval mutation invalidates this prefix. */
export const ACCOUNT_APPROVALS_KEY = ["admin", "account-approvals"] as const;

export function useApprovalInvalidation() {
  const qc = useQueryClient();
  return React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ACCOUNT_APPROVALS_KEY });
    void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    void qc.invalidateQueries({ queryKey: ["admin-notifications"] });
  }, [qc]);
}

export function messageOf(err: unknown): string {
  return (
    (err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response
      ?.data?.error?.message ??
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    "Could not process this account. Try again."
  );
}

/**
 * Approve / reject a pending sign-up. Both transitions are administrator-only
 * and live under the admin router; the applicant-facing notifications and the
 * audit trail are unchanged from the old registry desks.
 */
export function approveAccountRequest(id: string): Promise<void> {
  return apiClient.post(`${ACCOUNT_APPROVALS_BASE}/${id}/approve`, {}).then(() => undefined);
}

export function rejectAccountRequest(id: string, reason: string): Promise<void> {
  return apiClient
    .post(`${ACCOUNT_APPROVALS_BASE}/${id}/reject`, { reason })
    .then(() => undefined);
}

export type ApprovalKind = "student" | "parent" | "staff";

export interface PendingApprovalCounts {
  student: number;
  parent: number;
  staff: number;
  total: number;
  /** True while any lane total is still on its first fetch. */
  isLoading: boolean;
}

/**
 * Pending totals per approval lane, for the sidebar sub-nav badge and the
 * lane tabs. Asks for a single row and reads the unfiltered total, so the
 * queue itself is not paged just to render a number.
 */
function usePendingCount(kind: ApprovalKind): { count: number; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: [...ACCOUNT_APPROVALS_KEY, "count", kind],
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<{
        students: unknown[];
        total?: number;
        unfilteredTotal?: number;
      }>(ACCOUNT_APPROVALS_BASE, {
        params: { role: kind, page: 1, pageSize: 1 },
        signal,
      });
      return data.unfilteredTotal ?? data.total ?? data.students.length;
    },
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
  return { count: data ?? 0, isPending };
}

export function usePendingApprovalCounts(): PendingApprovalCounts {
  const student = usePendingCount("student");
  const parent = usePendingCount("parent");
  const staff = usePendingCount("staff");
  return {
    student: student.count,
    parent: parent.count,
    staff: staff.count,
    total: student.count + parent.count + staff.count,
    isLoading: student.isPending || parent.isPending || staff.isPending,
  };
}

/* ---- Guardian learner link requests -------------------------------------- */

export const LINK_REQUESTS_BASE = "/api/admin/link-requests";
export const LINK_REQUESTS_KEY = ["admin", "link-requests"] as const;

export interface AdminLinkRequest {
  id: string;
  relationship: string;
  requestedAt: string;
  parent: { id: string; name: string; email: string };
  student: {
    studentId: string;
    name: string;
    lrn: string;
    gradeLevel: string;
    sectionName: string | null;
  };
}

export interface AdminLinkRequestsResponse {
  data: AdminLinkRequest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function fetchLinkRequests(page: number, pageSize: number, signal?: AbortSignal) {
  return apiClient
    .get<AdminLinkRequestsResponse>(LINK_REQUESTS_BASE, {
      params: { page, pageSize },
      signal,
    })
    .then((res) => res.data);
}

export function approveLinkRequest(id: string): Promise<void> {
  return apiClient.post(`${LINK_REQUESTS_BASE}/${id}/approve`, {}).then(() => undefined);
}

export function rejectLinkRequest(id: string, reason?: string): Promise<void> {
  return apiClient
    .post(`${LINK_REQUESTS_BASE}/${id}/reject`, reason ? { reason } : {})
    .then(() => undefined);
}

