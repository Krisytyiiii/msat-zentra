"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListFilter, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Button } from "@/components/ui/button";
import { PrincipalPageHeader } from "../../../components/PrincipalPageHeader";
import { KpiStrip } from "./components/KpiStrip";
import { SubjectTrendChart } from "./components/SubjectTrendChart";
import { SubjectSectionBreakdown } from "./components/SubjectSectionBreakdown";
import { NeedsAttentionList } from "./components/NeedsAttentionList";
import {
  ALL_GRADES,
  gradeSortKey,
  round1,
  type AttentionItem,
  type BackendAcademicSummary,
  type CellData,
  type UngradedStudent,
} from "./components/types";
import shell from "../components/heatmap.module.css";

function isBelow75(avg: number, subjectCount: number): boolean {
  return subjectCount > 0 && avg < 75;
}

export default function PrincipalAcademicHeatmapsPage() {
  // Subject Trends always lists every grade level — no grade filter tabs.
  const gradeFilter = ALL_GRADES;

  const { activeTerm, termReady } = useTerm();
  const termId = activeTerm?.termId ?? null;
  const { data, isPending } = useQuery({
    queryKey: ["academic-insights", "live", termId],
    queryFn: async () => {
      const res = await apiClient.get<BackendAcademicSummary>("/api/academics", {
        params: { mode: "raw" },
      });
      return res.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: termReady,
  });

  const sections = React.useMemo(() => {
    const list = data?.sections ?? [];
    return [...list].sort(
      (a, b) =>
        gradeSortKey(a.grade) - gradeSortKey(b.grade) ||
        a.section.localeCompare(b.section)
    );
  }, [data]);

  const allStudents = React.useMemo(
    () => sections.flatMap((s) => s.students),
    [sections]
  );
  const gradedStudents = React.useMemo(
    () => allStudents.filter((st) => st.subjects.length > 0),
    [allStudents]
  );
  const below = React.useMemo(
    () =>
      gradedStudents.filter((st) => isBelow75(st.overallAverage, st.subjects.length))
        .length,
    [gradedStudents]
  );
  const sharedStudents = React.useMemo(
    () =>
      sections
        .filter((s) => s.shared === true)
        .reduce((n, s) => n + s.students.length, 0),
    [sections]
  );
  const ungradedStudents = React.useMemo<UngradedStudent[]>(() => {
    const rows: UngradedStudent[] = [];
    for (const section of sections) {
      if (section.shared !== true) continue;
      for (const student of section.students) {
        if (student.subjects.length > 0) continue;
        rows.push({
          studentId: student.studentId,
          name: student.name,
          lrn: student.lrn,
          mascot: student.mascot,
          section: section.section,
          grade: section.grade,
        });
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [sections]);
  const ungraded = ungradedStudents.length;
  const riskySections = React.useMemo(
    () =>
      sections.filter((s) =>
        s.students.some((st) => isBelow75(st.overallAverage, st.subjects.length))
      ).length,
    [sections]
  );

  const { data: catalog } = useQuery({
    queryKey: ["academic-subject-catalog"],
    queryFn: async () => {
      const res = await apiClient.get<{
        subjects: { name: string; gradeLevel: number }[];
      }>("/api/academics/assign/subjects");
      return res.data.subjects ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const subjects = React.useMemo(() => {
    const set = new Set<string>();
    const wanted =
      gradeFilter === ALL_GRADES
        ? null
        : Number(String(gradeFilter).replace(/\D/g, ""));
    for (const c of catalog ?? []) {
      if (wanted == null || c.gradeLevel === wanted) set.add(c.name);
    }
    for (const s of sections) {
      if (gradeFilter !== ALL_GRADES && s.grade !== gradeFilter) continue;
      for (const st of s.students) {
        for (const subj of st.subjects) set.add(subj.subject);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sections, catalog, gradeFilter]);

  const cellByKey = React.useMemo(() => {
    const acc = new Map<string, { sum: number; count: number; below: number }>();
    for (const s of sections) {
      for (const st of s.students) {
        for (const subj of st.subjects) {
          const key = `${s.sectionId}::${subj.subject}`;
          const entry = acc.get(key) ?? { sum: 0, count: 0, below: 0 };
          entry.sum += subj.transmutedGrade;
          entry.count += 1;
          if (subj.transmutedGrade < 75) entry.below += 1;
          acc.set(key, entry);
        }
      }
    }
    const out: Record<string, CellData> = {};
    for (const [key, entry] of acc) {
      if (entry.count === 0) continue;
      out[key] = {
        avg: round1(entry.sum / entry.count),
        graded: entry.count,
        below: entry.below,
      };
    }
    return out;
  }, [sections]);

  const attention = React.useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    for (const s of sections) {
      for (const subj of subjects) {
        const cell = cellByKey[`${s.sectionId}::${subj}`];
        if (cell && cell.avg < 75) {
          items.push({
            sectionId: s.sectionId,
            section: s.section,
            subject: subj,
            avg: cell.avg,
            graded: cell.graded,
            below: cell.below,
          });
        }
      }
    }
    return items.sort((a, b) => a.avg - b.avg).slice(0, 8);
  }, [sections, subjects, cellByKey]);

  // No sections in scope → one page-level insight callout (same shape as the
  // schedule board's empty state) instead of "no data" rows inside the boards.
  const isEmpty = !isPending && sections.length === 0;

  const [selectedSubject, setSelectedSubject] = React.useState<string | null>(null);
  // The section-ranking board opens for a chart bar click; a Needs Attention
  // row only highlights the subject in Subject Trends.
  const [breakdownOpen, setBreakdownOpen] = React.useState(false);
  if (selectedSubject && !subjects.includes(selectedSubject)) {
    setSelectedSubject(null);
    setBreakdownOpen(false);
  }

  const selectFromChart = React.useCallback((subject: string | null) => {
    setSelectedSubject(subject);
    setBreakdownOpen(subject !== null);
  }, []);

  // A "Needs Attention" row scrolls up to the trend board and highlights that
  // subject's bars — it never opens the section-ranking board.
  const trendsRef = React.useRef<HTMLDivElement>(null);
  const scrollToTrends = React.useRef(false);

  const selectFromAttention = React.useCallback((subject: string) => {
    scrollToTrends.current = true;
    setSelectedSubject((current) => (current === subject ? null : subject));
    setBreakdownOpen(false);
  }, []);

  React.useEffect(() => {
    if (!scrollToTrends.current) return;
    scrollToTrends.current = false;
    const node = trendsRef.current;
    if (!node) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }, [selectedSubject]);

  const breakdown = React.useMemo<AttentionItem[]>(() => {
    if (!selectedSubject) return [];
    const items: AttentionItem[] = [];
    for (const s of sections) {
      if (gradeFilter !== ALL_GRADES && s.grade !== gradeFilter) continue;
      const cell = cellByKey[`${s.sectionId}::${selectedSubject}`];
      if (!cell) continue;
      items.push({
        sectionId: s.sectionId,
        section: s.section,
        subject: selectedSubject,
        avg: cell.avg,
        graded: cell.graded,
        below: cell.below,
      });
    }
    return items.sort((a, b) => a.avg - b.avg);
  }, [sections, cellByKey, selectedSubject, gradeFilter]);

  return (
    <div className={shell.shell}>
      <div className={shell.layout}>
        <section className={shell.page} aria-busy={isPending || undefined}>
          <PrincipalPageHeader
            title="Academic Heatmap"
            description="Adviser-shared sections for the active term. See who is below 75, which sections are slipping, and where grades are still missing — pick a subject in the trend chart to rank its sections, or a needs-attention row below to highlight it."
            actions={
              <>
                <Button size="sm" className="h-6 px-2 text-[12px]" asChild>
                  <Link href="/principal/risk/students">
                    <ShieldAlert aria-hidden="true" />
                    At-risk learners
                  </Link>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-[12px]"
                  asChild
                >
                  <Link href="/principal/risk">
                    <ListFilter aria-hidden="true" />
                    Risk board
                  </Link>
                </Button>
              </>
            }
          />

          {isEmpty ? (
            <PageEmptyCallout>
              No graded records for the active term yet. Section averages and
              subject trends will appear here once grades are finalized.
            </PageEmptyCallout>
          ) : (
            <>
              <KpiStrip
                below={below}
                gradedTotal={gradedStudents.length}
                riskySections={riskySections}
                sectionCount={sections.length}
                ungraded={ungraded}
                ungradedStudents={ungradedStudents}
                sharedTotal={sharedStudents}
                isPending={isPending}
              />
              <div ref={trendsRef} style={{ scrollMarginTop: "5rem" }}>
                <SubjectTrendChart
                  sections={sections}
                  isPending={isPending}
                  selectedSubject={selectedSubject}
                  onSelectSubject={selectFromChart}
                />
              </div>
              {selectedSubject && breakdownOpen ? (
                <SubjectSectionBreakdown
                  subject={selectedSubject}
                  gradeFilter={gradeFilter}
                  items={breakdown}
                  onClear={() => selectFromChart(null)}
                />
              ) : null}
              <NeedsAttentionList
                items={attention}
                isPending={isPending}
                isNoData={sections.length === 0}
                onSelectSubject={selectFromAttention}
                selectedSubject={selectedSubject}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
