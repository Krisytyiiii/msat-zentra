"use client";
import { useMemo } from "react";
import { useLiveQuery } from "@/lib/api/live";
import { apiClient } from "@/lib/api/client";
import { liveQueryOptions } from "@/lib/api/live";
import type { DayConfig } from "@/components/schedule/schedule-time";
export interface LinkedName {
  id: string;
  name: string;
  code: string | null;
}
export interface MySlot {
  day: number;
  period: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  subject: { id: string; name: string; code: string };
  section: { id: string; name: string; gradeLevel: string };
}
export interface AttendancePair {
  key: string;
  section: { id: string; name: string; gradeLevel: string | null };
  subject: { id: string; name: string; code: string } | null;
  slots: { day: number; period: number; status: "DRAFT" | "SUBMITTED" | "APPROVED" }[];
}
interface MyLoad {
  slots: MySlot[];
  config: DayConfig;
  meetupDays: Record<string, number[]>;
}
export function useAttendancePairs(termKey: string, linked: LinkedName | null) {
  // Published load only: the admin desk owns the timetable, teachers just read
  // the classes they teach and when they meet.
  const loadQuery = useLiveQuery<MyLoad>({
    queryKey: ["teacher-my-load", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<MyLoad>("/api/teacher/my-load");
      return data;
    },
    enabled: linked !== null,
    retry: false,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    ...liveQueryOptions,
  });
  const pairs = useMemo<AttendancePair[]>(() => {
    const list: AttendancePair[] = [];
    const byKey = new Map<string, AttendancePair>();
    const ordered = [...(loadQuery.data?.slots ?? [])].sort(
      (a, b) => a.day - b.day || a.period - b.period,
    );
    for (const s of ordered) {
      const key = `${s.section.id}|${s.subject.id}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          key,
          section: { id: s.section.id, name: s.section.name, gradeLevel: s.section.gradeLevel },
          subject: { ...s.subject },
          slots: [],
        };
        byKey.set(key, entry);
        list.push(entry);
      }
      entry.slots.push({ day: s.day, period: s.period, status: s.status });
    }
    return list;
  }, [loadQuery.data]);
  return {
    pairs,
    mySlotsQuery: loadQuery,
    configQuery: {
      data: loadQuery.data?.config ? { config: loadQuery.data.config } : undefined,
      isPending: loadQuery.isPending,
      isError: loadQuery.isError,
    },
  };
}
