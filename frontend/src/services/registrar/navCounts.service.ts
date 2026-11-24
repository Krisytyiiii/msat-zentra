"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

/** One desk row: id plus a version that changes whenever the row changes. */
export interface RegistrarNavEntry {
  id: string;
  v: string;
}

export interface RegistrarNavQueues {
  overview: RegistrarNavEntry[];
  finalGrades: RegistrarNavEntry[];
  adviserAccess: RegistrarNavEntry[];
  sf10: RegistrarNavEntry[];
  subjects: RegistrarNavEntry[];
}

/**
 * One boolean per registrar sidebar page: true means the page has a row that is
 * new or changed since the registrar last opened it. The rail renders a dot,
 * not a number — the exact size of the queue is noise.
 */
export type RegistrarNavDots = Record<keyof RegistrarNavQueues, boolean>;

export const REGISTRAR_NAV_COUNTS_KEY = ["registrar-nav-counts"] as const;

const STORAGE_PREFIX = "zentra.registrar.nav.seen.";
const ROUTE_KEYS: Record<string, keyof RegistrarNavQueues> = {
  "/registrar/overview": "overview",
  "/registrar/final-grades": "finalGrades",
  "/registrar/adviser-access": "adviserAccess",
  "/registrar/sf10": "sf10",
  "/registrar/academics": "subjects",
};

/**
 * Query keys each badge page renders. When a queue's version map moves the
 * matching page data is invalidated *before* the dot is visible, so opening the
 * page never shows the pre-update board behind a fresh badge.
 */
export const NAV_QUEUE_QUERY_KEYS: Record<
  keyof RegistrarNavQueues,
  readonly (readonly string[])[]
> = {
  overview: [["registrar-overview"]],
  finalGrades: [["registrar-final-grades"]],
  adviserAccess: [["registrar-adviser-access"]],
  sf10: [["registrar-sf10"]],
  subjects: [["registrar-subjects"]],
};

export async function fetchRegistrarNavQueues(
  signal?: AbortSignal
): Promise<RegistrarNavQueues> {
  const { data } = await apiClient.get<RegistrarNavQueues>(
    "/api/registrar/nav-counts",
    { signal }
  );
  return data;
}

/** row id → version seen when the registrar last looked at this page. */
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

function writeSeen(key: string, entries: RegistrarNavEntry[]) {
  try {
    const map: SeenMap = {};
    for (const entry of entries) map[entry.id] = entry.v;
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(map));
  } catch {
    // Private mode / quota: the badge falls back to "everything is new".
  }
}

function activeKey(pathname: string): keyof RegistrarNavQueues | null {
  return ROUTE_KEYS[pathname.replace(/\/+$/, "")] ?? null;
}

const QUEUE_KEYS: (keyof RegistrarNavQueues)[] = [
  "overview",
  "finalGrades",
  "adviserAccess",
  "sf10",
  "subjects",
];

const ZERO_DOTS = Object.fromEntries(
  QUEUE_KEYS.map((key) => [key, false])
) as RegistrarNavDots;

const noopSubscribe = () => () => {};

/**
 * Sidebar dots mean "new or updated since you last opened this page", like the
 * bell's unread dot: opening a queue clears its dot, and a row that arrives
 * *or changes* afterwards brings it back.
 *
 * Realtime invalidates the query the moment a registrar notification lands, and
 * a 5s background poll keeps it honest when the socket is down (notifications
 * are the only published registrar stream, so the poll covers plain desk edits
 * that emit no fanout).
 */
export function useRegistrarNavDots(): RegistrarNavDots {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: [...REGISTRAR_NAV_COUNTS_KEY],
    queryFn: ({ signal }) => fetchRegistrarNavQueues(signal),
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
  // re-written on every refetch: a row that lands or changes while the
  // registrar is still on that page must raise the dot.
  const seenForQueueRef = React.useRef<keyof RegistrarNavQueues | null>(null);
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
    const has = (key: keyof RegistrarNavQueues) => {
      const seen = readSeen(key);
      return queue[key].some((entry) => seen[entry.id] !== entry.v);
    };
    return Object.fromEntries(QUEUE_KEYS.map((k) => [k, has(k)])) as RegistrarNavDots;
  }, [data, seenTick, isClient]);
}

/**
 * When a dot turns on, refresh that page's data first so opening the page never
 * shows the pre-update board behind a fresh badge. Writes that emit no realtime
 * frame are only discovered by the nav poll, so this keeps the dot and its page
 * in the same tick.
 */
export function useRegistrarNavDotInvalidation(dots: RegistrarNavDots) {
  const queryClient = useQueryClient();
  const previous = React.useRef<RegistrarNavDots>(ZERO_DOTS);
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
