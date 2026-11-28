"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, Loader2, Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Textarea } from "@/components/ui/textarea";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import rowStyles from "@/components/ui/table-row-in.module.css";
import type { CSSProperties } from "react";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { toast } from "@/components/ui/sonner";
import { formatGrade, formatSection } from "@/lib/utils";
import {
  ACCOUNT_APPROVALS_KEY,
  LINK_REQUESTS_KEY,
  approveLinkRequest,
  fetchLinkRequests,
  messageOf,
  rejectLinkRequest,
  type AdminLinkRequest,
} from "./api";
import { formatRelativeTime } from "./types";

const HEAD_CLASS =
  "px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground";

/**
 * Guardian requests to be linked to a learner by LRN. A parent files one from
 * the parent workspace; approving stamps the link so the portal can read the
 * learner immediately, declining removes it and lets the parent ask again.
 */
export function LinkRequestsQueue({ filterTabs }: { filterTabs?: React.ReactNode }) {
  const qc = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [queryInput, setQueryInput] = React.useState("");
  const [rejectTarget, setRejectTarget] = React.useState<AdminLinkRequest | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...LINK_REQUESTS_KEY, page],
    queryFn: ({ signal }) => fetchLinkRequests(page, PAGE_SIZE, signal),
    // There is no realtime stream on the admin desk; poll while the tab is open.
    refetchInterval: 20_000,
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
    }) => (approve ? approveLinkRequest(id) : rejectLinkRequest(id, reason)),
    onSuccess: (_res, { approve, name }) => {
      toast.success({
        title: approve ? "Learner linked" : "Request declined",
        description: approve
          ? `${name ?? "The learner"} is now visible in the parent workspace.`
          : `${name ?? "The learner"} was not linked.`,
      });
      void qc.invalidateQueries({ queryKey: LINK_REQUESTS_KEY });
      void qc.invalidateQueries({ queryKey: ACCOUNT_APPROVALS_KEY });
      void qc.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
    onError: (err) => {
      toast.error({ title: "Action failed", description: messageOf(err) });
    },
    onSettled: () => {
      void refetch();
    },
  });

  const rows = React.useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const actingId = act.isPending ? act.variables?.id : undefined;

  const visibleRows = React.useMemo(() => {
    const q = queryInput.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.parent.name} ${r.parent.email} ${r.student.name} ${r.student.lrn} ${r.student.sectionName ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, queryInput]);

  return (
    <>
      <KanbanBoard
        title="Learner link requests"
        icon={<Link2 size={14} className="text-primary" aria-hidden />}
        bare
        description="Parents asking to link a child to their account by LRN."
        ariaLabel="Pending guardian learner link requests"
        headerToolbar={
          <>
            {filterTabs}
            <SearchField
              className="w-56"
              placeholder="Search parent, learner or LRN…"
              value={queryInput}
              onChange={setQueryInput}
              aria-label="Search learner link requests"
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
          <p className="py-4 text-[13px] text-muted-foreground">Loading link requests…</p>
        ) : isError ? (
          <p className="py-4 text-sm text-muted-foreground">
            Could not load link requests.{" "}
            <button type="button" className="underline" onClick={() => void refetch()}>
              Retry
            </button>
          </p>
        ) : visibleRows.length === 0 ? (
          <div className="flex w-full justify-center py-4">
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              {queryInput.trim() ? (
                <>
                  <strong>No link requests match &ldquo;{queryInput.trim()}&rdquo;.</strong> Clear
                  the filter to see the whole queue.
                </>
              ) : (
                <>
                  <Clock size={14} className="mr-1 inline" aria-hidden />
                  No parents are waiting to link a learner.
                </>
              )}
            </InsightCallout>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={HEAD_CLASS}>
                    Guardian
                  </th>
                  <th scope="col" className={HEAD_CLASS}>
                    Learner
                  </th>
                  <th scope="col" className={HEAD_CLASS}>
                    Grade / Section
                  </th>
                  <th scope="col" className={HEAD_CLASS}>
                    Relationship
                  </th>
                  <th scope="col" className={HEAD_CLASS}>
                    Requested
                  </th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const busy = actingId === row.id;
                  return (
                    <tr
                      key={row.id}
                      style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as CSSProperties}
                      className={`${rowStyles.row} border-b border-border/60 transition-colors duration-150 last:border-b-0 hover:bg-muted/60`}
                    >
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <StudentMascot name={row.parent.name} seed={row.parent.id} size={32} />
                          <div className="min-w-0">
                            <p className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground">
                              {row.parent.name}
                            </p>
                            <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
                              {row.parent.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <p className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground">
                          {row.student.name}
                        </p>
                        <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground tabular-nums">
                          LRN {row.student.lrn}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] text-muted-foreground">
                        {formatGrade(row.student.gradeLevel) || "—"}
                        {row.student.sectionName
                          ? ` · ${formatSection(row.student.sectionName)}`
                          : ""}
                      </td>
                      <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                        <Pill tone="neutral" label="Relationship">
                          {row.relationship}
                        </Pill>
                      </td>
                      <td
                        className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground"
                        title={`Requested ${new Date(row.requestedAt).toLocaleString()}`}
                      >
                        {formatRelativeTime(row.requestedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            className="h-6 gap-1 px-2 text-[12px]"
                            disabled={act.isPending}
                            onClick={() =>
                              act.mutate({
                                id: row.id,
                                approve: true,
                                name: row.student.name,
                              })
                            }
                            aria-label={`Approve link to ${row.student.name}`}
                          >
                            {busy && act.variables?.approve ? (
                              <Loader2 size={12} className="animate-spin" aria-hidden />
                            ) : (
                              <Check size={12} aria-hidden />
                            )}
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-6 gap-1 px-2 text-[12px] text-destructive hover:text-destructive"
                            disabled={act.isPending}
                            onClick={() => {
                              setRejectReason("");
                              setRejectTarget(row);
                            }}
                            aria-label={`Decline link to ${row.student.name}`}
                          >
                            <X size={12} aria-hidden />
                            Decline
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </KanbanBoard>

      <KanbanOverlay
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Decline learner link request"
        description={
          rejectTarget
            ? `${rejectTarget.parent.name} will be told the link to ${rejectTarget.student.name} was not approved.`
            : undefined
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
              disabled={act.isPending}
              onClick={() => {
                const target = rejectTarget;
                if (!target) return;
                act.mutate(
                  {
                    id: target.id,
                    approve: false,
                    reason: rejectReason.trim() || undefined,
                    name: target.student.name,
                  },
                  { onSuccess: () => setRejectTarget(null) },
                );
              }}
            >
              {act.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Decline request
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="link-reject-reason" className="text-sm font-medium">
            Reason <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="link-reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. The LRN does not match this guardian's records."
            rows={3}
          />
        </div>
      </KanbanOverlay>
    </>
  );
}
