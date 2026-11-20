"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import type { ScheduleSection } from "@/components/schedule/section-schedule-table";
import { ScheduleBoard } from "./components/schedule-board";
import { ScheduleSkeleton } from "./components/schedule-skeleton";
import page from "./components/schedule.module.css";

export default function PrincipalSchedulePage() {
  const { termReady } = useTerm();
  const sectionsQuery = useQuery<{ sections: ScheduleSection[] }>({
    queryKey: ["principal-schedule-sections"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ sections: ScheduleSection[] }>(
        "/api/academics/schedule/sections",
      );
      return data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: termReady,
  });

  const sections = sectionsQuery.data?.sections ?? [];
  const isEmpty = !sectionsQuery.isPending && !sectionsQuery.isError && sections.length === 0;
  const loading = sectionsQuery.isPending || !termReady;

  return (
    <section className={page.page} aria-busy={loading || undefined}>
      {sectionsQuery.isPending ? (
        <ScheduleSkeleton />
      ) : sectionsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load sections.
        </p>
      ) : isEmpty ? (
        <PageEmptyCallout>
          No sections yet for this school year. Sections for grades 7–12 will
          appear here once created.
        </PageEmptyCallout>
      ) : (
        <ScheduleBoard sections={sections} />
      )}
    </section>
  );
}
