"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  CircleSlash,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InsightCallout } from "@/components/ui/insight-callout";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { formatGrade } from "@/lib/utils";
import {
  fetchSubjectStudents,
  type RegistrySubject,
  type RegistrySubjectStudent,
} from "@/services/registry/academics.service";
import styles from "./subject-catalog.module.css";

type OutcomeFilter = "all" | "passed" | "failed" | "no-grade";

/** Two-letter monogram for the row avatar. */
function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Compact KPI cell for the learner statistic strip. */
function LearnerStat({
  icon: Icon,
  value,
  label,
  tone = "default",
  hint,
  progress,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  tone?: "default" | "green" | "red" | "muted";
  hint?: string;
  progress?: number | null;
}) {
  const textTone =
    tone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "text-red-600 dark:text-red-400"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  const iconTone =
    tone === "green"
      ? "text-emerald-500/80"
      : tone === "red"
        ? "text-red-500/80"
        : "text-muted-foreground/70";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-4 py-3">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <Icon size={12} aria-hidden className={iconTone} />
        <span className="truncate">{label}</span>
      </span>
      <span className={`text-2xl leading-none font-semibold tracking-tight tabular-nums ${textTone}`}>
        {value}
      </span>
      {progress !== undefined ? (
        <span
          className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        >
          <span
            className="block h-full rounded-full bg-emerald-500 transition-[width] duration-200"
            style={{ width: `${progress ?? 0}%` }}
          />
        </span>
      ) : hint ? (
        <span className="truncate text-[12px] leading-none text-muted-foreground/80">{hint}</span>
      ) : null}
    </div>
  );
}

function remarksTone(remarks: RegistrySubjectStudent["remarks"]) {
  if (remarks === "Passed") {
    return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400";
  }
  if (remarks === "Failed") {
    return "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400";
  }
  return "bg-muted text-muted-foreground ring-border";
}

/**
 * Subject → learners drill-down: who sits in this subject, the final grade
 * filed for each one, and the pass / fail split. Opened by clicking a row on
 * the subject catalog.
 */
export function SubjectLearnersOverlay({
  desk,
  subject,
  onClose,
}: {
  desk: "record-keeper" | "registrar";
  subject: RegistrySubject | null;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [outcome, setOutcome] = React.useState<OutcomeFilter>("all");

  const query = useQuery({
    queryKey: ["registry-subject-students", desk, subject?.id ?? "none"],
    queryFn: ({ signal }) => fetchSubjectStudents(desk, subject!.id, signal),
    enabled: subject !== null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const students = React.useMemo(() => query.data?.students ?? [], [query.data]);
  const stats = React.useMemo(() => {
    let passed = 0;
    let failed = 0;
    let noGrade = 0;
    for (const s of students) {
      if (s.remarks === "Passed") passed += 1;
      else if (s.remarks === "Failed") failed += 1;
      else noGrade += 1;
    }
    const graded = passed + failed;
    return {
      total: students.length,
      passed,
      failed,
      noGrade,
      graded,
      rate: graded > 0 ? Math.round((passed / graded) * 100) : null,
    };
  }, [students]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students
      .filter((s) => {
        if (outcome === "passed" && s.remarks !== "Passed") return false;
        if (outcome === "failed" && s.remarks !== "Failed") return false;
        if (outcome === "no-grade" && s.remarks !== "No grade yet") return false;
        if (!needle) return true;
        return (
          s.name.toLowerCase().includes(needle) ||
          s.lrn.includes(needle) ||
          s.section.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, q, outcome]);

  const gradeLabel = subject ? formatGrade(String(subject.gradeLevel)) : "";

  const outcomeOptions: Array<{
    value: OutcomeFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "All", count: stats.total },
    { value: "passed", label: "Passed", count: stats.passed },
    { value: "failed", label: "Failed", count: stats.failed },
    { value: "no-grade", label: "No grade", count: stats.noGrade },
  ];

  return (
    <KanbanOverlay
      open={subject !== null}
      onClose={onClose}
      width="2xl"
      icon={<Users size={14} className="text-amber-500" aria-hidden />}
      title={subject ? subject.name : "Subject"}
      ariaLabel="Subject learners"
      headerActions={
        subject ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Pill tone="green" label="Subject code">
              {subject.code}
            </Pill>
            <Pill tone="blue" label="Grade level">
              {gradeLabel}
            </Pill>
            <Pill tone="violet" label="Category">
              {subject.category}
            </Pill>
          </span>
        ) : null
      }
      description={`Learners in ${gradeLabel}${
        subject ? ` with their final grade in ${subject.code}` : ""
      } — passed, failed, or still without a grade.`}
    >
      <div className="flex flex-col gap-3 px-0.5 pb-0.5">
        <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg border border-border bg-muted/20 sm:grid-cols-4">
          <LearnerStat icon={Users} value={stats.total} label="Learners" hint="in this grade" />
          <LearnerStat
            icon={CheckCircle2}
            value={stats.passed}
            label="Passed"
            tone="green"
            hint={`${stats.graded} graded`}
          />
          <LearnerStat
            icon={XCircle}
            value={stats.failed}
            label="Failed"
            tone="red"
            hint={stats.failed === 0 ? "none below passing" : "below passing"}
          />
          <LearnerStat
            icon={TrendingUp}
            value={stats.rate === null ? "—" : `${stats.rate}%`}
            label="Pass rate"
            tone={stats.rate === null ? "muted" : "default"}
            progress={stats.rate}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex h-8 min-w-0 items-center gap-2 rounded-[16px] border border-border bg-background px-3 sm:max-w-xs sm:flex-1">
            <Search size={13} className="shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, LRN, or section"
              aria-label="Search learners"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          <FilterTabs
            label="Filter by outcome"
            options={outcomeOptions}
            value={outcome}
            onChange={setOutcome}
            className="self-start sm:self-auto"
          />
        </div>

        {query.isPending ? (
          <div className="flex flex-col gap-1.5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-md" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex min-h-28 flex-col items-center justify-center gap-2 py-8 text-center">
            <CircleSlash size={18} className="text-muted-foreground/60" aria-hidden />
            <p className="text-xs text-muted-foreground">Could not load the learners for this subject.</p>
            <button
              type="button"
              onClick={() => query.refetch()}
              className="flex cursor-pointer items-center gap-1 text-xs font-medium text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
            >
              <RefreshCw size={11} aria-hidden />
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center py-6">
            <InsightCallout role="status" className="mx-auto max-w-md text-center">
              {students.length === 0
                ? "No learners are enrolled in this grade yet."
                : "No learners match this search or filter."}
            </InsightCallout>
          </div>
        ) : (
          <>
            <div className={styles.learnerList}>
              <div className={styles.learnerHead} aria-hidden>
                <span>Learner</span>
                <span>Section</span>
                <span className="text-right">Final grade</span>
                <span className="text-right">Remarks</span>
              </div>
              <ul className="flex flex-col">
                {rows.map((s) => (
                  <li key={s.id} className={styles.learnerRow}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-muted-foreground ring-1 ring-border"
                        aria-hidden
                      >
                        {initialsOf(s.name) || <GraduationCap size={13} />}
                      </span>
                      <span className="flex min-w-0 flex-col gap-px">
                        <span className="truncate text-xs font-medium text-foreground">{s.name}</span>
                        <span className="truncate font-mono text-[12px] tracking-tight text-muted-foreground">
                          {s.lrn}
                        </span>
                      </span>
                    </span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {s.section && s.section !== "—" ? s.section : "Unassigned"}
                    </span>
                    <span
                      className={`text-right font-mono text-sm font-semibold tabular-nums ${
                        s.remarks === "No grade yet" ? "text-muted-foreground/70" : "text-foreground"
                      }`}
                    >
                      {s.remarks === "No grade yet" ? "—" : s.finalGrade}
                    </span>
                    <span className="flex justify-end">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ring-1 ${remarksTone(
                          s.remarks,
                        )}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                        {s.remarks === "No grade yet" ? "No grade" : s.remarks}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between gap-2 px-0.5 text-[12px] text-muted-foreground">
              <span>
                Showing <span className="font-medium text-foreground">{rows.length}</span> of{" "}
                {stats.total} learner{stats.total === 1 ? "" : "s"}
              </span>
              {query.isFetching ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" aria-hidden />
                  Refreshing…
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </KanbanOverlay>
  );
}
