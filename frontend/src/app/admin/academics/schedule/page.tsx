"use client";

import { useLiveQuery } from "@/lib/api/live";
import { useTerm } from "@/lib/term/TermContext";
import { apiClient } from "@/lib/api/client";
import type { StatusEntry } from "@/components/schedule/SectionScheduleCard";

import { ScheduleEmptyKanban } from "./components/schedule-empty-kanban";
import { ScheduleOverviewBoard } from "./components/schedule-overview-board";
import { ScheduleOverviewSkeleton } from "./components/schedule-overview-skeleton";

export interface ScheduleSubject {
  id: string;
  name: string;
  code: string;
  gradeLevel: string;
  category: string;
  /** Records pointing at the subject — any link locks it from deletion. */
  links?: {
    timetableEntries: number;
    assignments: number;
    gradebook: number;
  };
  /** True once a timetable/assignment/gradebook record references it. */
  locked?: boolean;
}

interface Assignment {
  id: string;
  subjectId: string;
  sectionId: string;
  subject: ScheduleSubject;
  section: { name: string; gradeLevel: string };
}

export interface ScheduleSection {
  id: string;
  name: string;
  gradeLevel: string;
  adviserId: string | null;
  adviser: { fullName: string } | null;
  /** Pending adviser name (principal's assign desk) — claimed when adviserId lands. */
  adviserLabel?: string | null;
  /** Advisory access code issued with the section; the adviser claims with it. */
  adviserCode?: string | null;
  _count: { students: number; teacherAssignments?: number };
  teacherAssignments: Assignment[];
  timetableEntries: TimetableEntry[];
  /** Rows pointing at the section — any link locks it from deletion. */
  links?: { learners: number; records: number };
  /** True once a learner or record references the section. */
  locked?: boolean;
}

export type ScheduleSectionSummary = Omit<ScheduleSection, "timetableEntries"> & {
  timetableEntries: StatusEntry[];
};

export interface TimetableEntry {
  subjectId: string;
  teacherNameId: string | null;
  day: number;
  period: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  reviewNote: string | null;
  subject: { id: string; name: string; code: string };
  teacherName: { id: string; name: string } | null;
}

interface ScheduleData {
  sections: ScheduleSectionSummary[];
}

function ScheduleSkeleton() {
  return <ScheduleOverviewSkeleton />;
}

export default function AdminSchedulePage() {
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  const {
    data: schedData,
    isLoading: schedIsLoading,
    isError: schedIsError,
  } = useLiveQuery<ScheduleData>({
    queryKey: ["admin-schedule-summary", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<ScheduleData>("/api/admin/schedule?summary=1");
      return data;
    },
  });

  if (schedIsLoading) {
    return (
      <section className="flex w-full flex-col">
        <ScheduleSkeleton />
      </section>
    );
  }

  if (schedIsError || !schedData) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <p role="alert" className="text-sm text-destructive">Could not load schedule.</p>
      </section>
    );
  }

  const sections = schedData.sections;
  const gradeNumber = (g: string) => Number(g.replace("G", "")) || 0;
  const orderedSections = [...sections].sort(
    (a, b) => gradeNumber(a.gradeLevel) - gradeNumber(b.gradeLevel) || a.name.localeCompare(b.name),
  );

  // Empty desk: one centered starter card holding the real actions (open the
  // template workspace, its school-day config, or its section creator) instead
  // of a multi-column starter board.
  if (orderedSections.length === 0) {
    return (
      <section
        aria-labelledby="admin-schedule-empty"
        className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center py-10 lg:min-h-[calc(100dvh-5rem)]"
      >
        <ScheduleEmptyKanban />
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col">
      <ScheduleOverviewBoard sections={orderedSections} />
    </section>
  );
}
