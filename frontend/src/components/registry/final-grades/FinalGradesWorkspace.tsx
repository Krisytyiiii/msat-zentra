"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  UserRound,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { formatGrade, formatSection } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pill } from "@/components/ui/pill";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { InsightCallout } from "@/components/ui/insight-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import cascade from "@/components/shared/desk-cascade.module.css";
import {
  type GradeSetStudent,
} from "@/components/registry/final-grades/FinalGradeSetDialog";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { liveQueryOptions } from "@/lib/api/live";
import type { RegistryDesk } from "@/services/registry/overview.service";
import {
  fetchRegistrySections,
  type RegistrySectionOption,
} from "@/services/registry/academics.service";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { useSearchParams } from "next/navigation";
import styles from "./final-grades-workspace.module.css";

interface GradesResponse {
  students: GradeSetStudent[];
  total: number;
  ready: number;
  complete: number;
  locked: number;
  page: number;
  pageSize: number;
}

/** Banded desk endpoint — the registrar reads G11–12, the record keeper G7–10. */
const ENDPOINT: Record<RegistryDesk, string> = {
  registrar: "/api/registrar/final-grades",
  "record-keeper": "/api/record-keeper/final-grades",
};

/** Realtime channels invalidate these keys, so each desk keeps its own cache. */
const QUERY_KEY: Record<RegistryDesk, string> = {
  registrar: "registrar-final-grades",
  "record-keeper": "record-keeper-final-grades",
};

/** Grade tabs follow the desk's band, same split as the API guard. */
const BAND: Record<RegistryDesk, { value: string; label: string }[]> = {
  registrar: [
    { value: "G11", label: "Grade 11" },
    { value: "G12", label: "Grade 12" },
  ],
  "record-keeper": [
    { value: "G7", label: "Grade 7" },
    { value: "G8", label: "Grade 8" },
    { value: "G9", label: "Grade 9" },
    { value: "G10", label: "Grade 10" },
  ],
};

type ScoreTone = "green" | "amber" | "red";

/** Pass mark is 75; a failed subject pulls the set to amber, two to red. */
function scoreTone(value: number, failed: number): ScoreTone {
  if (value < 75 || failed > 1) return "red";
  if (failed > 0) return "amber";
  return "green";
}

/**
 * Circular score read-out — a 3px track with the grade filled to scale.
 * `data-tone` drives the stroke so one component serves the rail (28px) and
 * the sheet header (56px).
 */
function ScoreRing({
  value,
  size = 34,
  tone,
}: {
  value: number;
  size?: number;
  tone: ScoreTone;
}) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(Math.max(value, 0), 100) / 100;

  return (
    <span
      className={styles.ring}
      data-tone={tone}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          className={styles.ringTrack}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className={styles.ringFill}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span className={styles.ringValue} style={{ fontSize: size * 0.34 }}>
        {Math.round(value)}
      </span>
    </span>
  );
}

/**
 * Final grade approvals workspace — the shared record-keeper / registrar
 * review surface. Only the banded endpoint and cache key change between the
 * G7–10 and G11–12 desks; the markup is identical.
 */
export function FinalGradesWorkspace({ desk }: { desk: RegistryDesk }) {
  return (
    <React.Suspense>
      <FinalGradesWorkspaceInner desk={desk} />
    </React.Suspense>
  );
}

function FinalGradesWorkspaceInner({ desk }: { desk: RegistryDesk }) {
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = React.useState(searchParams.get("q") ?? "");
  // Learner highlighted in the review workspace. Null = fall back to the first
  // row of the page, so the panel is never empty on arrival.
  const [pickedId, setPickedId] = React.useState<string | null>(null);

  const rawPage = React.useMemo(() => {
    const raw = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  }, [searchParams]);

  // Banded tabs above the index: grade first, then that grade's sections.
  const rawGrade = searchParams.get("grade");
  const rawSection = searchParams.get("section");
  const gradeValue =
    rawGrade && BAND[desk].some((entry) => entry.value === rawGrade) ? rawGrade : "all";

  const { data: sectionCatalog = [] } = useQuery<RegistrySectionOption[]>({
    queryKey: ["registry-sections", desk],
    queryFn: ({ signal }) => fetchRegistrySections(desk, signal),
    staleTime: 300_000,
  });
  const gradeSections = React.useMemo(
    () =>
      gradeValue === "all"
        ? []
        : sectionCatalog.filter((section) => section.gradeLevel === gradeValue),
    [sectionCatalog, gradeValue],
  );
  const sectionValue =
    rawSection && gradeSections.some((section) => section.id === rawSection)
      ? rawSection
      : "all";

  // Debounced server search; the loaded page is filtered instantly as well so
  // typing never waits on a round-trip.
  const query = useDebouncedValue(queryInput.trim(), 300);
  const debouncedQuery = query;

  const { data, isPending, isError } = useQuery<GradesResponse>({
    queryKey: [QUERY_KEY[desk], rawPage, debouncedQuery, gradeValue, sectionValue],
    queryFn: ({ signal }) =>
      apiClient
        .get<GradesResponse>(ENDPOINT[desk], {
          params: {
            page: rawPage,
            pageSize: PAGE_SIZE,
            ...(debouncedQuery ? { q: debouncedQuery } : {}),
            ...(gradeValue !== "all" ? { gradeLevel: gradeValue } : {}),
            ...(sectionValue !== "all" ? { sectionId: sectionValue } : {}),
          },
          signal,
        })
        .then((res) => res.data),
    placeholderData: keepPreviousData,
    // Live desk: an adviser approval lands here without a manual reload.
    // Realtime invalidation covers the notification path; the poll is the
    // safety net for approvals that emit no notification.
    ...liveQueryOptions,
    staleTime: 10_000,
  });

  // Tabs filter the rows already on screen instantly, then the banded server
  // query replaces them with the properly paged set. Without this the deck
  // showed the previous grade's rows ("stale stack") until the fetch landed.
  const pageRows = React.useMemo(() => {
    const selectedSectionName =
      sectionValue === "all"
        ? null
        : gradeSections.find((section) => section.id === sectionValue)?.name ?? null;
    return (data?.students ?? []).filter((row) => {
      if (gradeValue !== "all" && row.gradeLevel !== gradeValue) return false;
      if (selectedSectionName && row.section !== selectedSectionName) return false;
      return true;
    });
  }, [data, gradeValue, sectionValue, gradeSections]);

  const filteredTotal = data?.total ?? pageRows.length;

  const visibleRows = React.useMemo(() => {
    const q = queryInput.trim().toLowerCase();
    if (!q) return pageRows;
    return pageRows.filter((s) =>
      `${s.name} ${s.lrn} ${s.section} ${s.subjects.map((sub) => sub.code).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [pageRows, queryInput]);

  const activeIndex = React.useMemo(() => {
    if (pickedId) {
      const found = visibleRows.findIndex((s) => s.id === pickedId);
      if (found >= 0) return found;
    }
    return visibleRows.length > 0 ? 0 : -1;
  }, [pickedId, visibleRows]);

  const active = activeIndex >= 0 ? visibleRows[activeIndex] : null;

  const move = React.useCallback(
    (delta: number) => {
      if (visibleRows.length === 0) return;
      const from = activeIndex < 0 ? 0 : activeIndex;
      const next = Math.min(Math.max(from + delta, 0), visibleRows.length - 1);
      setPickedId(visibleRows[next].id);
    },
    [activeIndex, visibleRows],
  );

  const pager = useUrlPager(filteredTotal, {}, { searchParam: "q", extraParams: ["q", "grade", "section"] });
  const setPage = pager.setPage;
  const safePage = pager.page;

  // Grade tab: resetting the section keeps the second row honest — it only
  // ever lists sections of the grade on screen.
  const onGradeChange = React.useCallback(
    (next: string) => {
      pager.setFilters({
        grade: next === "all" ? undefined : next,
        section: undefined,
      });
    },
    [pager],
  );

  const onSectionChange = React.useCallback(
    (next: string) => {
      pager.setFilters({ section: next === "all" ? undefined : next });
    },
    [pager],
  );

  // Sync debounced search to the URL and reset to page 1 when it changes.
  const firstSearchSync = React.useRef(true);
  React.useEffect(() => {
    if (firstSearchSync.current) {
      firstSearchSync.current = false;
      return;
    }
    pager.setFilters({ q: debouncedQuery || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const hasRecords = (data?.complete ?? 0) > 0;
  const searching = queryInput.trim().length > 0;
  // A grade/section tab is active — keep the deck and its tabs on screen even
  // when the narrowed set is empty, so the filter can be changed back.
  const narrowFilter = gradeValue !== "all" || sectionValue !== "all";
  const isTrueEmpty =
    !isPending && !isError && !hasRecords && !searching && !narrowFilter;

  if (isTrueEmpty) {
    return (
      <section className={`${styles.page} ${styles.pageEmpty}`}>
        <PageEmptyCallout fit>
          No complete grade sets yet. Students appear once every subject is locked.
        </PageEmptyCallout>
      </section>
    );
  }

  const failed = active?.subjects.filter((sub) => sub.remarks === "Failed").length ?? 0;

  return (
    <section className={styles.page}>
      <div className={styles.stack}>
        <header className={styles.bar}>
          <div className={styles.barText}>
            <h1 className={styles.title}>Final grade approvals</h1>
          </div>
        </header>

        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <FilterTabs
              label="Filter by grade level"
              variant="tags"
              value={gradeValue}
              onChange={onGradeChange}
              options={[
                { value: "all", label: "All grades", tone: "neutral" },
                ...BAND[desk].map((grade, index) => ({
                  value: grade.value,
                  label: grade.label,
                  tone: (index % 2 === 0 ? "blue" : "green") as "blue" | "green",
                })),
              ]}
            />
          </div>

          {gradeValue !== "all" && gradeSections.length > 0 ? (
            <div className={styles.filterGroup}>
              <FilterTabs
                label={`Filter by section in ${formatGrade(gradeValue)}`}
                variant="tags"
                value={sectionValue}
                onChange={onSectionChange}
                options={[
                  { value: "all", label: "All sections", tone: "neutral" },
                  ...gradeSections.map((section) => ({
                    value: section.id,
                    label: section.name,
                    tone: "amber" as const,
                  })),
                ]}
              />
            </div>
          ) : null}
        </div>

        <div className={styles.workspace}>
          <section className={styles.index} aria-label="Grade sets">
            <header className={styles.indexHead}>
              <div className={styles.indexHeadTop}>
                <span className={styles.indexTitle}>Grade sets</span>
              </div>
              <SearchField
                className="w-full"
                placeholder="Search name, LRN, or section…"
                value={queryInput}
                onChange={setQueryInput}
                aria-label="Search final grades"
              />
            </header>

            <div
              className={styles.indexList}
              role="listbox"
              aria-label="Learners with complete grade sets"
              aria-activedescendant={active ? `rk-set-${active.id}` : undefined}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(-1);
                }
              }}
            >
              {isPending ? (
                // One placeholder per row a full page lists, built from the
                // real row classes so the loading rows are pixel-identical to
                // the loaded ones (mascot, name, LRN + term pills, ring).
                <ShimmerGroup>
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <div key={i} className={styles.indexItem} aria-hidden>
                      <Skeleton className={styles.skelAvatar} />
                      <div className={styles.indexText}>
                        <Skeleton className={styles.skelName} />
                        <div className={styles.indexMeta}>
                          <Skeleton className={styles.skelPillLrn} />
                          <Skeleton className={styles.skelPillTerm} />
                        </div>
                      </div>
                      <Skeleton className={styles.skelRing} />
                    </div>
                  ))}
                </ShimmerGroup>
              ) : isError ? (
                <p className={styles.indexNote}>Could not load final grades.</p>
              ) : visibleRows.length === 0 ? (
                <div className={styles.indexCallout}>
                  <InsightCallout role="status">
                    {searching
                      ? `No grade sets match “${queryInput.trim()}”.`
                      : "No grade sets in this grade or section yet."}
                  </InsightCallout>
                </div>
              ) : (
                visibleRows.map((s) => {
                  const tone = scoreTone(
                    s.overall,
                    s.subjects.filter((sub) => sub.remarks === "Failed").length,
                  );
                  const selected = active?.id === s.id;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      id={`rk-set-${s.id}`}
                      role="option"
                      aria-selected={selected}
                      className={styles.indexItem}
                      data-selected={selected ? "true" : undefined}
                      onClick={() => setPickedId(s.id)}
                      title={`${s.name} · average ${s.overall}`}
                    >
                      <StudentMascot
                        name={s.name}
                        seed={s.lrn}
                        character={s.mascot ?? undefined}
                        size={30}
                      />
                      <span className={styles.indexText}>
                        <span className={styles.indexName}>{s.name}</span>
                        <span className={styles.indexMeta}>
                          <Pill label="LRN" className="tabular-nums">
                            {s.lrn}
                          </Pill>
                          <Pill
                            tone="neutral"
                            label="Term"
                            title={`Term: ${s.term}`}
                            className="max-w-full truncate"
                          >
                            {s.term}
                          </Pill>
                        </span>
                      </span>
                      <ScoreRing value={s.overall} size={32} tone={tone} />
                    </button>
                  );
                })
              )}
            </div>

            <footer className={styles.indexFoot}>
              <Pagination
                currentPage={safePage}
                totalItems={filteredTotal}
                onPageChange={setPage}
              />
            </footer>
          </section>

          <section className={`${styles.detail} ${cascade.boardIn}`} aria-label="Grade set detail">
            {isPending ? (
              // Mirrors the loaded sheet: identity head + pills + term ring,
              // the status strip, the subject grid and the footer.
              <ShimmerGroup aria-hidden>
                <div>
                  <header className={styles.detailHead}>
                    <Skeleton className="size-11 shrink-0 rounded-full" />
                    <div className={styles.detailIdentity}>
                      <Skeleton className="h-4 w-40 max-w-full" />
                      <div className={styles.detailPills}>
                        <Skeleton className="h-5 w-28 rounded-full" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </div>
                    </div>
                    <div className={styles.detailScore}>
                      <Skeleton className="size-14 rounded-full" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                    <div className={styles.detailNav}>
                      <Skeleton className="size-6 rounded-md" />
                      <Skeleton className="size-6 rounded-md" />
                    </div>
                  </header>

                  <div className={styles.detailStatus}>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-20" />
                  </div>

                  <div className={styles.tableWrap} aria-hidden>
                    <Table className={cascade.table}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Teacher</TableHead>
                          <TableHead className="text-right">Computed</TableHead>
                          <TableHead>Remarks</TableHead>
                          <TableHead className="text-right">Final grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Skeleton className="h-3.5 w-40 max-w-full" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-2.5 w-16" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-2.5 w-28" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Skeleton className="ml-auto h-2.5 w-12" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-20 rounded-full" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Skeleton className="ml-auto h-5 w-10 rounded-md" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <footer className={styles.detailFoot}>
                    <Skeleton className="h-2.5 w-64 max-w-full" />
                    <Skeleton className="h-7 w-40 rounded-md" />
                  </footer>
                </div>
              </ShimmerGroup>
            ) : !active ? (
              <div className={styles.detailEmpty}>
                <InsightCallout role="status">
                  Pick a learner from the list to inspect their term.
                </InsightCallout>
              </div>
            ) : (
              <>
                <header className={styles.detailHead}>
                  <StudentMascot
                    name={active.name}
                    seed={active.lrn}
                    character={active.mascot ?? undefined}
                    size={44}
                  />
                  <div className={styles.detailIdentity}>
                    <h2 className={styles.detailName}>{active.name}</h2>
                    <div className={styles.detailPills}>
                      <Pill label="LRN" className="tabular-nums">
                        {active.lrn}
                      </Pill>
                      <Pill field="grade">{formatGrade(active.gradeLevel)}</Pill>
                      {active.section && active.section !== "—" ? (
                        <Pill field="section">{formatSection(active.section)}</Pill>
                      ) : (
                        <Pill tone="neutral" label="No section">
                          Not assigned
                        </Pill>
                      )}
                      <Pill label="Term" tone="neutral" className="text-[12px]">
                        {active.term}
                      </Pill>
                    </div>
                  </div>

                  <div className={styles.detailScore}>
                    <ScoreRing
                      value={active.overall}
                      size={56}
                      tone={scoreTone(active.overall, failed)}
                    />
                    <span className={styles.detailScoreLabel}>Term average</span>
                  </div>

                  <div className={styles.detailNav}>
                    <Button
                      variant="ghost"
                      className="h-6 w-6 shrink-0 px-0"
                      onClick={() => move(-1)}
                      disabled={activeIndex <= 0}
                      aria-label="Previous learner"
                      title="Previous learner"
                    >
                      <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-6 w-6 shrink-0 px-0"
                      onClick={() => move(1)}
                      disabled={activeIndex >= visibleRows.length - 1}
                      aria-label="Next learner"
                      title="Next learner"
                    >
                      <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
                    </Button>
                  </div>
                </header>

                <div className={styles.detailStatus}>
                  <span className={styles.detailStatusItem}>
                    <Check size={13} strokeWidth={2.2} aria-hidden />
                    Complete set
                  </span>
                  <span className={styles.detailStatusItem}>
                    <BookOpen size={13} strokeWidth={2} aria-hidden />
                    {active.subjects.length} subjects
                  </span>
                  {failed > 0 ? (
                    <span className={styles.detailStatusWarn}>
                      {failed} failed {failed === 1 ? "subject" : "subjects"}
                    </span>
                  ) : (
                    <span className={styles.detailStatusItem}>No failures</span>
                  )}
                </div>

                <div className={styles.tableWrap} key={active.id}>
                  <Table
                    className={`${styles.subjectTable} ${cascade.table}`}
                    aria-label="Subjects"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Teacher</TableHead>
                        <TableHead className="text-right">Computed</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-right">Final grade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {active.subjects.map((sub, index) => {
                        const failedSubject = sub.remarks === "Failed";
                        const tone = failedSubject ? "red" : "green";
                        const hasTeacher = !!sub.teacher && sub.teacher !== "—";
                        return (
                          <TableRow
                            key={sub.id}
                            style={{
                              animationDelay: `${450 + Math.min(index, 11) * 140}ms`,
                            }}
                          >
                            <TableCell className={styles.subjectCell}>
                              <span className={styles.subjectName} title={sub.subject}>
                                {sub.subject}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={styles.subjectCode}>{sub.code}</span>
                            </TableCell>
                            <TableCell>
                              {hasTeacher ? (
                                <span className={styles.teacherName} title={sub.teacher}>
                                  <UserRound size={13} strokeWidth={1.9} aria-hidden />
                                  {sub.teacher}
                                </span>
                              ) : (
                                <span className={styles.tableMuted}>Not assigned</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={styles.computed}>
                                {Math.round(sub.computedAverage * 100) / 100}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Pill tone={tone} label="Remarks">
                                {sub.remarks}
                              </Pill>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={styles.subjectGrade} data-tone={tone}>
                                {sub.transmutedGrade}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <footer className={styles.detailFoot}>
                  <span className={styles.detailFootNote}>
                    Computed average and DepEd transmutation applied per subject.
                  </span>
                </footer>
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
