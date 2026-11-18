"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronRight } from "lucide-react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Skeleton } from "@/components/ui/skeleton";
import type { RegistryGradeCountRow } from "@/services/registry/overview.types";
import type { RegistryDesk } from "@/services/registry/overview.service";
import { registryOverviewQuery } from "./registryOverviewQuery";
import styles from "./registry-overview.module.css";

type Metric = "roster" | "sections" | "subjects";

const METRICS: { key: Metric; label: string }[] = [
  { key: "roster", label: "Roster" },
  { key: "sections", label: "Sections" },
  { key: "subjects", label: "Subjects" },
];

function shortGrade(grade: string): string {
  return grade.replace(/^Grade\s*/i, "G");
}

function byGradeNumber(rows: RegistryGradeCountRow[]): RegistryGradeCountRow[] {
  return [...rows].sort((a, b) => {
    const num = (value: string) => Number(value.match(/\d+/)?.[0] ?? 0);
    return num(a.grade) - num(b.grade);
  });
}

/**
 * Per-grade distribution with a metric switcher. One grade expands at a time
 * to compare roster, sections and subjects for that grade — the counts are
 * clickable/keyboard-operable rows, not a static recharts figure.
 */
export function RegistryGradePanel({ desk }: { desk: RegistryDesk }) {
  const { data, isPending, isError } = useQuery(registryOverviewQuery(desk));
  const [metric, setMetric] = React.useState<Metric>("roster");
  const [openGrade, setOpenGrade] = React.useState<string | null>(null);

  const sources = React.useMemo(
    () => ({
      roster: byGradeNumber(data?.rosterByGrade ?? []),
      sections: byGradeNumber(data?.sectionsByGrade ?? []),
      subjects: byGradeNumber(data?.subjectsByGrade ?? []),
    }),
    [data],
  );

  const rows = sources[metric];
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const metricLabel = METRICS.find((entry) => entry.key === metric)?.label ?? "Roster";

  const body = isPending ? (
    <div className={styles.gradeList} aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-7 w-full rounded-md" />
      ))}
    </div>
  ) : isError ? (
    <p className="px-1 py-4 text-center text-xs text-muted-foreground">
      Could not load grade counts.
    </p>
  ) : rows.length === 0 ? (
    <p className="px-1 py-4 text-center text-xs text-muted-foreground">
      No enrollments in this grade band yet.
    </p>
  ) : (
    <div className={styles.gradeList}>
      {rows.map((row) => {
        const expanded = openGrade === row.grade;
        const detail = [
          { label: "Roster", value: sources.roster.find((r) => r.grade === row.grade)?.count ?? 0 },
          { label: "Sections", value: sources.sections.find((r) => r.grade === row.grade)?.count ?? 0 },
          { label: "Subjects", value: sources.subjects.find((r) => r.grade === row.grade)?.count ?? 0 },
        ];
        return (
          <React.Fragment key={row.grade}>
            <button
              type="button"
              className={styles.gradeRow}
              aria-expanded={expanded}
              aria-label={`${row.grade}: ${row.count} ${metricLabel.toLowerCase()} — ${
                expanded ? "hide" : "show"
              } full breakdown`}
              onClick={() => setOpenGrade(expanded ? null : row.grade)}
            >
              <span className={styles.gradeLabel}>{shortGrade(row.grade)}</span>
              <span className={styles.gradeTrack} aria-hidden>
                <span
                  className={styles.gradeFill}
                  style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                />
              </span>
              <span className={styles.gradeValue}>{row.count}</span>
              <ChevronRight className={styles.gradeChevron} aria-hidden />
            </button>
            {expanded ? (
              <div className={styles.gradeDetail} role="status">
                {detail.map((item) => (
                  <span key={item.label} className={styles.gradeDetailItem}>
                    <span className={styles.gradeDetailLabel}>{item.label}</span>
                    <span className={styles.gradeDetailValue}>{item.value}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <KanbanBoard
      className="flex-1"
      title="Students per Grade Level"
      icon={
        <span className="text-amber-500" aria-hidden>
          <BarChart3 size={14} />
        </span>
      }
      count={isPending ? undefined : isError ? "—" : total}
      description="Enlisted learners, sections and subjects per grade — pick a metric, then open a grade to compare all three."
      headerToolbar={
        <FilterTabs
          label="Grade metric"
          options={METRICS.map((entry) => ({
            value: entry.key,
            label: entry.label,
          }))}
          value={metric}
          onChange={setMetric}
        />
      }
    >
      <div className={styles.panelBody}>{body}</div>
    </KanbanBoard>
  );
}
