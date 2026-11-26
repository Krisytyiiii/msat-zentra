"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  History,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { KanbanOverlay, KanbanPill } from "@/components/ui/kanban-overlay";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/sonner";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { roleLabel } from "@/lib/auth/roles";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  fetchAdminAudit,
  type AdminAuditEntry,
} from "@/services/admin/admin.service";
import { AuditTable } from "./components/audit-table";
import { AuditTableSkeleton } from "./components/audit-table-skeleton";
import styles from "../users/users.module.css";

function prettyAction(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettySource(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Action → row/status tone, so destructive writes read red at a glance. */
function toneForAction(action: string): "red" | "green" | "amber" | "blue" | "muted" {
  const a = action.toLowerCase();
  if (/(delete|reject|suspend|revoke|dismiss|fail)/.test(a)) return "red";
  if (/(create|approve|restore|publish|sign|complete)/.test(a)) return "green";
  if (/(update|edit|lock|submit|assign|schedule)/.test(a)) return "amber";
  if (/(login|logout|auth|view|read|export)/.test(a)) return "blue";
  return "muted";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAuditPage() {
  return (
    <React.Suspense>
      <AdminAuditPageInner />
    </React.Suspense>
  );
}

function AdminAuditPageInner() {
  const pager = useUrlPager(0, {});

  const [queryInput, setQueryInput] = React.useState(pager.search);
  const debouncedQuery = useDebouncedValue(queryInput, 300);
  const [detail, setDetail] = React.useState<AdminAuditEntry | null>(null);

  // Mirror the search into the URL (shareable / refresh-safe). Skips the first
  // render so a deep link like ?page=3 opens on that page.
  const firstSync = React.useRef(true);
  React.useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    pager.setFilters({ q: debouncedQuery || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // "/" jumps to the search field, the way a console is expected to behave.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.getElementById("admin-audit-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = useQuery({
    queryKey: ["admin", "audit", pager.page, debouncedQuery],
    queryFn: ({ signal }) =>
      fetchAdminAudit({
        page: pager.page,
        pageSize: PAGE_SIZE,
        q: debouncedQuery || undefined,
        signal,
      }),
    staleTime: 15_000,
  });

  const rows = React.useMemo(() => query.data?.entries ?? [], [query.data]);
  const total = query.data?.total ?? 0;
  const searching = queryInput.trim().length > 0;

  const clearSearch = React.useCallback(() => {
    setQueryInput("");
  }, []);

  return (
    <section className={styles.page}>
      <KanbanBoard
        title="Audit trail"
        icon={<ShieldCheck size={14} className="text-primary" aria-hidden />}
        bare
        description="Every recorded write, newest first. Search or open a row for the full before/after payload."
        ariaLabel="Audit log"
        headerToolbar={
          <SearchField
            id="admin-audit-search"
            className="w-64"
            placeholder="Search reason, source, or actor…"
            value={queryInput}
            onChange={setQueryInput}
            aria-label="Search audit log"
          />
        }
        footer={
          <Pagination
            currentPage={pager.page}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={pager.setPage}
          />
        }
      >
        {query.isPending ? (
          <AuditTableSkeleton />
        ) : query.isError ? (
          <p className={styles.empty}>
            Could not load the audit log.{" "}
            <button type="button" className={styles.inlineBtn} onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        ) : rows.length === 0 ? (
          <PageEmptyCallout
            fit
            action={
              searching ? (
                <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={clearSearch}>
                  Clear search
                </Button>
              ) : undefined
            }
          >
            {searching
              ? "No audit entries match this search."
              : "No activity has been recorded yet."}
          </PageEmptyCallout>
        ) : (
          <AuditTable rows={rows} onOpen={setDetail} />
        )}
      </KanbanBoard>

      <p className={styles.note}>
        <ShieldCheck size={14} aria-hidden="true" /> Audit entries are append-only and cannot be
        edited from this console.
      </p>

      <KanbanOverlay
        open={detail !== null}
        onClose={() => setDetail(null)}
        width="lg"
        title={detail ? prettyAction(detail.actionType) : "Audit entry"}
        icon={<History size={14} className="text-primary" aria-hidden />}
        description={detail ? detail.sourceLabel : undefined}
        headerActions={
          detail ? (
            <KanbanPill tone={toneForAction(detail.actionType) === "red" ? "danger" : "accent"}>
              {formatDateTime(detail.timestamp)}
            </KanbanPill>
          ) : null
        }
        footer={
          detail ? (
            <div className="flex w-full justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-[12px]"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(detail.id)
                    .then(() => toast.success({ title: "Entry ID copied" }))
                    .catch(() => toast.error({ title: "Could not copy the entry ID" }));
                }}
              >
                <Copy size={12} aria-hidden />
                Copy entry ID
              </Button>
              <Button type="button" size="sm" className="h-7 text-[12px]" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          ) : null
        }
      >
        {detail ? (
          <div className="flex flex-col gap-3">
            <dl className={styles.confirmSummary}>
              <div>
                <dt>Actor</dt>
                <dd>{detail.user}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{roleLabel(detail.actorRole)}</dd>
              </div>
              <div>
                <dt>Action</dt>
                <dd>{prettyAction(detail.actionType)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {prettySource(detail.sourceTable)} · {detail.sourceId}
                </dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{detail.reason || "—"}</dd>
              </div>
            </dl>

            {detail.newValue || detail.oldValue ? (
              <div className="grid gap-2">
                {detail.oldValue ? (
                  <PayloadBlock label="Before" value={detail.oldValue} />
                ) : null}
                {detail.newValue ? (
                  <PayloadBlock label="After" value={detail.newValue} />
                ) : null}
              </div>
            ) : (
              <p className="m-0 text-[12px] text-muted-foreground">
                No field-level payload was captured for this entry.
              </p>
            )}
          </div>
        ) : null}
      </KanbanOverlay>
    </section>
  );
}

function PayloadBlock({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown>;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <pre className="m-0 max-h-44 overflow-auto rounded-lg border border-border bg-muted/40 p-2 text-[12px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
