"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  Layers,
  Search,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Input } from "@/components/ui/input";
import { InsightCallout } from "@/components/ui/insight-callout";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
import { formatGrade } from "@/lib/utils";
import { useCountUp } from "@/lib/hooks/useCountUp";
import {
  fetchRegistrySubjects,
  type RegistrySubject,
} from "@/services/registry/academics.service";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { SubjectLearnersOverlay } from "@/components/registry/academics/subject-learners-overlay";
import styles from "./subject-catalog.module.css";

/** Stacked pass/fail meter used on every subject row. */
function OutcomeMeter({ passed, failed }: { passed: number; failed: number }) {
  const graded = passed + failed;
  const pct = graded === 0 ? 0 : Math.round((passed / graded) * 100);
  return (
    <span
      className="flex w-full items-center gap-2"
      title={
        graded === 0
          ? "No final grades filed yet"
          : `${passed} passed · ${failed} failed`
      }
    >
      <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        {graded === 0 ? null : (
          <span
            className="block h-full rounded-full bg-emerald-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </span>
      <span className="w-8 shrink-0 text-right text-[12px] font-medium tabular-nums text-muted-foreground">
        {graded === 0 ? "—" : `${pct}%`}
      </span>
    </span>
  );
}

interface StatItem {
  key: string;
  icon: LucideIcon;
  label: string;
  unit: string;
  hint: string;
  value: number | null;
  /** Slice of the largest stat, 0–100. */
  share: number;
}

/**
 * Deck tile — same anatomy as the final-grade approvals / adviser-access
 * stats: icon + label, big count, thin share meter, hint.
 */
function StatTile({ item }: { item: StatItem }) {
  const Icon = item.icon;
  const shown = useCountUp(item.value ?? 0, 700);
  const clear = item.value === null || item.value === 0;

  return (
    <div
      className={`${styles.tile} ${clear ? styles.tileClear : ""}`}
      aria-label={`${item.label}: ${item.value ?? "no data"} ${item.unit}`}
    >
      <span className={styles.tileTop}>
        <span className={styles.tileIcon} aria-hidden>
          <Icon />
        </span>
        <span className={styles.tileLabel}>{item.label}</span>
      </span>

      <span className={styles.tileValue}>
        <span className={styles.tileNumber}>
          {item.value === null ? "—" : shown}
        </span>
        <span className={styles.tileUnit}>{item.unit}</span>
      </span>

      <span className={styles.tileMeter} aria-hidden>
        <span className={styles.tileMeterFill} style={{ width: `${item.share}%` }} />
      </span>

      <span className={styles.tileHint}>{item.hint}</span>
    </div>
  );
}

/**
 * Registry academics — the banded subject catalog (record keeper G7–10,
 * registrar G11-12). Search, grade filter, a single-column
 * subject list, and a per-subject learner drill-down with the filed final
 * grades.
 */
export function SubjectCatalogPage({
  desk,
  grades,
  queryKey,
}: {
  desk: "record-keeper" | "registrar";
  grades: readonly number[];
  queryKey: readonly unknown[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialGrade = Number(searchParams.get("grade"));
  const [grade, setGrade] = React.useState<number | null>(
    grades.includes(initialGrade) ? initialGrade : null,
  );
  const [q, setQ] = React.useState("");
  const [openSubject, setOpenSubject] = React.useState<RegistrySubject | null>(null);

  // Keep the grade filter in the URL so refresh and back/forward land on the
  // same view (same convention as the other list pages).
  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (grade === null) params.delete("grade");
    else params.set("grade", String(grade));
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [grade, pathname, router, searchParams]);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchRegistrySubjects(desk, signal),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const subjects = React.useMemo(() => data ?? [], [data]);

  const gradeCounts = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const s of subjects) map.set(s.gradeLevel, (map.get(s.gradeLevel) ?? 0) + 1);
    return map;
  }, [subjects]);

  // Learners per grade live on every subject row of that grade (same value),
  // so one row per grade is enough — summing the rows would multiply them.
  const learnersTotal = React.useMemo(() => {
    const seen = new Map<number, number>();
    for (const s of subjects) if (!seen.has(s.gradeLevel)) seen.set(s.gradeLevel, s.enrolled);
    return [...seen.values()].reduce((n, v) => n + v, 0);
  }, [subjects]);

  const totals = React.useMemo(() => {
    let passed = 0;
    let failed = 0;
    for (const s of subjects) {
      passed += s.passed;
      failed += s.failed;
    }
    const graded = passed + failed;
    return {
      passed,
      failed,
      rate: graded > 0 ? Math.round((passed / graded) * 100) : null,
    };
  }, [subjects]);

  const learningAreas = React.useMemo(
    () => new Set(subjects.map((s) => s.name.trim().toLowerCase())).size,
    [subjects],
  );

  const categoryCounts = React.useMemo(() => {
    let core = 0;
    let elective = 0;
    for (const s of subjects) {
      if (s.category === "Elective") elective += 1;
      else core += 1;
    }
    return { core, elective };
  }, [subjects]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return subjects.filter((s) => {
      if (grade !== null && s.gradeLevel !== grade) return false;
      if (!needle) return true;
      return (
        s.code.toLowerCase().includes(needle) ||
        s.name.toLowerCase().includes(needle) ||
        s.category.toLowerCase().includes(needle)
      );
    });
  }, [subjects, grade, q]);

  const peak = Math.max(subjects.length, learnersTotal, gradeCounts.size, 1);
  const stats: StatItem[] = [
    {
      key: "subjects",
      icon: BookOpen,
      label: "Subjects",
      unit: "offerings",
      hint: `${learningAreas} learning area${learningAreas === 1 ? "" : "s"}`,
      value: subjects.length,
      share: Math.round((subjects.length / peak) * 100),
    },
    {
      key: "learners",
      icon: Users,
      label: "Learners",
      unit: "enrolled",
      hint: `${formatGrade(String(grades[0]))} to ${formatGrade(
        String(grades[grades.length - 1]),
      )}`,
      value: learnersTotal,
      share: Math.round((learnersTotal / peak) * 100),
    },
    {
      key: "grades",
      icon: Layers,
      label: "Grade levels",
      unit: "grades",
      hint: `${categoryCounts.core} core · ${categoryCounts.elective} elective`,
      value: gradeCounts.size,
      share: Math.round((gradeCounts.size / peak) * 100),
    },
    {
      key: "rate",
      icon: TrendingUp,
      label: "Pass rate",
      unit: "%",
      hint:
        totals.rate === null
          ? "No final grades filed yet"
          : `${totals.passed} passed · ${totals.failed} failed`,
      value: totals.rate,
      share: totals.rate ?? 0,
    },
  ];

  const openRow = (s: RegistrySubject) => setOpenSubject(s);

  // No catalog at all → one centered callout instead of an empty board.
  const isTrueEmpty = !isPending && !isError && subjects.length === 0;
  if (isTrueEmpty) {
    return (
      <section className="flex min-w-0 flex-col gap-4 font-sans">
        <PageEmptyCallout>
          No subjects yet. Subjects appear here once they are added for grades{" "}
          {grades[0]}–{grades[grades.length - 1]}.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 font-sans">
      {/* Desk snapshot — same deck anatomy as the other registry desks. */}
      <section className={styles.deck} aria-label="Subject catalog at a glance">
        <div className={styles.deckHead}>
          <span className={styles.deckTitle}>
            <GraduationCap aria-hidden />
            Subject catalog at a glance
          </span>
        </div>

        <div className={styles.tiles}>
          {isPending
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={styles.tile} aria-hidden>
                  <span className={styles.tileTop}>
                    <Skeleton className="size-[1.375rem] shrink-0 rounded-md" />
                    <Skeleton className="h-3 w-28" />
                  </span>
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-[3px] w-full" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))
            : stats.map((item) => <StatTile key={item.key} item={item} />)}
        </div>
      </section>

      <KanbanBoard
        title="Subject catalog"
        icon={<BookOpen size={14} className="text-amber-500" aria-hidden />}
        ariaLabel="Subject catalog"
        className={styles.boardIn}
        count={`${filtered.length}/${subjects.length}`}
        description={`Grades ${grades[0]}–${grades[grades.length - 1]} subject catalog for this desk — search it or open a subject to see every learner's filed final grade.`}
        toolbar={
          <div className="flex w-full flex-wrap items-center justify-between gap-2 px-0.5">
            <FilterTabs
              label="Filter by grade"
              options={[
                { value: "all", label: "All" },
                ...grades.map((g) => ({
                  value: String(g),
                  label: formatGrade(String(g)),
                })),
              ]}
              value={grade === null ? "all" : String(grade)}
              onChange={(next) => setGrade(next === "all" ? null : Number(next))}
            />

            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end sm:flex-none">
              <div className={styles.searchWrap}>
                <Search className={styles.searchIcon} aria-hidden />
                <Input
                  className={styles.search}
                  placeholder="Search code, learning area…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search subjects"
                />
              </div>
            </div>
          </div>
        }
      >
        {isPending ? (
          <div className="flex flex-col gap-1.5 p-0.5" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex min-h-24 flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-xs text-muted-foreground">Could not load subjects.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="cursor-pointer text-xs font-medium text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex justify-center px-1 py-6">
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              {q.trim() ? (
                <>
                  No subjects match &ldquo;{q.trim()}&rdquo;. Try a different code or
                  learning area.
                </>
              ) : (
                <>
                  No subjects are offered for the selected grade yet. Pick another grade
                  or clear the filter.
                </>
              )}
            </InsightCallout>
          </div>
        ) : (
          <ul className={styles.subjectList}>
            {filtered.map((s, index) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => openRow(s)}
                  aria-label={`Open ${s.name} learners`}
                  className={styles.subjectRow}
                  style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
                >
                  <span className={styles.subjectCode}>{s.code}</span>

                  <span className={styles.subjectMain}>
                    <span className={styles.subjectName}>{s.name}</span>
                    <span className={styles.subjectMeta}>
                      <Pill tone="blue" label="Grade level">
                        {formatGrade(String(s.gradeLevel))}
                      </Pill>
                      <Pill tone="amber" label="Category">
                        {s.category}
                      </Pill>
                      <span className={styles.subjectMetaSmall}>
                        {s.enrolled} enrolled · {s.passed} passed · {s.failed} failed
                      </span>
                    </span>
                  </span>

                  <span className={styles.subjectStats}>
                    <span className={styles.subjectStat}>
                      <span className={styles.subjectStatValue}>{s.enrolled}</span>
                      <span className={styles.subjectStatLabel}>Enrolled</span>
                    </span>
                    <span className={`${styles.subjectStat} ${styles.subjectStatPassed}`}>
                      <span className={styles.subjectStatValue}>{s.passed}</span>
                      <span className={styles.subjectStatLabel}>Passed</span>
                    </span>
                    <span className={`${styles.subjectStat} ${styles.subjectStatFailed}`}>
                      <span className={styles.subjectStatValue}>{s.failed}</span>
                      <span className={styles.subjectStatLabel}>Failed</span>
                    </span>
                  </span>

                  <span className={styles.subjectOutcome}>
                    <span className={styles.subjectOutcomeLabel}>Outcome</span>
                    <OutcomeMeter passed={s.passed} failed={s.failed} />
                  </span>

                  <ChevronRight size={15} className={styles.subjectChevron} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </KanbanBoard>

      <SubjectLearnersOverlay
        key={openSubject?.id ?? "none"}
        desk={desk}
        subject={openSubject}
        onClose={() => setOpenSubject(null)}
      />
    </section>
  );
}
