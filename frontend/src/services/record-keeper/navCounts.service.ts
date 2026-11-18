"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

/** One desk row: id plus a version that changes whenever the row changes. */
export interface RecordKeeperNavEntry {
  id: string;
  v: string;
}

export interface RecordKeeperNavQueues {
  overview: RecordKeeperNavEntry[];
  finalGrades: RecordKeeperNavEntry[];
  accounts: RecordKeeperNavEntry[];
  adviserAccess: RecordKeeperNavEntry[];
  sf10: RecordKeeperNavEntry[];
  subjects: RecordKeeperNavEntry[];
}

/**
 * One boolean per record-keeper sidebar page: true means the page has a row
 * that is new or changed since the keeper last opened it. The rail renders a
 * dot, not a number — the exact size of the queue is noise.
 */
export type RecordKeeperNavDots = Record<keyof RecordKeeperNavQueues, boolean>;

export const RECORD_KEEPER_NAV_COUNTS_KEY = ["record-keeper-nav-counts"] as const;

const STORAGE_PREFIX = "zentra.record-keeper.nav.seen.";
const ROUTE_KEYS: Record<string, keyof RecordKeeperNavQueues> = {
  "/record-keeper/overview": "overview",
  "/record-keeper/final-grades": "finalGrades",
  "/record-keeper/accounts": "accounts",
  "/record-keeper/adviser-access": "adviserAccess",
  "/record-keeper/sf10": "sf10",
  "/record-keeper/academics": "subjects",
};

/**
 * Query keys each badge page renders. When a queue's version map moves the
 * matching page data is invalidated *before* the dot is visible, so opening
 * the page never shows the pre-update board behind a fresh badge.
 */
export const NAV_QUEUE_QUERY_KEYS: Record<
  keyof RecordKeeperNavQueues,
  readonly (readonly string[])[]
> = {
  overview: [["record-keeper-overview"]],
  finalGrades: [["record-keeper-final-grades"]],
  accounts: [
    ["record-keeper-pending-students"],
    ["record-keeper-account-breakdown"],
    ["record-keeper-accounts-audit"],
  ],
  adviserAccess: [["record-keeper-adviser-access"]],
  sf10: [["record-keeper-sf10"]],
  subjects: [["record-keeper-subjects"]],
};

export async function fetchRecordKeeperNavQueues(
  signal?: AbortSignal
): Promise<RecordKeeperNavQueues> {
  const { data } = await apiClient.get<RecordKeeperNavQueues>(
    "/api/record-keeper/nav-counts",
    { signal }
  );
  return data;
}

/** row id → version seen when the keeper last looked at this page. */
type SeenMap = Record<string, string>;

function readSeen(key: string): SeenMap {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: SeenMap = {};
    for (const [id, version] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof version === "string") map[id] = version;
    }
    return map;
  } catch {
    return {};
  }
}

function writeSeen(key: string, entries: RecordKeeperNavEntry[]) {
  try {
    const map: SeenMap = {};
    for (const entry of entries) map[entry.id] = entry.v;
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(map));
  } catch {
    // Private mode / quota: the badge falls back to "everything is new".
  }
}

function activeKey(pathname: string): keyof RecordKeeperNavQueues | null {
  return ROUTE_KEYS[pathname.replace(/\/+$/, "")] ?? null;
}

const QUEUE_KEYS: (keyof RecordKeeperNavQueues)[] = [
  "overview",
  "finalGrades",
  "accounts",
  "adviserAccess",
  "sf10",
  "subjects",
];

const ZERO_DOTS = Object.fromEntries(
  QUEUE_KEYS.map((key) => [key, false])
) as RecordKeeperNavDots;

const noopSubscribe = () => () => {};

/**
 * Sidebar dots mean "new or updated since you last opened this page", like the
 * bell's unread dot: opening a queue clears its dot, and a row that arrives
 * *or changes* afterwards brings it back.
 *
 * Realtime invalidates the query the moment a keeper notification lands, and a
 * 5s background poll keeps it honest when the socket is down (notifications
 * are the only published record-keeper stream, so the poll covers plain desk
 * edits that emit no fanout).
 */
export function useRecordKeeperNavDots(): RecordKeeperNavDots {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: [...RECORD_KEEPER_NAV_COUNTS_KEY],
    queryFn: ({ signal }) => fetchRecordKeeperNavQueues(signal),
    // 60s visible-tab poll: the Notification stream is the fast path, and a
    // hidden tab shows no dots. Each poll is a Postgres round trip billed as
    // Supabase organization egress.
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // LocalStorage is a client-only external store; keep the first hydration
  // render consistent without a mount-state effect.
  const isClient = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const openQueue = isClient ? activeKey(pathname) : null;

  // Entering a queue marks what was already there as seen. Deliberately not
  // re-written on every refetch: a row that lands or changes while the keeper
  // is still on that page must raise the dot.
  const seenForQueueRef = React.useRef<keyof RecordKeeperNavQueues | null>(null);
  const [seenTick, bumpSeen] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!isClient) return;
    if (!openQueue) {
      seenForQueueRef.current = null;
      return;
    }
    if (!data || seenForQueueRef.current === openQueue) return;
    seenForQueueRef.current = openQueue;
    writeSeen(openQueue, data[openQueue]);
    bumpSeen();
  }, [isClient, data, openQueue]);

  return React.useMemo(() => {
    if (!isClient) return ZERO_DOTS;
    // Re-read localStorage whenever the "seen" snapshot changes, even if the
    // queue payload is the same object.
    void seenTick;
    const queue = data;
    if (!queue) return ZERO_DOTS;
    const has = (key: keyof RecordKeeperNavQueues) => {
      const seen = readSeen(key);
      return queue[key].some((entry) => seen[entry.id] !== entry.v);
    };
    return Object.fromEntries(QUEUE_KEYS.map((k) => [k, has(k)])) as RecordKeeperNavDots;
  }, [data, seenTick, isClient]);
}

/**
 * When a dot turns on, refresh that page's data first so opening the page never
 * shows the pre-update board behind a fresh badge. Writes that emit no realtime
 * frame are only discovered by the nav poll, so this keeps the dot and its page
 * in the same tick.
 */
export function useRecordKeeperNavDotInvalidation(dots: RecordKeeperNavDots) {
  const queryClient = useQueryClient();
  const previous = React.useRef<RecordKeeperNavDots>(ZERO_DOTS);
  React.useEffect(() => {
    for (const key of QUEUE_KEYS) {
      if (!dots[key] || previous.current[key]) continue;
      for (const queryKey of NAV_QUEUE_QUERY_KEYS[key]) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    }
    previous.current = dots;
  }, [dots, queryClient]);
}
