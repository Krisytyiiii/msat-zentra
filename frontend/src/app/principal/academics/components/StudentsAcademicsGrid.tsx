"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, SearchIcon, X } from "lucide-react";
import { useBreadcrumbExtra } from "@/components/nav/BreadcrumbExtra";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { AcademicsSummary } from "./AcademicsSummary";
import { SectionCardGrid } from "./SectionCardGrid";
import { SectionStudentsTable } from "./SectionStudentsTable";
import { Pill } from "@/components/ui/pill";
import type { AcademicsMock, SectionSummary } from "@/services/principal/academics";
import styles from "./StudentsAcademicsGrid.module.css";

function gradeNumber(grade: string | undefined): number {
  const n = Number((grade ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function orderSections(list: SectionSummary[]): SectionSummary[] {
  const next = [...list];
  next.sort((a, b) => {
    const grade = gradeNumber(a.grade) - gradeNumber(b.grade);
    if (grade !== 0) return grade;
    if ((a.grade ?? "") !== (b.grade ?? "")) {
      return (a.grade ?? "").localeCompare(b.grade ?? "");
    }
    return (a.section ?? "").localeCompare(b.section ?? "");
  });
  return next;
}


/**
 * Academics board: a term summary, a find/filter toolbar, one card per class
 * section, and — once a section is chosen — that section's learner roster.
 *
 * The header, summary and toolbar stay visible while the toolbar filters the
 * board in place; choosing a section swaps the board for the roster so the
 * principal reads one class at a time. Every view is keyed so it remounts and
 * plays its own entrance instead of popping.
 */
export function StudentsAcademicsGrid() {
  const [selectedSectionId, setSelectedSectionId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const detailRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const hadSelection = React.useRef(false);

  const { activeTerm } = useTerm();
  const termId = activeTerm?.termId ?? null;
  const schoolYearId = activeTerm?.schoolYearId ?? null;
  const {
    data,
    isPending,
    error: queryError,
  } = useQuery({
    queryKey: ["academics", termId, schoolYearId],
    queryFn: async () => {
      const { data } = await apiClient.get<AcademicsMock>("/api/academics");
      return {
        ...data,
        sections: (data.sections ?? []).map((s) => ({ ...s, students: s.students ?? [] })),
      };
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const sections = React.useMemo(() => data?.sections ?? [], [data]);

  const loading = isPending;

  const error = React.useMemo(() => {
    if (!queryError) return null;
    const status = (queryError as { response?: { status?: number } }).response?.status;
    return status
      ? `Failed to load student grades (HTTP ${status})`
      : "Failed to load student grades";
  }, [queryError]);

  const selectedSection = React.useMemo(
    () => sections.find((s) => s.sectionId === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );

  const visibleSections = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orderSections(sections);
    return orderSections(
      sections.filter(
        (s) =>
          (s.section ?? "").toLowerCase().includes(needle) ||
          (s.grade ?? "").toLowerCase().includes(needle),
      ),
    );
  }, [sections, query]);

  const filtersActive = query.trim().length > 0;

  const clearFilters = React.useCallback(() => {
    setQuery("");
  }, []);

  // Every roster opens unfiltered, so a search never leaks across sections.
  const selectSection = React.useCallback((id: string | null) => {
    setQuery("");
    setSelectedSectionId(id);
  }, []);

  // Stable so registering the crumb doesn't re-run on every render.
  const showAllSections = React.useCallback(
    () => selectSection(null),
    [selectSection],
  );
  // Append the open section to the shell breadcrumb
  // (Principal › Academics › Section); "Academics" becomes the back control.
  useBreadcrumbExtra(selectedSection?.section ?? null, showAllSections);

  // Opening a section pulls the roster into view; returning restores the board
  // to the top so the cascade is actually seen. Reduced motion scrolls plainly.
  React.useEffect(() => {
    const target = selectedSectionId ? detailRef.current : hadSelection.current ? gridRef.current : null;
    hadSelection.current = Boolean(selectedSectionId);
    if (!target) return;
    const smooth =
      typeof window !== "undefined" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, [selectedSectionId]);

  return (
    <section className={styles.section}>
      {error ? (
        <p className={styles.error}>{error}</p>
      ) : selectedSection ? (
        <div key={selectedSection.sectionId} ref={detailRef} className={styles.detail}>
          <div className={styles.detailBar}>
            <div className={styles.detailHead}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(styles.backBtn, "h-7 px-2")}
                onClick={() => selectSection(null)}
              >
                <ArrowLeft data-icon="inline-start" aria-hidden />
                All sections
              </Button>
              <div className={styles.detailIdentity}>
                <h2 className={styles.detailTitle}>{selectedSection.section}</h2>
                <p className={styles.detailMeta}>
                  <Pill field="grade">{selectedSection.grade}</Pill>
                  <Pill label="Learners">
                    {selectedSection.students?.length ?? 0}{" "}
                    {(selectedSection.students?.length ?? 0) === 1
                      ? "learner"
                      : "learners"}
                  </Pill>
                  {selectedSection.shared === true ? (
                    <>
                      <Pill label="Average grade">
                        {selectedSection.avgTransmuted}
                      </Pill>
                      <Pill
                        tone="amber"
                        label="Students at risk in this section"
                      >
                        {selectedSection.atRiskCount} at risk
                      </Pill>
                    </>
                  ) : (
                    <Pill tone="neutral" label="Data sharing">
                      Data sharing is off
                    </Pill>
                  )}
                </p>
              </div>
            </div>
            {/* No roster to filter — hide the search bar with the empty state. */}
            {(selectedSection.students?.length ?? 0) > 0 && (
              <InputGroup className={cn(styles.detailSearch, "rounded-[16px]")}>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Find a learner by name or LRN…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Filter students"
                />
              </InputGroup>
            )}
          </div>
          <SectionStudentsTable section={selectedSection} query={query} />
        </div>
      ) : (
        <div key="all-sections" ref={gridRef} className={styles.gridAnchor}>
          <AcademicsSummary sections={sections} loading={loading} />

          <div className={styles.toolbar} aria-label="Find a section">
            <span className={styles.resultCount} aria-live="polite">
              {loading
                ? "Loading sections…"
                : `Showing ${visibleSections.length} of ${sections.length} sections`}
            </span>

            <InputGroup className={cn(styles.toolbarSearch, "rounded-[16px]")}>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Find a section…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search sections"
              />
              {query ? (
                <button
                  type="button"
                  className={styles.clearSearch}
                  onClick={() => setQuery("")}
                  aria-label="Clear section search"
                >
                  <X aria-hidden />
                </button>
              ) : null}
            </InputGroup>
          </div>

          <SectionCardGrid
            sections={visibleSections}
            totalCount={sections.length}
            loading={loading}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            selectedSectionId={selectedSectionId}
            onSelectSection={selectSection}
          />
        </div>
      )}
    </section>
  );
}
