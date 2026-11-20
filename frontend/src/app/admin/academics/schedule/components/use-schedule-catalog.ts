"use client";
import { useLiveQuery } from "@/lib/api/live";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import type { DayConfig } from "@/components/schedule/schedule-time";
import type { ScheduleSubject } from "../page";
export type CatalogTeacher = {
  id: string;
  name: string;
  code: string | null;
  linked: boolean;
  linkedName?: string | null;
  /** Rows pointing at the name — any link locks it from deletion. */
  links?: { timetableEntries: number; termGrants: number };
  /** True once a timetable slot, term grant, or linked account references it. */
  locked?: boolean;
};
export type ScheduleConfigPreset = DayConfig & {
  id: string;
  name: string;
  isActive: boolean;
};

export type ScheduleConfigPayload = {
  config: DayConfig;
  schoolYearId: string;
  activeId: string | null;
  presets: ScheduleConfigPreset[];
};

export function useScheduleCatalog(termKey: string) {
  void useTerm;
  const subjectsQuery = useLiveQuery<{ subjects: ScheduleSubject[] }>({
    queryKey: ["admin-schedule-subjects", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{ subjects: ScheduleSubject[] }>(
        "/api/admin/schedule/subjects",
      );
      return data;
    },
  });
  const teachersQuery = useLiveQuery<{ teachers: CatalogTeacher[] }>({
    queryKey: ["admin-schedule-teachers", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{ teachers: CatalogTeacher[] }>(
        "/api/admin/schedule/teachers",
      );
      return data;
    },
  });
  const configQuery = useLiveQuery<ScheduleConfigPayload>({
    queryKey: ["admin-schedule-config", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<ScheduleConfigPayload>("/api/admin/schedule/config");
      return data;
    },
  });
  const subjects = subjectsQuery.data?.subjects ?? [];
  const teachers = teachersQuery.data?.teachers ?? [];
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  return {
    subjectsQuery,
    teachersQuery,
    configQuery,
    subjects,
    teachers,
    subjectById,
    teacherById,
    activeConfig: configQuery.data?.config ?? null,
    presets: configQuery.data?.presets ?? [],
    activePresetId: configQuery.data?.activeId ?? null,
  };
}
