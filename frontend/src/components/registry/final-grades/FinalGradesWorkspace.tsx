"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  FileStack,
  GraduationCap,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { formatGrade, formatSection } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ui/pill";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { InsightCallout } from "@/components/ui/insight-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  FinalGradeSetDialog,
  type GradeSetStudent,
} from "@/components/registry/final-grades/FinalGradeSetDialog";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useCountUp } from "@/lib/hooks/useCountUp";
import { liveQueryOptions } from "@/lib/api/live";
import type { RegistryDesk } from "@/services/registry/overview.service";
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

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  unit: string;
  hint: string;
  value: number;
  /** Slice of the largest stat, 0–100. */
  share: number;
}

/** Coverage tile — same deck/tile anatomy as the overview attention deck. */
function StatTile({ icon: Icon, label, unit, hint, value, share }: StatTileProps) {
  const shown = useCountUp(value, 700);
  const clear = value === 0;

  return (
    <div
      className={`${styles.statTile} ${clear ? styles.statTileClear : ""}`}
      aria-label={`${label}: ${value} ${unit}`}
    >
      <span className={styles.statTop}>
        <span className={styles.statIcon} aria-hidden>
          <Icon />
        </span>
        <span className={styles.statLabel}>{label}</span>
      </span>

      <span className={styles.statValue}>
        <span className={styles.statNumber}>{shown}</span>
        <span className={styles.statUnit}>{unit}</span>
      </span>

      <span className={styles.statMeter} aria-hidden>
        <span className={styles.statMeterFill} style={{ width: `${share}%` }} />
      </span>

      <span className={styles.statHint}>{hint}</span>
    </div>
  );
}

/**
 * Final grade approvals workspace — the shared record-keeper / registrar
 * review surface. Only the banded endpoint, cache key and dialog desk change
 * between the G7–10 and G11–12 desks; the markup is identical.
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
  // Sheet (full grade record) opened from the detail panel.
  const [sheetStudent, setSheetStudent] = React.useState<GradeSetStudent | null>(null);
  // Learner highlighted in the review workspace. Null = fall back to the first
  // row of the page, so the panel is never empty on arrival.
  const [pickedId, setPickedId] = React.useState<string | null>(null);

  const rawPage = React.useMemo(() => {
    const raw = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  }, [searchParams]);

  // Debounced server search; the loaded page is filtered instantly as well so
  // typing never waits on a round-trip.
  const query = useDebouncedValue(queryInput.trim(), 300);
  const debouncedQuery = query;

  const { data, isPending, isError } = useQuery<GradesResponse>({
    queryKey: [QUERY_KEY[desk], rawPage, debouncedQuery],
    queryFn: ({ signal }) =>
      apiClient
        .get<GradesResponse>(ENDPOINT[desk], {
          params: {
            page: rawPage,
            pageSize: PAGE_SIZE,
            ...(debouncedQuery ? { q: debouncedQuery } : {}),
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

  const pageRows = React.useMemo(() => data?.students ?? [], [data]);
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

  // The sheet reads the freshest row so a late approval shows while it is open.
  const sheetRow = React.useMemo(
    () =>
      sheetStudent
        ? (data?.students.find((s) => s.id === sheetStudent.id) ?? sheetStudent)
        : null,
    [sheetStudent, data],
  );

  const move = React.useCallback(
    (delta: number) => {
      if (visibleRows.length === 0) return;
      const from = activeIndex < 0 ? 0 : activeIndex;
      const next = Math.min(Math.max(from + delta, 0), visibleRows.length - 1);
      setPickedId(visibleRows[next].id);
    },
    [activeIndex, visibleRows],
  );

  const pager = useUrlPager(filteredTotal, {}, { searchParam: "q", extraParams: ["q"] });
  const setPage = pager.setPage;
  const safePage = pager.page;

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
  const isTrueEmpty = !isPending && !isError && !hasRecords && !searching;

  if (isTrueEmpty) {
    return (
      <section className={`${styles.page} ${styles.pageEmpty}`}>
        <PageEmptyCallout fit>
          No complete grade sets yet. Students appear once every subject is
          locked or adviser-approved.
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

        <section className={styles.stats} aria-label="Final grade coverage">
          <div className={styles.statsHead}>
            <span className={styles.statsTitle}>
              <FileSignature aria-hidden />
              Final grade coverage
            </span>
          </div>

          <div className={styles.statTiles}>
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.statTile} aria-hidden>
                  <span className={styles.statTop}>
                    <Skeleton className="size-[1.375rem] shrink-0 rounded-md" />
                    <Skeleton className="h-3 w-28" />
                  </span>
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-[3px] w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))
            ) : (
              (() => {
                const complete = data?.complete ?? 0;
                const ready = data?.ready ?? 0;
                const locked = data?.locked ?? 0;
                const peak = Math.max(complete, ready, locked, 1);
                return (
                  <>
                    <StatTile
                      icon={GraduationCap}
                      label="Complete sets"
                      unit="learners"
                      hint="Learners with a finished term"
                      value={complete}
                      share={Math.round((complete / peak) * 100)}
                    />
                    <StatTile
                      icon={FileStack}
                      label="Final grades"
                      unit="grades"
                      hint="Locked or adviser-approved"
                      value={ready}
                      share={Math.round((ready / peak) * 100)}
                    />
                    <StatTile
                      icon={FileSignature}
                      label="Awaiting sign-off"
                      unit="pending"
                      hint="Locked, adviser approval pending"
                      value={locked}
                      share={Math.round((locked / peak) * 100)}
                    />
                  </>
                );
              })()
            )}
          </div>
        </section>

        <div className={styles.workspace}>
          <section className={styles.index} aria-label="Grade sets">
            <header className={styles.indexHead}>
              <div className={styles.indexHeadTop}>
                <span className={styles.indexTitle}>Grade sets</span>
              </div>
              <div className={styles.searchWrap}>
                <Search className={styles.searchIcon} aria-hidden />
                <Input
                  className={styles.search}
                  placeholder="Search name, LRN, or section…"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  aria-label="Search final grades"
                />
              </div>
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
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
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
                ))
              ) : isError ? (
                <p className={styles.indexNote}>Could not load final grades.</p>
              ) : visibleRows.length === 0 ? (
                <div className={styles.indexCallout}>
                  <InsightCallout role="status">
                    No grade sets match &ldquo;{queryInput.trim()}&rdquo;.
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

          <section className={styles.detail} aria-label="Grade set detail">
            {isPending ? (
              // Mirrors the loaded sheet: identity head + pills + term ring,
              // the status strip, the subject grid and the footer.
              <div aria-hidden>
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

                <ul className={styles.subjectGrid}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className={styles.subjectCard}>
                      <div className={styles.subjectTop}>
                        <div className={styles.subjectHeading}>
                          <Skeleton className="h-3.5 w-32 max-w-full" />
                          <Skeleton className="h-2.5 w-16" />
                        </div>
                        <Skeleton className="h-6 w-10 rounded-md" />
                      </div>
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-1 w-full rounded-full" />
                      <div className={styles.subjectFoot}>
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-2.5 w-24" />
                      </div>
                    </li>
                  ))}
                </ul>

                <footer className={styles.detailFoot}>
                  <Skeleton className="h-2.5 w-64 max-w-full" />
                  <Skeleton className="h-7 w-40 rounded-md" />
                </footer>
              </div>
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

                <ul className={styles.subjectGrid} aria-label="Subjects">
                  {active.subjects.map((sub) => {
                    const failedSubject = sub.remarks === "Failed";
                    const tone = failedSubject ? "red" : "green";
                    const hasTeacher = !!sub.teacher && sub.teacher !== "—";
                    return (
                      <li key={sub.id} className={styles.subjectCard}>
                        <div className={styles.subjectTop}>
                          <div className={styles.subjectHeading}>
                            <span className={styles.subjectName} title={sub.subject}>
                              {sub.subject}
                            </span>
                            <span className={styles.subjectCode}>{sub.code}</span>
                          </div>
                          <div className={styles.subjectGradeWrap}>
                            <span className={styles.subjectGradeLabel}>Final</span>
                            <span className={styles.subjectGrade} data-tone={tone}>
                              {sub.transmutedGrade}
                            </span>
                          </div>
                        </div>

                        <p
                          className={styles.subjectTeacher}
                          data-empty={hasTeacher ? undefined : "true"}
                          title={hasTeacher ? sub.teacher : "No teacher assigned"}
                        >
                          <UserRound size={13} strokeWidth={1.9} aria-hidden />
                          <span className={styles.teacherLabel}>Teacher</span>
                          <span className={styles.teacherName}>
                            {hasTeacher ? sub.teacher : "Not assigned"}
                          </span>
                        </p>

                        <div className={styles.subjectTrack} aria-hidden>
                          <span
                            className={styles.subjectFill}
                            data-tone={tone}
                            style={{ width: `${Math.min(sub.transmutedGrade, 100)}%` }}
                          />
                        </div>

                        <div className={styles.subjectFoot}>
                          <Pill tone={tone} label="Remarks">
                            {sub.remarks}
                          </Pill>
                          <span className={styles.subjectComputed}>
                            Computed {Math.round(sub.computedAverage * 100) / 100}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <footer className={styles.detailFoot}>
                  <span className={styles.detailFootNote}>
                    Computed average and DepEd transmutation applied per subject.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 rounded-md px-2 text-xs"
                    onClick={() => setSheetStudent(active)}
                  >
                    Open full grade sheet
                    <ArrowUpRight size={13} strokeWidth={2} aria-hidden />
                  </Button>
                </footer>
              </>
            )}
          </section>
        </div>
      </div>

      <FinalGradeSetDialog
        key={sheetRow?.id ?? "closed"}
        desk={desk}
        student={sheetRow}
        onClose={() => setSheetStudent(null)}
      />
    </section>
  );
}
