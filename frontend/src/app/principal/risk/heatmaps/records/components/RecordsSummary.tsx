"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  FileText,
  Layers,
  ShieldAlert,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import {
  CATEGORY_KEYS,
  CATEGORY_META,
  fetchRecords,
} from "@/services/principal/records.service";
import type { BehavioralCategory } from "../types";
import { liveQueryOptions } from "@/lib/api/live";
import styles from "./RecordsSummary.module.css";

/**
 * Records desk summary — one stat strip plus the two follow-up panels that used
 * to live behind the icon rail (category split and the heaviest record loads).
 * Everything is on the page now, so the desk reads top-down: totals, then
 * where the records sit, then the learners carrying them.
 */
export function RecordsSummary({
  category,
  onSelectCategory,
  onFocusLearner,
}: {
  category: BehavioralCategory | null;
  onSelectCategory: (category: BehavioralCategory | null) => void;
  onFocusLearner: (lrn: string) => void;
}) {
  const { data, isPending } = useQuery({
    ...liveQueryOptions,
    queryKey: ["records-heatmap"],
    queryFn: fetchRecords,
  });

  const model = React.useMemo(() => {
    const students = (data?.sections ?? []).flatMap((s) => s.students);
    const records = students.flatMap((s) => s.behavioral);

    const byCategory = new Map<BehavioralCategory, number>();
    for (const key of CATEGORY_KEYS) byCategory.set(key, 0);
    for (const rec of records) {
      const key = CATEGORY_KEYS.includes(rec.category)
        ? rec.category
        : "behavioral";
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    }

    const categories = Array.from(byCategory.entries())
      .map(([key, count]) => ({ key, count }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);

    const learners = students.filter((s) => s.behavioral.length > 0);

    const heaviest = [...learners]
      .sort((a, b) => {
        const diff = b.behavioral.length - a.behavioral.length;
        if (diff !== 0) return diff;
        return (
          b.behavioral.filter((r) => r.severity === "High").length -
          a.behavioral.filter((r) => r.severity === "High").length
        );
      })
      .slice(0, 5)
      .map((s) => ({
        lrn: s.lrn,
        name: s.name,
        section: s.section,
        grade: s.gradeLevel,
        total: s.behavioral.length,
        high: s.behavioral.filter((r) => r.severity === "High").length,
        pending: s.behavioral.filter((r) => r.followUp === "Pending").length,
      }));

    return {
      total: records.length,
      learners: learners.length,
      high: records.filter((r) => r.severity === "High").length,
      days: new Set(records.map((r) => r.date)).size,
      categories,
      heaviest,
      maxCategory: categories.reduce((max, c) => Math.max(max, c.count), 0),
    };
  }, [data]);

  const tiles: StatDeckItem[] = [
    {
      key: "total",
      icon: FileText,
      label: "Records on file",
      unit: "records",
      value: model.total,
      hint: `${model.categories.length} categor${
        model.categories.length === 1 ? "y" : "ies"
      } in play this term`,
    },
    {
      key: "learners",
      icon: Users,
      label: "Learners tracked",
      unit: "learners",
      value: model.learners,
      hint: "Learners with at least one record",
    },
    {
      key: "high",
      icon: TriangleAlert,
      label: "High severity",
      unit: "records",
      value: model.high,
      hint: "Flagged high for immediate follow-up",
      tone: "red",
    },
    {
      key: "days",
      icon: CalendarDays,
      label: "Filing days",
      unit: "days",
      value: model.days,
      hint: "Days with at least one record filed",
    },
  ];

  if (!isPending && model.total === 0) return null;

  return (
    <div className={styles.wrap}>
      <StatDeck
        title="Records at a glance"
        icon={FileText}
        items={tiles}
        loading={isPending}
        hidden={!isPending && model.total === 0}
      />

      <div className={styles.panels}>
        <section className={styles.panel} aria-label="Records by category">
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>
              <Layers size={14} aria-hidden />
              Category breakdown
            </span>
            <span className={styles.panelDesc}>
              Pick a category to filter the record list below.
            </span>
          </div>

          <div className={styles.rail} aria-hidden="true">
            <span>Category</span>
            <span>Load</span>
            <span className={styles.railNum}>Records</span>
            <span className={styles.railNum}>Share</span>
          </div>

          <div className={styles.body}>
            {isPending
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={styles.rowSkeleton} aria-hidden>
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-1.5 w-full rounded-full" />
                    <Skeleton className="h-3.5 w-6" />
                    <Skeleton className="h-3.5 w-8" />
                  </div>
                ))
              : model.categories.map((row) => {
                  const meta = CATEGORY_META[row.key];
                  const share =
                    model.total > 0
                      ? Math.round((row.count / model.total) * 100)
                      : 0;
                  const width =
                    model.maxCategory > 0
                      ? Math.max(4, (row.count / model.maxCategory) * 100)
                      : 0;
                  const active = category === row.key;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() =>
                        onSelectCategory(active ? null : row.key)
                      }
                      className={`${styles.row} ${
                        active ? styles.rowActive : ""
                      }`}
                      aria-pressed={active}
                      aria-label={`${meta.label}: ${row.count} records, ${share}% of all records — ${
                        active ? "clear the filter" : "filter the record list"
                      }`}
                    >
                      <span className={styles.rowLabel}>
                        <span
                          className={styles.swatch}
                          style={{ background: meta.color }}
                          aria-hidden
                        />
                        {meta.label}
                      </span>
                      <span className={styles.meter} aria-hidden>
                        <span
                          className={styles.meterFill}
                          style={{ width: `${width}%`, background: meta.color }}
                        />
                      </span>
                      <span className={styles.rowCount}>{row.count}</span>
                      <span className={styles.rowShare}>{share}%</span>
                    </button>
                  );
                })}
          </div>
        </section>

        <section
          className={styles.panel}
          aria-label="Learners with the heaviest record load"
        >
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>
              <ShieldAlert size={14} aria-hidden />
              Needs attention
            </span>
            <span className={styles.panelDesc}>
              Heaviest record load — pick a learner to pull up their records.
            </span>
          </div>

          <div
            className={`${styles.rail} ${styles.railAttention}`}
            aria-hidden="true"
          >
            <span>#</span>
            <span>Learner</span>
            <span className={styles.railNum}>Records</span>
            <span className={styles.railNum}>High</span>
          </div>

          <div className={styles.body}>
            {isPending
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`${styles.rowSkeleton} ${styles.rowSkeletonAttention}`}
                    aria-hidden
                  >
                    <Skeleton className="h-3.5 w-4" />
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3.5 w-6" />
                    <Skeleton className="h-3.5 w-6" />
                  </div>
                ))
              : model.heaviest.map((s, i) => (
                  <button
                    key={s.lrn}
                    type="button"
                    onClick={() => onFocusLearner(s.lrn)}
                    className={`${styles.row} ${styles.rowAttention}`}
                    aria-label={`${s.name}, ${s.section}: ${s.total} records, ${s.high} high severity — search their records`}
                  >
                    <span
                      className={`${styles.rank} ${
                        i === 0 ? styles.rankTop : ""
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.who}>
                      <span className={styles.name}>{s.name}</span>
                      <span className={styles.where}>
                        {s.section}
                        {s.pending > 0
                          ? ` · ${s.pending} follow-up${
                              s.pending === 1 ? "" : "s"
                            } pending`
                          : ""}
                      </span>
                    </span>
                    <span className={styles.rowCount}>{s.total}</span>
                    <span
                      className={`${styles.rowShare} ${
                        s.high > 0 ? styles.rowShareHot : ""
                      }`}
                    >
                      {s.high}
                    </span>
                  </button>
                ))}
          </div>
        </section>
      </div>
    </div>
  );
}
