"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  Layers,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { formatGrade } from "@/lib/utils";
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
      className="flex w-full min-w-0 items-center gap-2"
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

function SubjectRow({
  subject,
  index,
  onOpen,
}: {
  subject: RegistrySubject;
  index: number;
  onOpen: (subject: RegistrySubject) => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(subject);
    }
  };

  return (
    <li
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
      className={styles.row}
      onClick={() => onOpen(subject)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Open ${subject.name} learners`}
    >
      <div className={`${styles.cell} ${styles.cellSubject}`}>
        <span className={styles.subjectIcon} aria-hidden>
          <BookOpen size={14} />
        </span>
        <div className={styles.personText}>
          <p className={styles.personName} title={subject.name}>
            {subject.name}
          </p>
          <span className={styles.personLrn}>{subject.code}</span>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.cellGrade}`}>
        <Pill tone="blue" label="Grade level">
          {formatGrade(String(subject.gradeLevel))}
        </Pill>
      </div>

      <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellCategory}`}>
        <span className={styles.cellValue}>{subject.category}</span>
        <span className={styles.cellMuted}>
          {subject.active ? "Offered" : "Inactive"}
        </span>
      </div>

      <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellEnrolled}`}>
        <span className={styles.cellLabel}>Enrolled</span>
        <span className={styles.cellValue}>{subject.enrolled}</span>
      </div>

      <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellPassed}`}>
        <span className={styles.cellLabel}>Passed</span>
        <span className={`${styles.cellValue} ${styles.cellPassedValue}`}>
          {subject.passed}
        </span>
      </div>

      <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellFailed}`}>
        <span className={styles.cellLabel}>Failed</span>
        <span className={`${styles.cellValue} ${styles.cellFailedValue}`}>
          {subject.failed}
        </span>
      </div>

      <div className={`${styles.cell} ${styles.cellOutcome}`}>
        <OutcomeMeter passed={subject.passed} failed={subject.failed} />
      </div>

      <div className={`${styles.cell} ${styles.cellAction}`}>
        <Button
          variant="outline"
          className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
          aria-label={`View ${subject.name} learners`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(subject);
          }}
        >
          <ArrowUpRight size={12} className="text-amber-500" aria-hidden />
          View learners
        </Button>
      </div>
    </li>
  );
}

const HEAD_LABELS: { key: string; label: string; className?: string }[] = [
  { key: "subject", label: "Subject" },
  { key: "grade", label: "Grade" },
  { key: "category", label: "Category", className: styles.headCategory },
  { key: "enrolled", label: "Enrolled" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
  { key: "outcome", label: "Outcome" },
  { key: "action", label: "" },
];

/** Filter chips the live toolbar shows: All + one per banded grade. */
const SKEL_TAGS = [5, 7, 7, 7];

/**
 * Loading state for the subject catalog — one shimmer sweep over a copy of the
 * live layout (header + count pill, grade tags + search, the list panel head
 * and six rows), so nothing shifts when the catalog lands.
 */
function SubjectCatalogSkeleton() {
  return (
    <ShimmerGroup>
      <section className={styles.page} aria-busy="true" aria-label="Loading subjects">
        <div className={styles.boardShell}>
          <header className={styles.header}>
            <div className={styles.headerText}>
              <div className={styles.titleRow}>
                <Skeleton className={styles.skelTitleIcon} />
                <Skeleton className={styles.skelTitle} />
              </div>
              <Skeleton className={styles.skelDescription} />
            </div>
            <Skeleton className={styles.skelCountPill} />
          </header>

          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              {SKEL_TAGS.map((width, index) => (
                <Skeleton
                  key={index}
                  className={styles.skelTag}
                  style={{ width: `${width}rem` }}
                />
              ))}
            </div>
            <Skeleton className={styles.skelSearch} />
          </div>

          <div className={styles.listPanel} role="status" aria-label="Loading subjects">
            <div className={styles.listHead} aria-hidden>
              {HEAD_LABELS.map((head) => (
                <span key={head.key} className={head.className}>
                  <Skeleton className={styles.skelHeadLabel} />
                </span>
              ))}
            </div>
            <ul className={styles.listBody} aria-hidden>
              {Array.from({ length: 6 }).map((_, row) => (
                <li key={row} className={styles.skelRow}>
                  <div className={styles.skelPersonCell}>
                    <Skeleton className={styles.skelAvatar} />
                    <div className={styles.skelPersonLines}>
                      <Skeleton className={styles.skelBar} style={{ width: "8rem" }} />
                      <Skeleton className={styles.skelBar} style={{ width: "4.5rem" }} />
                    </div>
                  </div>
                  <Skeleton className={styles.skelPill} style={{ width: "4rem" }} />
                  <div className={`${styles.cell} ${styles.cellCategory}`}>
                    <Skeleton className={styles.skelBar} style={{ width: "3.5rem" }} />
                  </div>
                  <Skeleton className={styles.skelBar} style={{ width: "2.25rem" }} />
                  <Skeleton className={styles.skelBar} style={{ width: "2.25rem" }} />
                  <Skeleton className={styles.skelBar} style={{ width: "2.25rem" }} />
                  <Skeleton className={styles.skelMeter} />
                  <Skeleton className={styles.skelAction} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </ShimmerGroup>
  );
}

/**
 * Registry academics — the banded subject catalog (record keeper G7–10,
 * registrar G11-12). Grade tabs + search over one list panel, in the same
 * shape as the advisory interventions desk, with a per-subject learner
 * drill-down holding the filed final grades.
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

  const openRow = (s: RegistrySubject) => setOpenSubject(s);

  const gradeOptions = React.useMemo(
    () => [
      { value: "all", label: "All", count: subjects.length },
      ...grades.map((g) => ({
        value: String(g),
        label: formatGrade(String(g)),
        count: gradeCounts.get(g) ?? 0,
      })),
    ],
    [grades, subjects.length, gradeCounts],
  );

  const hasFilterChips = grade !== null || q.trim() !== "";

  const clearFilters = () => {
    setQ("");
    setGrade(null);
  };

  // First load → shimmer copy of the live board, so nothing shifts on arrival.
  if (isPending && !data) return <SubjectCatalogSkeleton />;

  // No catalog at all → one centered callout instead of an empty board.
  const isTrueEmpty = !isError && subjects.length === 0;
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
    <section className={styles.page} aria-label="Subject catalog">
      <div className={styles.boardShell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.titleRow}>
              <span className={styles.titleIcon} aria-hidden>
                <Layers size={16} />
              </span>
              <h2 className={styles.title}>Subject catalog</h2>
            </div>
            <p className={styles.subtitle}>
              Grades {grades[0]}–{grades[grades.length - 1]} subject catalog for
              this desk — open a subject to see every learner&rsquo;s filed final
              grade.
            </p>
          </div>
          {subjects.length > 0 ? (
            <div className={styles.headerActions}>
              <Pill tone="amber" className={styles.countPill}>
                {filtered.length} subject{filtered.length === 1 ? "" : "s"}
              </Pill>
            </div>
          ) : null}
        </header>

        {subjects.length > 0 ? (
          <div className={styles.toolbar}>
            <div className={styles.toolbarFilters}>
              <FilterTabs
                label="Filter by grade"
                options={gradeOptions}
                value={grade === null ? "all" : String(grade)}
                onChange={(next) => setGrade(next === "all" ? null : Number(next))}
                variant="tags"
              />
            </div>
            <SearchField
              className="w-60 max-w-full"
              placeholder="Search code, learning area, or category…"
              value={q}
              onChange={setQ}
              aria-label="Search subjects"
            />
          </div>
        ) : null}

        {isError ? (
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
          <PageEmptyCallout
            fit
            action={
              hasFilterChips ? (
                <button
                  type="button"
                  className="h-6 rounded-md border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors hover:bg-muted"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          >
            {q.trim() ? (
              <>
                No subjects match &ldquo;{q.trim()}&rdquo;. Try another code or
                learning area.
              </>
            ) : (
              <>
                No subjects are offered for the selected grade yet. Pick another
                grade or clear the filter.
              </>
            )}
          </PageEmptyCallout>
        ) : (
          <div className={styles.listPanel}>
            <div className={styles.listHead} aria-hidden="true">
              {HEAD_LABELS.map((head) => (
                <span key={head.key} className={head.className}>
                  {head.label}
                </span>
              ))}
            </div>
            <ul className={styles.listBody} aria-label="Subjects on this desk">
              {filtered.map((s, index) => (
                <SubjectRow
                  key={s.id}
                  subject={s}
                  index={index}
                  onOpen={openRow}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <SubjectLearnersOverlay
        key={openSubject?.id ?? "none"}
        desk={desk}
        subject={openSubject}
        onClose={() => setOpenSubject(null)}
      />
    </section>
  );
}
