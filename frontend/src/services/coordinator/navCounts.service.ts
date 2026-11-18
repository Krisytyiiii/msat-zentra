"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

/** One queued case: id plus a version that changes whenever the case changes. */
export interface CoordinatorNavEntry {
  id: string;
  v: string;
}

export interface CoordinatorNavQueues {
  overview: CoordinatorNavEntry[];
  referrals: CoordinatorNavEntry[];
  enrolled: CoordinatorNavEntry[];
  certifications: CoordinatorNavEntry[];
  devices: CoordinatorNavEntry[];
}

/**
 * One boolean per coordinator sidebar page: true means the page has a row that
 * is new or changed since the coordinator last opened it. The rail renders a
 * dot, not a number — the exact size of the queue is noise.
 */
export type CoordinatorNavDots = Record<keyof CoordinatorNavQueues, boolean>;

export const COORDINATOR_NAV_COUNTS_KEY = ["coordinator-nav-counts"] as const;

const STORAGE_PREFIX = "zentra.coordinator.nav.seen.";
const ROUTE_KEYS: Record<string, keyof CoordinatorNavQueues> = {
  "/coordinator/overview": "overview",
  "/coordinator/referrals": "referrals",
  "/coordinator/enrolled": "enrolled",
  "/coordinator/files": "certifications",
  "/coordinator/devices": "devices",
};

/**
 * Query keys each badge page renders. When a queue's version map moves the
 * matching page data is invalidated *before* the dot is visible, so opening
 * the page never shows the pre-update board behind a fresh badge.
 */
export const NAV_QUEUE_QUERY_KEYS: Record<
  keyof CoordinatorNavQueues,
  readonly (readonly string[])[]
> = {
  overview: [["coordinator-dashboard"], ["coordinator-notifications"]],
  referrals: [["coordinator-referrals"], ["coordinator-dashboard"]],
  enrolled: [["coordinator-enrolled"]],
  certifications: [["coordinator-certifications"]],
  devices: [["coordinator-devices"]],
};

export async function fetchCoordinatorNavQueues(
  signal?: AbortSignal
): Promise<CoordinatorNavQueues> {
  const { data } = await apiClient.get<CoordinatorNavQueues>(
    "/api/adm/nav-counts",
    { signal },
  );
  return data;
}

/** case id → version seen when the coordinator last looked at this page. */
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

function writeSeen(key: string, entries: CoordinatorNavEntry[]) {
  try {
    const map: SeenMap = {};
    for (const entry of entries) map[entry.id] = entry.v;
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(map));
  } catch {
    // Private mode / quota: the badge falls back to "everything is new".
  }
}

function activeKey(pathname: string): keyof CoordinatorNavQueues | null {
  return ROUTE_KEYS[pathname.replace(/\/+$/, "")] ?? null;
}

const QUEUE_KEYS: (keyof CoordinatorNavQueues)[] = [
  "overview",
  "referrals",
  "enrolled",
  "certifications",
  "devices",
];

const ZERO_DOTS = Object.fromEntries(
  QUEUE_KEYS.map((key) => [key, false]),
) as CoordinatorNavDots;

const noopSubscribe = () => () => {};

/**
 * Sidebar dots mean "new or updated since you last opened this page", like the
 * bell's unread dot: opening a queue clears its dot, and a case that arrives
 * *or changes* afterwards brings it back.
 *
 * Realtime invalidates the query the moment a coordinator table changes, and a
 * 5s background poll keeps it honest when the socket is down (the coordinator
 * channel only receives notifications, so the poll is the main fallback for
 * plain ADM edits).
 */
export function useCoordinatorNavDots(): CoordinatorNavDots {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: [...COORDINATOR_NAV_COUNTS_KEY],
    queryFn: ({ signal }) => fetchCoordinatorNavQueues(signal),
    // 60s visible-tab poll: realtime is the fast path, and a hidden tab shows no
    // dots. Each poll is a Postgres round trip billed as Supabase egress.
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
  // re-written on every refetch: a case that lands or changes while the
  // coordinator is still on that page must raise the dot.
  const seenForQueueRef = React.useRef<keyof CoordinatorNavQueues | null>(null);
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
    const has = (key: keyof CoordinatorNavQueues) => {
      const seen = readSeen(key);
      return queue[key].some((entry) => seen[entry.id] !== entry.v);
    };
    return Object.fromEntries(QUEUE_KEYS.map((k) => [k, has(k)])) as CoordinatorNavDots;
  }, [data, seenTick, isClient]);
}

/**
 * When a dot turns on, refresh that page's data first so opening the page never
 * shows the pre-update board behind a fresh badge. Writes that emit no realtime
 * frame are only discovered by the nav poll, so this keeps the dot and its page
 * in the same tick.
 */
export function useCoordinatorNavDotInvalidation(dots: CoordinatorNavDots) {
  const queryClient = useQueryClient();
  const previous = React.useRef<CoordinatorNavDots>(ZERO_DOTS);
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
