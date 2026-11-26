"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, Loader2, UserPlus, X } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Textarea } from "@/components/ui/textarea";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { InsightCallout } from "@/components/ui/insight-callout";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import {
  ACCOUNT_APPROVALS_BASE,
  ACCOUNT_APPROVALS_KEY,
  approveAccountRequest,
  messageOf,
  rejectAccountRequest,
  useApprovalInvalidation,
} from "./api";
import { LrnVerifyDock } from "./LrnVerifyDock";
import { PendingAccountsTable, PendingQueueSkeleton } from "./pending-tables";
import { type PendingStudent, type PendingStudentsResponse } from "./types";

type Kind = "student" | "parent";

function fetchPending(kind: Kind, page: number, signal?: AbortSignal) {
  return apiClient
    .get<PendingStudentsResponse>(ACCOUNT_APPROVALS_BASE, {
      params: { role: kind, page, pageSize: PAGE_SIZE },
      signal,
    })
    .then((res) => res.data);
}

/**
 * Student / parent sign-ups awaiting the administrator's decision. Students go
 * through LRN verification before the account is provisioned; parents have no
 * LRN, so their card is a straight approve/reject.
 */
export function PendingAccountsQueue({
  kind,
  filterTabs,
}: {
  kind: Kind;
  /** Role filter tabs rendered in the board header, from the approvals desk. */
  filterTabs?: React.ReactNode;
}) {
  const invalidate = useApprovalInvalidation();
  const [page, setPage] = React.useState(1);
  const [queryInput, setQueryInput] = React.useState("");
  const [verifyTarget, setVerifyTarget] = React.useState<PendingStudent | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<PendingStudent | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...ACCOUNT_APPROVALS_KEY, kind, page],
    queryFn: ({ signal }) => fetchPending(kind, page, signal),
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
      name?: string;
    }) => (approve ? approveAccountRequest(id) : rejectAccountRequest(id, reason ?? "")),
    onSuccess: (_res, { approve, name }) => {
      toast.success({
        title: approve ? "Approved" : "Rejected",
        description: approve
          ? `${name ?? "The account"} can sign in now.`
          : `${name ?? "The request"} was rejected.`,
      });
      invalidate();
    },
    onError: (err) => {
      toast.error({ title: "Action failed", description: messageOf(err) });
    },
    onSettled: () => {
      void refetch();
    },
  });

  const rows = data?.students ?? [];
  const total = data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const actingId = act.isPending ? act.variables?.id : undefined;

  const visibleRows = React.useMemo(() => {
    const q = queryInput.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.name} ${r.lrn} ${r.section} ${r.email}`.toLowerCase().includes(q),
    );
  }, [rows, queryInput]);

  const approveNow = (row: PendingStudent) =>
    act.mutate({ id: row.id, approve: true, name: row.name });

  return (
    <>
      <KanbanBoard
        title={kind === "student" ? "Pending Students" : "Pending Parents"}
        icon={<UserPlus size={14} className="text-primary" aria-hidden />}
        // No parent card — the queue is a review list, so the table is the only
        // surface (matches the accounts board on the same desk).
        bare
        description={
          kind === "student"
            ? "Sign-ups awaiting LRN verification and activation."
            : "Parent/guardian sign-ups awaiting activation."
        }
        ariaLabel={kind === "student" ? "Pending student accounts" : "Pending parent accounts"}
        headerToolbar={
          <>
            {filterTabs}
            <SearchField
              className="w-56"
              placeholder="Search name or email…"
              value={queryInput}
              onChange={setQueryInput}
              aria-label={`Search pending ${kind}s`}
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
          <PendingQueueSkeleton
            columns={
              kind === "student"
                ? ["Account", "Grade", "Section", "Status", "Requested"]
                : ["Account", "Status", "Requested"]
            }
          />
        ) : isError ? (
          <p className="py-4 text-sm text-muted-foreground">
            Could not load pending accounts.{" "}
            <button type="button" className="underline" onClick={() => void refetch()}>
              Retry
            </button>
          </p>
        ) : visibleRows.length === 0 ? (
          <div className="flex w-full justify-center py-4">
            {queryInput.trim() ? (
              <InsightCallout role="status" className="w-full max-w-xl text-left">
                <strong>No accounts match &ldquo;{queryInput.trim()}&rdquo;.</strong> Clear the
                filter to see the whole queue.
              </InsightCallout>
            ) : (
              <InsightCallout role="status" className="w-full max-w-xl text-left">
                <Clock size={14} className="mr-1 inline" aria-hidden />
                No {kind} accounts are waiting for approval.
              </InsightCallout>
            )}
          </div>
        ) : (
          <PendingAccountsTable
            rows={visibleRows}
            kind={kind}
            busy={act.isPending}
            actingId={actingId}
            onVerify={(row) => setVerifyTarget(row)}
            onApprove={approveNow}
            onReject={(row) => {
              setRejectReason("");
              setRejectTarget(row);
            }}
          />
        )}
      </KanbanBoard>

      {kind === "student" && verifyTarget ? (
        <LrnVerifyDock
          key={verifyTarget.id}
          student={verifyTarget}
          approving={actingId === verifyTarget.id}
          onClose={() => setVerifyTarget(null)}
          onApprove={() => {
            const target = verifyTarget;
            setVerifyTarget(null);
            return act
              .mutateAsync({ id: target.id, approve: true, name: target.name })
              .then(() => undefined);
          }}
          onReject={(reason) => {
            const target = verifyTarget;
            setVerifyTarget(null);
            return act
              .mutateAsync({ id: target.id, approve: false, reason, name: target.name })
              .then(() => undefined);
          }}
        />
      ) : null}

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
                  {
                    id: target.id,
                    approve: false,
                    reason: rejectReason.trim(),
                    name: target.name,
                  },
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
          <label htmlFor="pending-reject-reason" className="text-sm font-medium">
            Reason
          </label>
          <Textarea
            id="pending-reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. LRN does not match any enrolment record for this school year."
            rows={3}
          />
        </div>
      </KanbanOverlay>
    </>
  );
}
