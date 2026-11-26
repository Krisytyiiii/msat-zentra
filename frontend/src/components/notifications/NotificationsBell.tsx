"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@/lib/api/live";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardModal } from "@/components/ui/CardModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import {
  formatBellDate,
  prettifyNotificationType,
  type BellNotificationTarget,
} from "@/lib/notifications/label";
import styles from "./notifications-bell.module.css";

export interface BellNotice {
  id: string;
  type: string;
  sourceTable: string | null;
  sourceId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
  /** Present on the admin's system-wide feed. */
  recipientName?: string | null;
  recipientRole?: string | null;
}

const VISIBLE_COUNT = 5;

function bellApiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function fetchBellNotices(
  path: string,
  signal?: AbortSignal,
): Promise<BellNotice[]> {
  const { data } = await apiClient.get<BellNotice[]>(path, {
    signal,
  });
  return Array.isArray(data) ? data : [];
}

interface NotificationsBellProps {
  queryKey: string[];

  refreshKeys?: string[][];

  resolveTarget: (n: BellNotice) => BellNotificationTarget;

  titleFor?: (n: BellNotice) => string;

  /** Feed endpoint. Defaults to the signed-in user's own notifications. */
  fetchPath?: string;

  /**
   * System feeds (the administrator's console) list other users' notices, so
   * they cannot be marked read from this bell — rows only deep-link.
   */
  readOnly?: boolean;

  /** Recipient line for system feeds, e.g. "Jane Cruz · Teacher". */
  recipientLabel?: (n: BellNotice) => string | null;

  /**
   * System feeds have no per-user read state, so they mark new items against a
   * stored "seen" stamp instead: notices newer than this ISO timestamp count as
   * new.
   */
  seenAt?: string | null;

  /** Called with the newest notice timestamp when the feed is opened. */
  onSeen?: (latestIso: string | null) => void;
}

export function NotificationsBell({
  queryKey,
  refreshKeys,
  resolveTarget,
  titleFor,
  fetchPath = "/api/notifications/",
  readOnly = false,
  recipientLabel,
  seenAt = null,
  onSeen,
}: NotificationsBellProps) {
  const titleOf = titleFor ?? ((n: BellNotice) => prettifyNotificationType(n.type));
  const router = useRouter();
  const queryClient = useQueryClient();
  const [viewAllOpen, setViewAllOpen] = React.useState(false);
  const targets = refreshKeys ?? [queryKey];

  const notificationsQuery = useLiveQuery({
    queryKey,
    queryFn: ({ signal }) => fetchBellNotices(fetchPath, signal),
    staleTime: 30_000,
  });

  // Badge uses a dedicated count so it reflects the true unread total, not just
  // the unread items within the first page of the list. A system feed has no
  // per-user read state of its own.
  const unreadQuery = useLiveQuery({
    queryKey: [...queryKey, "unread-count"],
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<{ count: number }>(
        "/api/notifications/unread-count",
        { signal },
      );
      return typeof data?.count === "number" ? data.count : 0;
    },
    staleTime: 30_000,
    enabled: !readOnly,
  });

  const notifications = notificationsQuery.data ?? [];
  const latestCreatedAt = React.useMemo(() => {
    let latest: string | null = null;
    let latestMs = -Infinity;
    for (const n of notifications) {
      const ms = Date.parse(n.createdAt);
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms;
        latest = n.createdAt;
      }
    }
    return latest;
  }, [notifications]);

  const newSince = React.useMemo(() => {
    if (!readOnly) return 0;
    if (!seenAt) return 0;
    const since = Date.parse(seenAt);
    if (!Number.isFinite(since)) return 0;
    return notifications.filter((n) => {
      const ms = Date.parse(n.createdAt);
      return Number.isFinite(ms) && ms > since;
    }).length;
  }, [readOnly, seenAt, notifications]);

  const unread = readOnly
    ? newSince
    : unreadQuery.data ?? notifications.filter((n) => !n.isRead).length;

  const refresh = () => {
    for (const key of targets) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const readOneMutation = useMutation({
    mutationFn: async ({ id, href }: { id: string; href: string | null }) => {
      await apiClient.post(`/api/notifications/read/${id}`, {});
      return { href };
    },
    onSuccess: ({ href }) => {
      refresh();
      if (href) {
        setViewAllOpen(false);
        router.push(href);
      } else
        toast.success({
          title: "Notification updated",
          description: "The notification was marked as read.",
        });
    },
    onError: (err) =>
      toast.error({
        title: "Could not mark as read",
        description: bellApiErrorMessage(err, "Could not mark this notification as read."),
      }),
  });

  const readAllMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post("/api/notifications/read-all", {});
      return data;
    },
    onSuccess: () => {
      refresh();
      toast.success({
        title: "All caught up",
        description: "Every notification is marked as read.",
      });
    },
    onError: (err) =>
      toast.error({
        title: "Could not mark all as read",
        description: bellApiErrorMessage(err, "Could not mark notifications as read."),
      }),
  });

  const readingId = readOneMutation.isPending
    ? ((readOneMutation.variables as { id: string } | undefined)?.id ?? null)
    : null;

  const openNotice = (n: BellNotice) => {
    const target = resolveTarget(n);
    // A system feed row belongs to another user; this bell only deep-links.
    if (readOnly) {
      if (target) {
        setViewAllOpen(false);
        router.push(target.href);
      }
      return;
    }
    if (readingId === n.id) return;
    if (!n.isRead) readOneMutation.mutate({ id: n.id, href: target?.href ?? null });
    else if (target) {
      setViewAllOpen(false);
      router.push(target.href);
    }
  };

  const renderBody = (n: BellNotice) => {
    const recipient = recipientLabel?.(n) ?? null;
    return (
      <>
        {readOnly ? null : (
          <span
            className={`${styles.bellDot} ${!n.isRead ? styles.bellDotUnread : ""}`}
            aria-hidden="true"
          />
        )}
        <span className={styles.bellMain}>
          <span className={styles.bellTitle}>{titleOf(n)}</span>
          <span
            className={styles.bellMsg}
            data-profile-created={
              /created the learner profile/i.test(n.message ?? "")
                ? "true"
                : undefined
            }
          >
            {n.message}
          </span>
          <span className={styles.bellDate}>
            {recipient ? `${recipient} · ` : ""}
            {formatBellDate(n.createdAt)}
            {readingId === n.id ? " · Marking…" : ""}
          </span>
        </span>
      </>
    );
  };

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) onSeen?.(latestCreatedAt);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={styles.bellButton}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <Bell className={styles.bellIcon} aria-hidden="true" />
            {unread > 0 ? (
              <span className={styles.bellBadge} aria-hidden="true" aria-live="polite">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={`${styles.bellMenu} ${styles.bellMenuDrop}`}>
          <DropdownMenuLabel className={styles.bellHead}>
            <span>
              {unread === 0
                ? "Notifications"
                : `${unread} unread notification${unread === 1 ? "" : "s"}`}
            </span>
            {!readOnly && unread > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                disabled={readAllMutation.isPending}
                onClick={() => readAllMutation.mutate()}
              >
                {readAllMutation.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : null}
                {readAllMutation.isPending ? "Marking…" : "Mark all read"}
              </Button>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notificationsQuery.isPending ? (
            <DropdownMenuItem disabled>Loading notifications…</DropdownMenuItem>
          ) : notificationsQuery.isError ? (
            <DropdownMenuItem
              disabled={notificationsQuery.isRefetching}
              onSelect={(e) => {
                e.preventDefault();
                void notificationsQuery.refetch();
              }}
            >
              Could not load notifications — select to retry.
            </DropdownMenuItem>
          ) : notifications.length === 0 ? (
            <DropdownMenuItem disabled>No notifications yet.</DropdownMenuItem>
          ) : (
            notifications.slice(0, VISIBLE_COUNT).map((n) => {
              const target = resolveTarget(n);
              return (
                <DropdownMenuItem
                  key={n.id}
                  disabled={
                    readOnly ? !target : readingId === n.id || (n.isRead && !target)
                  }
                  onSelect={(e) => {
                    e.preventDefault();
                    openNotice(n);
                  }}
                  className={styles.bellItem}
                >
                  {renderBody(n)}
                </DropdownMenuItem>
              );
            })
          )}
          {notifications.length > VISIBLE_COUNT ? (
            <>
              <DropdownMenuSeparator />
              <button
                type="button"
                className={styles.viewAll}
                onClick={() => setViewAllOpen(true)}
              >
                View all ({notifications.length})
              </button>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {viewAllOpen ? (
        <CardModal
          open
          onClose={() => setViewAllOpen(false)}
          size="md"
          title="Notifications"
          description={
            readOnly
              ? newSince > 0
                ? `${newSince} new update${newSince === 1 ? "" : "s"} since you last checked.`
                : "Latest activity across every desk."
              : unread === 0
                ? "You're all caught up."
                : `${unread} unread notification${unread === 1 ? "" : "s"}.`
          }
          watchKey={[notifications.length, unread, readingId]}
        >
            <div className={styles.modalList} aria-label="All notifications">
              {notifications.map((n) => {
                const target = resolveTarget(n);
                return (
                  <button
                    key={n.id}
                    type="button"
                    disabled={
                      readOnly ? !target : readingId === n.id || (n.isRead && !target)
                    }
                    onClick={() => openNotice(n)}
                    className={styles.modalItem}
                  >
                    {renderBody(n)}
                  </button>
                );
              })}
            </div>
        </CardModal>
      ) : null}
    </>
  );
}
