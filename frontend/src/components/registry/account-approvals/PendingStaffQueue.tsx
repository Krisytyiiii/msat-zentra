"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Briefcase, Loader2, X } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import {
  ACCOUNT_APPROVALS_BASE,
  ACCOUNT_APPROVALS_KEY,
  approveAccountRequest,
  messageOf,
  rejectAccountRequest,
  useApprovalInvalidation,
} from "./api";
import {
  PendingQueueSkeleton,
  PendingStaffTable,
  type PendingStaffRow,
} from "./pending-tables";

/**
 * Self-registered teacher accounts awaiting approval. Teachers sign up through
 * `/register/teacher` or the staff Google portal; the administrator owns the
 * queue (the registry desks no longer review sign-ups).
 */

type PendingStaffResponse = {
  students: PendingStaffRow[];
  total?: number;
  page?: number;
};

function fetchPendingStaff(page: number, signal?: AbortSignal): Promise<PendingStaffResponse> {
  return apiClient
    .get<PendingStaffResponse>(ACCOUNT_APPROVALS_BASE, {
      params: { role: "staff", page, pageSize: PAGE_SIZE },
      signal,
    })
    .then((res) => res.data);
}

/** Shared queue total so the users page can badge the pending count. */
export function usePendingStaffTotal(): number {
  const { data } = useQuery({
    queryKey: [...ACCOUNT_APPROVALS_KEY, "staff", 1],
    queryFn: ({ signal }) => fetchPendingStaff(1, signal),
  });
  return data?.total ?? data?.students.length ?? 0;
}

export function PendingStaffQueue({ filterTabs }: { filterTabs?: React.ReactNode }) {
  const invalidate = useApprovalInvalidation();
  const [page, setPage] = React.useState(1);
  const [queryInput, setQueryInput] = React.useState("");
  const [rejectTarget, setRejectTarget] = React.useState<PendingStaffRow | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");

  const { data, isPending, isError } = useQuery({
    queryKey: [...ACCOUNT_APPROVALS_KEY, "staff", page],
    queryFn: ({ signal }) => fetchPendingStaff(page, signal),
  });
  const act = useMutation({
    mutationFn: ({
      id,
      approve,
      reason,
    }: {
      id: string;
      approve: boolean;
      reason?: string;
      name: string;
    }) => (approve ? approveAccountRequest(id) : rejectAccountRequest(id, reason ?? "")),
    onSuccess: (_data, { approve, name }) => {
      toast.success({
        title: approve ? "Approved" : "Rejected",
        description: approve ? `${name} can sign in now.` : `${name}'s request was rejected.`,
      });
    },
    onError: (err) => toast.error({ title: "Action failed", description: messageOf(err) }),
    onSettled: () => {
      invalidate();
    },
  });

  const rows = React.useMemo(() => data?.students ?? [], [data]);
  const total = data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp for display/requests instead of setState-in-effect; the server also
  // clamps out-of-range pages.
  const safePage = Math.min(page, totalPages);

  const visibleRows = React.useMemo(() => {
    const q = queryInput.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q));
  }, [rows, queryInput]);

  return (
    <>
      <KanbanBoard
        title="Pending Teachers"
        icon={<Briefcase size={14} className="text-primary" aria-hidden />}
        description="Self-registered teacher accounts awaiting administrator approval."
        ariaLabel="Pending teacher accounts"
        headerToolbar={
          <>
            {filterTabs}
            <SearchField
              className="w-56"
              placeholder="Search name or email…"
              value={queryInput}
              onChange={setQueryInput}
              aria-label="Search pending teachers"
            />
          </>
        }
        footer={
          total > PAGE_SIZE ? (
            <Pagination currentPage={safePage} totalItems={total} onPageChange={setPage} />
          ) : undefined
        }
      >
        {isPending ? (
          <PendingQueueSkeleton columns={["Account", "Role", "Contact", "Status", "Requested"]} />
        ) : isError ? (
          <p className="py-4 text-sm text-muted-foreground">Could not load pending teachers.</p>
        ) : visibleRows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {queryInput.trim()
              ? `No pending teachers match “${queryInput.trim()}”.`
              : "No teacher accounts are waiting for approval."}
          </p>
        ) : (
          <PendingStaffTable
            rows={visibleRows}
            busy={act.isPending}
            actingId={act.isPending ? act.variables?.id : undefined}
            onApprove={(row) => act.mutate({ id: row.id, approve: true, name: row.name })}
            onReject={(row) => {
              setRejectReason("");
              setRejectTarget(row);
            }}
          />
        )}
      </KanbanBoard>

      <KanbanOverlay
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Reject account request"
        description={
          rejectTarget ? `Tell ${rejectTarget.name} why the request was not approved.` : undefined
        }
        icon={<X size={14} className="text-red-500" aria-hidden />}
        busy={act.isPending}
        dismissable={!act.isPending}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={act.isPending}
              onClick={() => setRejectTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={act.isPending || rejectReason.trim().length === 0}
              onClick={() => {
                const target = rejectTarget;
                if (!target) return;
                act.mutate(
                  { id: target.id, approve: false, reason: rejectReason.trim(), name: target.name },
                  { onSuccess: () => setRejectTarget(null) },
                );
              }}
            >
              {act.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Reject request
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="staff-reject-reason" className="text-sm font-medium">
            Reason
          </label>
          <Textarea
            id="staff-reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Not on the school's teacher roster for this school year."
            rows={3}
          />
        </div>
      </KanbanOverlay>
    </>
  );
}
