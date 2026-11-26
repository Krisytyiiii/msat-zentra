"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

/** One page version: the id plus a version that changes whenever the page does. */
export interface AdminNavEntry {
  id: string;
  v: string;
}

export interface AdminNavQueues {
  overview: AdminNavEntry[];
  schedule: AdminNavEntry[];
  timetable: AdminNavEntry[];
  sections: AdminNavEntry[];
  subjects: AdminNavEntry[];
  teachers: AdminNavEntry[];
  configure: AdminNavEntry[];
  schoolYear: AdminNavEntry[];
  publish: AdminNavEntry[];
  noClassDays: AdminNavEntry[];
  users: AdminNavEntry[];
  pending: AdminNavEntry[];
  audit: AdminNavEntry[];
  notifications: AdminNavEntry[];
}

/**
 * One boolean per administrator sidebar page: true means the page has data
 * that changed since the administrator last opened it. The rail renders a dot,
 * not a number — the console only needs "something moved".
 */
export type AdminNavDots = Record<keyof AdminNavQueues, boolean>;

export const ADMIN_NAV_COUNTS_KEY = ["admin", "nav-counts"] as const;

const STORAGE_PREFIX = "zentra.admin.nav.seen.";
const ROUTE_KEYS: Record<string, keyof AdminNavQueues> = {
  "/admin/overview": "overview",
  "/admin/academics/schedule": "schedule",
  "/admin/academics/schedule/timetable": "timetable",
  "/admin/academics/schedule/sections": "sections",
  "/admin/academics/schedule/subjects": "subjects",
  "/admin/academics/schedule/teachers": "teachers",
  "/admin/academics/schedule/configure": "configure",
  "/admin/academics/schedule/school-year": "schoolYear",
  "/admin/academics/schedule/publish": "publish",
  "/admin/attendance/no-class-days": "noClassDays",
  "/admin/users": "users",
  "/admin/users/pending": "pending",
  "/admin/audit": "audit",
};

/**
 * Query keys each badged page renders. When a page's version moves, that
 * page's data is invalidated *before* the dot is visible, so opening it never
 * shows the pre-update board behind a fresh badge.
 */
export const NAV_QUEUE_QUERY_KEYS: Record<
  keyof AdminNavQueues,
  readonly (readonly string[])[]
> = {
  overview: [["admin", "overview"]],
  schedule: [["admin-schedule"]],
  timetable: [["admin-schedule-section"], ["admin-schedule-summary"]],
  sections: [["admin-schedule"]],
  subjects: [["admin-schedule-subjects"]],
  teachers: [["admin-schedule-teachers"]],
  configure: [["admin-schedule"]],
  schoolYear: [["admin-schedule-school-years"], ["term-picker"]],
  publish: [["admin-schedule-summary"]],
  noClassDays: [["admin", "no-class-days"]],
  users: [["admin", "users"]],
  pending: [["admin", "account-approvals"], ["admin", "users"]],
  audit: [["admin", "audit"]],
  notifications: [["admin-notifications"]],
};

export async function fetchAdminNavQueues(
  signal?: AbortSignal,
): Promise<AdminNavQueues> {
  const { data } = await apiClient.get<AdminNavQueues>("/api/admin/nav-counts", {
    signal,
  });
  return data;
}

/** page key → version seen when the admin last looked at that page. */
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

function writeSeen(key: string, entries: AdminNavEntry[]) {
  try {
    const map: SeenMap = {};
    for (const entry of entries) map[entry.id] = entry.v;
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(map));
  } catch {
    // Private mode / quota: the dot falls back to "everything is new".
  }
}

function activeKey(pathname: string): keyof AdminNavQueues | null {
  return ROUTE_KEYS[pathname.replace(/\/+$/, "")] ?? null;
}

const QUEUE_KEYS: (keyof AdminNavQueues)[] = [
  "overview",
  "schedule",
  "timetable",
  "sections",
  "subjects",
  "teachers",
  "configure",
  "schoolYear",
  "publish",
  "noClassDays",
  "users",
  "pending",
  "audit",
  "notifications",
];

const ZERO_DOTS = Object.fromEntries(
  QUEUE_KEYS.map((key) => [key, false]),
) as AdminNavDots;

const noopSubscribe = () => () => {};

/**
 * Sidebar dots mean "changed since you last opened that page", like the bell's
 * unread dot: opening a page clears its dot, and data that arrives or changes
 * afterwards brings it back. The console has no realtime stream of its own
 * (RLS scopes the published tables per role), so a visible-tab poll is the
 * source of truth.
 */
export function useAdminNavDots(): AdminNavDots {
  const pathname = usePathname();
  const { data } = useQuery({
    queryKey: [...ADMIN_NAV_COUNTS_KEY],
    queryFn: ({ signal }) => fetchAdminNavQueues(signal),
    // Each poll is a full pooler round trip; the rail only needs to keep up
    // with work happening on other desks, not sub-second.
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const isClient = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const openPage = isClient ? activeKey(pathname) : null;

  // Entering a page marks what was already there as seen. Deliberately not
  // re-written on every refetch: data that lands while the admin is still on
  // that page must raise the dot.
  const seenForPageRef = React.useRef<keyof AdminNavQueues | null>(null);
  const [seenTick, bumpSeen] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!isClient) return;
    if (!openPage) {
      seenForPageRef.current = null;
      return;
    }
    if (!data || seenForPageRef.current === openPage) return;
    seenForPageRef.current = openPage;
    writeSeen(openPage, data[openPage]);
    bumpSeen();
  }, [isClient, data, openPage]);

  return React.useMemo(() => {
    if (!isClient) return ZERO_DOTS;
    // Re-read localStorage whenever the "seen" snapshot changes, even if the
    // queue payload is the same object.
    void seenTick;
    const queue = data;
    if (!queue) return ZERO_DOTS;
    const has = (key: keyof AdminNavQueues) => {
      const seen = readSeen(key);
      return queue[key].some((entry) => seen[entry.id] !== entry.v);
    };
    return Object.fromEntries(QUEUE_KEYS.map((k) => [k, has(k)])) as AdminNavDots;
  }, [data, seenTick, isClient]);
}

/**
 * When a dot turns on, refresh that page's data first so opening the page never
 * shows the pre-update board behind a fresh badge.
 */
export function useAdminNavDotInvalidation(dots: AdminNavDots) {
  const queryClient = useQueryClient();
  const previous = React.useRef<AdminNavDots>(ZERO_DOTS);
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
