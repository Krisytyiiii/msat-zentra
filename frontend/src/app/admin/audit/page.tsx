"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronRight,
  Copy,
  Database,
  History,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { KanbanOverlay, KanbanPill } from "@/components/ui/kanban-overlay";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { RowList, type RowListItem, type RowTone } from "@/components/ui/row-list";
import { RowListSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import { StatDeck } from "@/components/ui/stat-deck";
import { toast } from "@/components/ui/sonner";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { roleLabel } from "@/lib/auth/roles";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  fetchAdminAudit,
  fetchAdminAuditSummary,
  type AdminAuditEntry,
} from "@/services/admin/admin.service";
import styles from "../users/users.module.css";

/** Viewer tone per actor role — same colour families as the accounts desk. */
const ROLE_TONE: Record<string, RowTone> = {
  student: "blue",
  parent: "blue",
  subject_teacher: "amber",
  adviser: "amber",
  nurse: "red",
  adm_coordinator: "red",
  guidance_counselor: "green",
  record_keeper: "amber",
  registrar: "blue",
  principal: "red",
  admin: "green",
  system: "muted",
};

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
function toneForAction(action: string): RowTone {
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

function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  const searchRef = React.useRef<HTMLInputElement>(null);

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
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const summary = useQuery({
    queryKey: ["admin", "audit", "summary", debouncedQuery],
    queryFn: ({ signal }) =>
      fetchAdminAuditSummary({
        q: debouncedQuery || undefined,
        signal,
      }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const query = useQuery({
    queryKey: ["admin", "audit", pager.page, debouncedQuery],
    queryFn: ({ signal }) =>
      fetchAdminAudit({
        page: pager.page,
        pageSize: PAGE_SIZE,
        q: debouncedQuery || undefined,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const rows = React.useMemo(() => query.data?.entries ?? [], [query.data]);
  const total = query.data?.total ?? 0;
  const counts = summary.data;
  const searching = queryInput.trim().length > 0;

  const clearSearch = React.useCallback(() => {
    setQueryInput("");
  }, []);

  const rowItems = React.useMemo<RowListItem[]>(
    () =>
      rows.map((entry) => ({
        key: entry.id,
        status: {
          label: prettyAction(entry.actionType),
          tone: toneForAction(entry.actionType),
        },
        statusTitle: "Action",
        title: entry.sourceLabel,
        subtitle: entry.user,
        idLabel: `#${entry.sourceId.slice(0, 8)}`,
        idLabelTitle: "Source record",
        idLabelClassName: "text-xs font-medium",
        leadPill: {
          label: roleLabel(entry.actorRole),
          tone: ROLE_TONE[entry.actorRole] ?? "muted",
          title: "Actor role",
        },
        meta: [
          {
            label: timeAgo(entry.timestamp),
            tone: "muted" as const,
            dot: false,
            title: formatDateTime(entry.timestamp),
          },
          ...(entry.reason
            ? [
                {
                  label: entry.reason.length > 42 ? `${entry.reason.slice(0, 42)}…` : entry.reason,
                  tone: "muted" as const,
                  dot: false,
                  title: entry.reason,
                },
              ]
            : []),
        ],
        ariaLabel: `${prettyAction(entry.actionType)} on ${entry.sourceLabel} by ${entry.user}, ${formatDateTime(entry.timestamp)}`,
        actions: (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setDetail(entry)}
            aria-label={`View details for ${prettyAction(entry.actionType)} on ${entry.sourceLabel}`}
          >
            Details
            <ChevronRight size={12} aria-hidden="true" />
          </button>
        ),
      })),
    [rows],
  );

  return (
    <section className={styles.page}>
      <StatDeck
        title="Audit overview"
        icon={Activity}
        ariaLabel="Audit log totals"
        loading={summary.isPending}
        error={summary.isError}
        items={[
          {
            key: "total",
            icon: History,
            label: "All entries",
            unit: "",
            value: counts?.total ?? 0,
            hint: "Entire audit history",
            indicator: "none",
          },
          {
            key: "actions",
            icon: Activity,
            label: "Actions",
            unit: "",
            value: counts?.actions.length ?? 0,
            hint: "Distinct action types",
            indicator: "none",
          },
          {
            key: "sources",
            icon: Database,
            label: "Sources",
            unit: "",
            value: counts?.sources.length ?? 0,
            hint: "Tables written to",
            indicator: "none",
          },
          {
            key: "actors",
            icon: Users,
            label: "Actors",
            unit: "",
            value: counts?.actors ?? 0,
            hint: "Distinct accounts",
            indicator: "none",
          },
        ]}
      />

      <KanbanBoard
        title="Audit trail"
        icon={<ShieldCheck size={14} className="text-primary" aria-hidden />}
        className={styles.boardTransparent}
        description="Every recorded write, newest first. Search or open a row for the full before/after payload."
        ariaLabel="Audit log"
        headerToolbar={
          <InputGroup className="w-64 max-w-full rounded-[16px]">
            <InputGroupInput
              ref={searchRef}
              placeholder="Search reason, source, or actor…"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              aria-label="Search audit log"
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
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
          <RowListSkeleton
            rows={PAGE_SIZE}
            gutter="0.625rem"
            hasLead
            withMetaAvatar={false}
            withActions
            metaPills={2}
          />
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
          <RowList
            bleed
            gutter="0.625rem"
            animateOnMount
            motionPreset="desk"
            items={rowItems}
            emptyText="No audit entries match these filters."
            ariaLabel="Audit entries"
          />
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
