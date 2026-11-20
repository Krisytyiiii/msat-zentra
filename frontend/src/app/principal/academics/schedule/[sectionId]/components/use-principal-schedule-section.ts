"use client";
import { useQuery } from "@tanstack/react-query";
import { Check, Inbox } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import {
  buildTimetable,
  type DayConfig,
} from "@/components/schedule/schedule-time";
import { findSectionByRef } from "../../components/section-path";
export interface SubmissionEntry {
  day: number;
  period: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  subject: { id: string; name: string; code: string };
  teacherName: { id: string; name: string } | null;
}
export interface Submission {
  id: string;
  name: string;
  gradeLevel: string;
  adviser: { fullName: string } | null;
  timetableEntries: SubmissionEntry[];
}
interface SectionsPayload {
  sections: Submission[];
  config: DayConfig;
}
/**
 * Read-only view of a section's published timetable. The administrator desk
 * owns the editor and publishing — there is no submit/approve step here.
 */
export function usePrincipalScheduleSection(sectionRef: string) {
  const sectionsQuery = useQuery<SectionsPayload, unknown, Submission | null>({
    queryKey: ["principal-schedule-sections"],
    queryFn: async () => {
      const { data } = await apiClient.get<SectionsPayload>(
        "/api/academics/schedule/sections",
      );
      return data;
    },
    select: (d) => findSectionByRef(d.sections, sectionRef),
    staleTime: 30_000,
  });
  const configQuery = useQuery<SectionsPayload, unknown, DayConfig | null>({
    queryKey: ["principal-schedule-sections"],
    queryFn: async () => {
      const { data } = await apiClient.get<SectionsPayload>(
        "/api/academics/schedule/sections",
      );
      return data;
    },
    select: (d) => d.config ?? null,
    staleTime: 30_000,
  });
  const submission = sectionsQuery.data ?? null;
  const config = configQuery.data ?? null;
  const rows = config ? buildTimetable(config) : [];
  const entryByKey = new Map(
    (submission?.timetableEntries ?? []).map((e) => [`${e.day}:${e.period}`, e]),
  );
  const entries = submission?.timetableEntries ?? [];
  const counts = {
    total: entries.length,
    published: entries.filter((e) => e.status === "APPROVED").length,
  };
  const capacity =
    rows.filter((row) => row.kind === "period").length * 5;
  const emptyCount = Math.max(0, capacity - counts.total);
  const statusMeta =
    counts.total === 0
      ? {
          title: "No schedule",
          message: "The administrator has not published a timetable for this section yet.",
          Icon: Inbox,
        }
      : {
          title: "Published",
          message: "Official timetable for the selected term.",
          Icon: Check,
        };
  return {
    sectionsQuery,
    configQuery,
    submission,
    config,
    rows,
    entryByKey,
    counts,
    capacity,
    emptyCount,
    statusMeta,
  };
}
export type { Submission as SubmissionType };
export type SlotFilter = "all" | "approved";
