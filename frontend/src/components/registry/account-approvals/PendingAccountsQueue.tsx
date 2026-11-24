"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Clock, Loader2, Search, UserPlus, X } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { InsightCallout } from "@/components/ui/insight-callout";
import { RowList, type RowListItem } from "@/components/ui/row-list";
import { RowListSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { formatGrade, formatSection } from "@/lib/utils";
import {
  ACCOUNT_APPROVALS_BASE,
  ACCOUNT_APPROVALS_KEY,
  approveAccountRequest,
  messageOf,
  rejectAccountRequest,
  useApprovalInvalidation,
} from "./api";
import { LrnVerifyDock } from "./LrnVerifyDock";
import { formatRelativeTime, type PendingStudent, type PendingStudentsResponse } from "./types";

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
export function PendingAccountsQueue({ kind }: { kind: Kind }) {
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

  const rowItems = React.useMemo<RowListItem[]>(
    () =>
      visibleRows.map((row) => ({
        key: row.id,
        status: { label: "Pending", tone: "amber" as const },
        statusTitle: "Awaiting administrator approval",
        title: row.name,
        idLabel: kind === "student" ? row.lrn : row.email,
        idLabelClassName: "text-xs font-medium",
        meta: [
          ...(kind === "student"
            ? [
                { label: formatGrade(row.gradeLevel), field: "grade" as const, dot: false },
                { label: formatSection(row.section), field: "section" as const, dot: false },
              ]
            : []),
          {
            label: formatRelativeTime(row.requestedAt),
            tone: "muted" as const,
            dot: false,
            title: `Requested ${new Date(row.requestedAt).toLocaleString()}`,
          },
        ],
        ariaLabel: `${row.name}, pending ${kind} account`,
        avatarMascot: { name: row.name, seed: row.lrn || row.id },
        actions:
          kind === "student" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-[12px] font-medium shadow-none"
              onClick={() => setVerifyTarget(row)}
              aria-label={`Verify LRN for ${row.name}`}
            >
              <UserPlus size={12} aria-hidden />
              Verify &amp; approve
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                className="h-6 gap-1 border border-transparent bg-emerald-600 px-2 text-[12px] font-medium text-white shadow-none hover:bg-emerald-700"
                disabled={act.isPending}
                onClick={() => approveNow(row)}
                aria-label={`Approve ${row.name}`}
              >
                {actingId === row.id && act.variables?.approve ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-3.5" aria-hidden />
                )}
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-2 text-[12px] font-medium shadow-none"
                disabled={act.isPending}
                onClick={() => {
                  setRejectReason("");
                  setRejectTarget(row);
                }}
                aria-label={`Reject ${row.name}`}
              >
                <X className="size-3.5" aria-hidden />
                Reject
              </Button>
            </div>
          ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRows, actingId, act.isPending, kind],
  );

  return (
    <>
      <KanbanBoard
        title={kind === "student" ? "Pending Students" : "Pending Parents"}
        icon={<UserPlus size={14} className="text-primary" aria-hidden />}
        // Sit directly on the page canvas — the queue is a review list, not a
        // raised panel (matches the accounts board on the same desk).
        style={{ backgroundColor: "transparent" }}
        description={
          kind === "student"
            ? "Sign-ups awaiting LRN verification and activation."
            : "Parent/guardian sign-ups awaiting activation."
        }
        ariaLabel={kind === "student" ? "Pending student accounts" : "Pending parent accounts"}
        actions={
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="h-8 w-60 rounded-[16px] pl-7 text-sm"
              placeholder="Search name or email…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label={`Search pending ${kind}s`}
            />
          </div>
        }
        footer={
          total > PAGE_SIZE ? (
            <Pagination currentPage={safePage} totalItems={total} onPageChange={setPage} />
          ) : undefined
        }
      >
        {isPending ? (
          <RowListSkeleton
            rows={6}
            gutter="0.625rem"
            withMetaAvatar={false}
            withActions
            metaPills={kind === "student" ? 3 : 1}
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
          <RowList
            bleed
            gutter="0.625rem"
            animateOnMount
            motionPreset="desk"
            items={rowItems}
            emptyText={`No pending ${kind} accounts.`}
            ariaLabel={`Pending ${kind} accounts`}
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
              className="bg-red-600 text-white hover:bg-red-700"
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
