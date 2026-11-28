"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, GraduationCap } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
import { InsightCallout } from "@/components/ui/insight-callout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GuidanceEmptyState } from "../../components/GuidanceEmptyCard";
import type { GuidanceGradeAttentionRow } from "@/services/guidance/overview.types";
import cascade from "@/components/shared/desk-cascade.module.css";
import styles from "./guidance-overview.module.css";

const LEVEL_COLOR: Record<"High" | "Moderate" | "Low", string> = {
  High: "text-red-600 dark:text-red-400",
  Moderate: "text-amber-600 dark:text-amber-400",
  Low: "text-emerald-600 dark:text-emerald-400",
};

function levelLabel(level: GuidanceGradeAttentionRow["mostLevel"]) {
  if (level === null) {
    return <span className="text-[12px] text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`text-[12px] font-semibold ${LEVEL_COLOR[level]}`}
      title={`Most common risk level in this grade: ${level}`}
    >
      {level}
    </span>
  );
}

interface GuidanceOverviewGradeTableProps {
  rows: GuidanceGradeAttentionRow[];
}

/**
 * Grade attention board — the same data-table language as the teacher's
 * advisory roster: a bordered wrapping table with a muted header row, fixed
 * columns and clickable rows. One row per grade level in grade order
 * (G7 → G12, never re-shuffled by risk): grade + section count, the grade's
 * at-risk sections, then the at-risk/high/moderate figures and the most
 * common risk level. Every row opens the interventions queue.
 */
export function GuidanceOverviewGradeTable({
  rows,
}: GuidanceOverviewGradeTableProps) {
  const router = useRouter();
  // Fixed G7 → G12 order — the board is a grade ladder, not a risk ranking.
  const ordered = React.useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          Number(a.short.replace(/\D/g, "")) - Number(b.short.replace(/\D/g, "")),
      ),
    [rows],
  );
  const totalAtRisk = ordered.reduce((n, row) => n + row.atRisk, 0);
  const totalHigh = ordered.reduce((n, row) => n + row.high, 0);

  const interpretation = React.useMemo(() => {
    if (totalAtRisk === 0) {
      return "No students are currently flagged as at-risk in any grade level this term.";
    }
    const top = [...ordered].sort((a, b) => b.atRisk - a.atRisk)[0];
    const hotspot =
      top.topSection !== "—" && top.topCount > 0
        ? `, concentrated in ${top.topSection} with ${top.topCount} students`
        : "";
    return `${totalAtRisk} are flagged at-risk, including ${totalHigh} high-risk. ${top.grade} needs the most attention with ${top.atRisk} flagged students${hotspot}.`;
  }, [ordered, totalAtRisk, totalHigh]);

  const openQueue = React.useCallback(() => {
    router.push("/guidance/interventions?status=all");
  }, [router]);

  return (
    <KanbanBoard
      bare
      title="Grade levels needing attention"
      className={styles.boardIn}
      icon={
        <span className="text-primary" aria-hidden>
          <GraduationCap size={14} />
        </span>
      }
      description="Live ranking — most at-risk students per grade this term."
      actions={
        <Link
          href="/guidance/interventions"
          className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
        >
          View all
        </Link>
      }
    >
      {ordered.length === 0 ? (
        <GuidanceEmptyState
          icon={GraduationCap}
          title="No grades to show"
          hint="Grade attention will appear here once students enroll."
        />
      ) : (
        <div className={styles.tableWrap}>
          <Table className={`${cascade.table} w-full table-fixed`}>
            <TableHeader>
              <TableRow className="bg-muted/50 [&>th]:border-t-0">
                <TableHead style={{ width: 200 }} className="h-10 truncate">
                  Grade level
                </TableHead>
                <TableHead style={{ width: 260 }} className="h-10 truncate">
                  Sections at risk
                </TableHead>
                <TableHead style={{ width: 90 }} className="h-10 truncate">
                  At risk
                </TableHead>
                <TableHead style={{ width: 80 }} className="h-10 truncate">
                  High
                </TableHead>
                <TableHead style={{ width: 100 }} className="h-10 truncate">
                  Moderate
                </TableHead>
                <TableHead style={{ width: 130 }} className="h-10 truncate">
                  Most common
                </TableHead>
                <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((row, index) => (
                <TableRow
                  key={row.short}
                  style={{
                    animationDelay: `${450 + Math.min(index, 11) * 140}ms`,
                  }}
                  onClick={openQueue}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openQueue();
                    }
                  }}
                  tabIndex={0}
                  aria-label={`${row.grade}: ${row.atRisk} at-risk students — open all intervention cases`}
                  className={styles.gradeRow}
                >
                  <TableCell className="truncate">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-primary"
                        aria-hidden
                      >
                        <GraduationCap size={16} />
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block truncate text-[13px] font-semibold text-primary"
                          title={row.grade}
                        >
                          {row.grade}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                          {row.sections} section{row.sections === 1 ? "" : "s"}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {row.sectionsList.length === 0 ? (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1">
                        {row.sectionsList.map((section) => (
                          <Pill
                            key={section.name}
                            label={`${section.name}: ${section.atRisk} at-risk students`}
                          >
                            {section.name}
                            <span
                              className="font-bold tabular-nums"
                              style={{ color: "var(--guidance-number)" }}
                            >
                              {section.atRisk}
                            </span>
                          </Pill>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="truncate">
                    <span
                      className="text-[12px] font-semibold tabular-nums text-amber-600 dark:text-amber-400"
                      title={`${row.atRisk} students at risk in ${row.grade}`}
                    >
                      {row.atRisk}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    {row.high > 0 ? (
                      <span className="text-[12px] font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {row.high}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="truncate">
                    {row.moderate > 0 ? (
                      <span className="text-[12px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {row.moderate}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="truncate">
                    {levelLabel(row.mostLevel)}
                  </TableCell>
                  <TableCell className="truncate">
                    <ChevronRight
                      size={15}
                      className="text-muted-foreground"
                      aria-hidden
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className={styles.footerSlot}>
        <InsightCallout className={styles.interpretation} role="status">
          <span className={styles.interpretationLabel}>What it means · </span>
          {interpretation}
        </InsightCallout>
      </div>
    </KanbanBoard>
  );
}
