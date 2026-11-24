"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock,
  Loader2,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { StatDeck } from "@/components/ui/stat-deck";
import { toast } from "@/components/ui/sonner";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { RowList, type RowListItem, type RowTone } from "@/components/ui/row-list";
import { RowListSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { roleLabel } from "@/lib/auth/roles";
import {
  fetchAdminOverview,
  fetchAdminUsers,
  updateAdminUserStatus,
  type AdminOverview,
  type AdminUser,
} from "@/services/admin/admin.service";
import type { PaginatedEnvelope } from "@/lib/api/usePaginatedQuery";
import styles from "./users.module.css";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Status → kanban row tone (green / amber / red). */
const STATUS_TONE: Record<string, RowTone> = {
  active: "green",
  pending: "amber",
  suspended: "red",
};

/** Role → kanban row tone, grouped by the presence legend's colour families. */
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
};

type StatusFilter = "" | "active" | "suspended";

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "", label: "All accounts" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default function AdminUsersPage() {
  return (
    <React.Suspense>
      <AdminUsersPageInner />
    </React.Suspense>
  );
}

function AdminUsersPageInner() {
  const queryClient = useQueryClient();
  const [queryInput, setQueryInput] = React.useState("");
  // The directory is the "live accounts" view — pending sign-ups have their own
  // page, so this list opens on active accounts.
  const [status, setStatus] = React.useState<StatusFilter>("active");

  const pager = useUrlPager(0, {}, { extraParams: ["status"] });

  // Status is a server filter — keep it in the URL. The search box filters the
  // loaded rows instantly (no fetch).
  React.useEffect(() => {
    pager.setFilters({ status: status || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const query = useQuery({
    queryKey: ["admin", "users", pager.page, status],
    queryFn: ({ signal }) =>
      fetchAdminUsers({
        page: pager.page,
        pageSize: PAGE_SIZE,
        status: status || undefined,
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  // Roll-up counts for the stat strip; shares the `["admin","overview"]` cache
  // entry that every account mutation already invalidates.
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: fetchAdminOverview,
    staleTime: 20_000,
  });
  const counts = overview.data?.users;

  const total = query.data?.total ?? 0;
  const rows = React.useMemo(() => query.data?.data ?? [], [query.data]);

  const searching = queryInput.trim().length > 0;

  // Instant local filter over the loaded page — typing never hits the network.
  const visibleRows = React.useMemo(() => {
    const q = queryInput.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((user) =>
      `${user.fullName} ${user.email} ${roleLabel(user.role)}`.toLowerCase().includes(q),
    );
  }, [rows, queryInput]);

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "active" | "suspended" }) =>
      updateAdminUserStatus(id, next),
    // The row and the stat tiles flip the moment the administrator confirms —
    // no waiting on the round trip. Any drift is corrected by the refetch in
    // `onSettled`; a failure rolls the optimistic write back.
    onMutate: async ({ id, next }) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "users"] });

      const previousLists = queryClient.getQueriesData<PaginatedEnvelope<AdminUser>>({
        queryKey: ["admin", "users"],
      });
      const previousOverview = queryClient.getQueryData<AdminOverview>(["admin", "overview"]);

      queryClient.setQueriesData<PaginatedEnvelope<AdminUser>>(
        { queryKey: ["admin", "users"] },
        (old) =>
          old
            ? { ...old, data: old.data.map((u) => (u.id === id ? { ...u, status: next } : u)) }
            : old,
      );

      if (previousOverview) {
        const prev = previousOverview;
        queryClient.setQueryData<AdminOverview>(["admin", "overview"], {
          ...prev,
          users: {
            ...prev.users,
            active: prev.users.active + (next === "active" ? 1 : -1),
            suspended: prev.users.suspended + (next === "suspended" ? 1 : -1),
          },
          recentUsers: prev.recentUsers.map((u) => (u.id === id ? { ...u, status: next } : u)),
        });
      }

      return { previousLists, previousOverview };
    },
    onSuccess: (updated) => {
      toast.success({
        title: "Account updated",
        description: `The account is now ${updated.status}.`,
      });
    },
    onError: (error, _vars, context) => {
      context?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (context?.previousOverview) {
        queryClient.setQueryData(["admin", "overview"], context.previousOverview);
      }
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not update the account.";
      toast.error({ title: "Update failed", description: message });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  const actingId = statusMutation.isPending ? statusMutation.variables?.id : undefined;

  // Suspend/restore is destructive-ish, so it always passes through a confirm
  // overlay instead of firing straight off the row button.
  const [confirmTarget, setConfirmTarget] = React.useState<{
    user: AdminUser;
    next: "active" | "suspended";
  } | null>(null);

  const rowItems = React.useMemo<RowListItem[]>(
    () =>
      visibleRows.map((user: AdminUser) => ({
        key: user.id,
        status: {
          label: user.status.charAt(0).toUpperCase() + user.status.slice(1),
          tone: STATUS_TONE[user.status] ?? "muted",
        },
        statusTitle: "Account status",
        title: user.fullName,
        subtitle: user.email,
        leadPill: {
          label: roleLabel(user.role),
          tone: ROLE_TONE[user.role] ?? "muted",
          title: "Role",
        },
        meta: [
          {
            label: formatDate(user.createdAt),
            tone: "muted",
            dot: false,
            title: `Created ${new Date(user.createdAt).toLocaleString()}`,
          },
        ],
        avatarMascot: {
          name: user.fullName,
          seed: user.id,
          character: user.mascot,
        },
        ariaLabel: `${user.fullName}, ${roleLabel(user.role)}, ${user.status} account`,
        actions: (
          <span className={styles.rowAction}>
            {user.role === "admin" ? (
              <span className={styles.muted}>—</span>
            ) : user.status === "pending" ? (
              <Link href="/admin/users/pending" className={styles.reviewLink}>
                Review
                <ArrowRight size={12} aria-hidden />
              </Link>
            ) : user.status === "suspended" ? (
              <button
                type="button"
                className={styles.actionBtn}
                disabled={statusMutation.isPending}
                onClick={() => setConfirmTarget({ user, next: "active" })}
                aria-label={`Restore ${user.fullName}`}
              >
                {actingId === user.id ? (
                  <Loader2 size={12} className={styles.spin} aria-hidden="true" />
                ) : (
                  <UserCheck size={12} aria-hidden="true" />
                )}
                Restore
              </button>
            ) : (
              <button
                type="button"
                className={styles.actionBtnDanger}
                disabled={statusMutation.isPending}
                onClick={() => setConfirmTarget({ user, next: "suspended" })}
                aria-label={`Suspend ${user.fullName}`}
              >
                {actingId === user.id ? (
                  <Loader2 size={12} className={styles.spin} aria-hidden="true" />
                ) : (
                  <UserX size={12} aria-hidden="true" />
                )}
                Suspend
              </button>
            )}
          </span>
        ),
      })),
    [visibleRows, actingId, statusMutation.isPending],
  );

  const filtersDirty = status !== "active" || queryInput.trim().length > 0;

  return (
    <section className={styles.page}>
      <StatDeck
        title="Account overview"
        icon={Users}
        ariaLabel="Account totals"
        loading={overview.isPending}
        error={overview.isError}
        items={[
          {
            key: "total",
            icon: Users,
            label: "Total accounts",
            unit: "",
            value: counts?.total ?? 0,
            hint: "All statuses",
            onClick: () => setStatus(""),
            active: status === "",
            indicator: "none",
          },
          {
            key: "active",
            icon: UserCheck,
            label: "Active",
            unit: "",
            value: counts?.active ?? 0,
            hint: "Signed-in ready",
            onClick: () => setStatus("active"),
            active: status === "active",
            indicator: "none",
          },
          {
            key: "suspended",
            icon: UserX,
            label: "Suspended",
            unit: "",
            value: counts?.suspended ?? 0,
            hint: "Access revoked",
            onClick: () => setStatus("suspended"),
            active: status === "suspended",
            indicator: "none",
            tone: "red",
          },
          {
            key: "pending",
            icon: Clock,
            label: "Pending",
            unit: "",
            value: counts?.pending ?? 0,
            hint: "Awaiting approval",
            href: "/admin/users/pending",
            tone: "amber",
          },
        ]}
      />

      <KanbanBoard
        title="Accounts"
        icon={<Users size={14} className="text-primary" aria-hidden />}
        className={styles.boardTransparent}
        description="Search every account, then suspend or restore access."
        ariaLabel="User accounts"
        headerToolbar={
          <>
            <InputGroup className="w-56 max-w-full rounded-[16px]">
              <InputGroupInput
                placeholder="Filter accounts..."
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                aria-label="Filter accounts"
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>

            {filtersDirty ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[12px]"
                onClick={() => {
                  setStatus("active");
                  setQueryInput("");
                }}
              >
                Reset
              </Button>
            ) : null}
          </>
        }
        toolbar={
          <FilterTabs
            label="Account status filter"
            value={status}
            onChange={setStatus}
            className="w-fit self-start"
            options={STATUS_FILTERS.map((item) => ({
              value: item.value,
              label: item.label,
              ...(item.value === "active" ? { count: counts?.active } : {}),
              ...(item.value === "suspended" ? { count: counts?.suspended } : {}),
              ...(item.value === "" ? { count: counts?.total } : {}),
            }))}
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
          <RowListSkeleton
            rows={PAGE_SIZE}
            gutter="0.625rem"
            hasLead
            withMetaAvatar={false}
            withActions
            metaPills={1}
          />
        ) : query.isError ? (
          <p className={styles.empty}>
            Could not load accounts.{" "}
            <button type="button" className={styles.inlineBtn} onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        ) : searching && visibleRows.length === 0 ? (
          <div className="flex w-full justify-center py-4">
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              <strong>No accounts match &ldquo;{queryInput.trim()}&rdquo;.</strong> Try a
              different name or email — or clear the filter to see every account.
            </InsightCallout>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex w-full justify-center py-4">
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              No accounts in this view.{" "}
              {status === "active" ? "Every live account is suspended." : "Try another filter."}
            </InsightCallout>
          </div>
        ) : (
          <RowList
            bleed
            gutter="0.625rem"
            animateOnMount
            motionPreset="desk"
            items={rowItems}
            emptyText="No accounts match these filters."
            ariaLabel="User accounts"
          />
        )}
      </KanbanBoard>

      <p className={styles.note}>
        <ShieldCheck size={14} aria-hidden="true" /> Administrator accounts are protected and cannot
        be suspended from this console.
      </p>

      <KanbanOverlay
        open={confirmTarget !== null}
        onClose={() => {
          if (!statusMutation.isPending) setConfirmTarget(null);
        }}
        title={confirmTarget?.next === "suspended" ? "Suspend account" : "Restore account"}
        description={
          confirmTarget
            ? confirmTarget.next === "suspended"
              ? `${confirmTarget.user.fullName} will be signed out and blocked from signing in until restored.`
              : `${confirmTarget.user.fullName} will be able to sign in again.`
            : undefined
        }
        icon={
          confirmTarget?.next === "suspended" ? (
            <UserX size={14} className="text-red-500" aria-hidden />
          ) : (
            <UserCheck size={14} className="text-emerald-500" aria-hidden />
          )
        }
        busy={statusMutation.isPending}
        dismissable={!statusMutation.isPending}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              size="sm"
              className={[
                "h-6 px-2.5 text-[12px]",
                confirmTarget?.next === "suspended"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700",
              ].join(" ")}
              disabled={statusMutation.isPending}
              onClick={() => {
                const target = confirmTarget;
                if (!target) return;
                // Close first: the optimistic write already flipped the row.
                setConfirmTarget(null);
                statusMutation.mutate({ id: target.user.id, next: target.next });
              }}
            >
              {confirmTarget?.next === "suspended" ? "Suspend account" : "Restore account"}
            </Button>
          </div>
        }
      >
        {confirmTarget ? (
          <dl className={styles.confirmSummary}>
            <div>
              <dt>Name</dt>
              <dd>{confirmTarget.user.fullName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{confirmTarget.user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel(confirmTarget.user.role)}</dd>
            </div>
          </dl>
        ) : null}
      </KanbanOverlay>
    </section>
  );
}
