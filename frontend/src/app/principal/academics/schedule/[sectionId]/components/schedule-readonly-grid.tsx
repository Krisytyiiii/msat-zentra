"use client";

import { Check, ClipboardCheck, Coffee, Pencil, Utensils } from "lucide-react";
import type { ComponentType } from "react";
import { WEEK_LABELS_SHORT } from "@/services/teacher/schedule";
import {
  formatRange,
  type DayConfig,
} from "@/app/teacher/schedule/components/schedule-time";
import type { SlotFilter, SubmissionEntry } from "./use-principal-schedule-section";
import styles from "./schedule-readonly-grid.module.css";

const DAYS = [1, 2, 3, 4, 5];

type SlotStatus = "draft" | "submitted" | "approved";

const STATUS_META: Record<
  SlotStatus,
  { label: string; Icon: ComponentType<{ size?: number | string; className?: string }> }
> = {
  draft: { label: "draft", Icon: Pencil },
  submitted: { label: "submitted", Icon: ClipboardCheck },
  approved: { label: "approved", Icon: Check },
};

function statusOf(entry: SubmissionEntry): SlotStatus {
  if (entry.status === "APPROVED") return "approved";
  if (entry.status === "SUBMITTED") return "submitted";
  return "draft";
}

/**
 * Read-only weekly timetable. The grid is the full week (every period cell is
 * rendered, empty ones included) so the principal can judge coverage, and the
 * status filter from the review deck fades non-matching slots instead of
 * removing rows — the shape of the week stays legible.
 */
export function ScheduleReadonlyGrid({
  config,
  rows,
  entryByKey,
  filter = "all",
}: {
  config: DayConfig | null;
  rows: ReturnType<typeof import("@/app/teacher/schedule/components/schedule-time").buildTimetable>;
  entryByKey: Map<string, SubmissionEntry>;
  filter?: SlotFilter;
}) {
  if (!config) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load timetable times — approve by slot count instead, or try again later.
      </p>
    );
  }

  const periodRows = rows.filter((row) => row.kind === "period");
  const capacity = periodRows.length * DAYS.length;
  const filled = entryByKey.size;
  const submitted = Array.from(entryByKey.values()).filter(
    (entry) => entry.status === "SUBMITTED",
  ).length;
  const dayCounts = DAYS.map((day) => {
    let count = 0;
    for (const row of rows) {
      if (row.kind !== "period") continue;
      if (entryByKey.has(`${day}:${row.periodIndex}`)) count += 1;
    }
    return count;
  });
  const filtering = filter !== "all";

  return (
    <section className={styles.wrap} aria-label="Weekly timetable">
      <div className={styles.caption}>
        <span className={styles.captionTitle}>Weekly timetable</span>
        <span className={styles.captionMeta}>
          <strong>{filled}</strong> of {capacity} slots filled
          {submitted > 0 ? (
            <>
              <span className={styles.captionSep} aria-hidden />
              <span className={styles.captionPending}>
                {submitted} awaiting review
              </span>
            </>
          ) : null}
        </span>
      </div>

      <div className={styles.scroller}>
        <table className={styles.table}>
          <caption className="sr-only">
            Weekly timetable across Monday to Friday
            {filtering ? `, filtered to ${filter} slots` : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.timeHead}>
                <span className="sr-only">Time</span>
              </th>
              {DAYS.map((day, index) => (
                <th key={day} scope="col" className={styles.dayHead}>
                  <span className={styles.dayLabel}>{WEEK_LABELS_SHORT[day - 1]}</span>
                  <span className={styles.dayCount}>
                    {dayCounts[index]} slot{dayCounts[index] === 1 ? "" : "s"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              if (row.kind !== "period") {
                const isLunch = row.kind === "lunch";
                return (
                  <tr key={`break-${ri}`} className={styles.breakRow}>
                    <td colSpan={DAYS.length + 1} className={styles.breakCell}>
                      {isLunch ? (
                        <>
                          <Utensils size={12} aria-hidden />
                          Lunch break · {formatRange(row.startMin, row.endMin)}
                        </>
                      ) : (
                        <>
                          <Coffee size={12} aria-hidden />
                          {row.label} · {formatRange(row.startMin, row.endMin)}
                        </>
                      )}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={`period-${row.periodIndex}`} className={styles.periodRow}>
                  <th scope="row" className={styles.timeCell}>
                    <span className={styles.timeRange}>
                      {formatRange(row.startMin, row.endMin)}
                    </span>
                    <span className={styles.periodLabel}>Period {row.periodIndex}</span>
                  </th>
                  {DAYS.map((day) => {
                    const entry = entryByKey.get(`${day}:${row.periodIndex}`) ?? null;
                    const timeLabel = `${WEEK_LABELS_SHORT[day - 1]} ${formatRange(row.startMin, row.endMin)}`;

                    if (!entry) {
                      return (
                        <td key={day} className={styles.cell}>
                          <div
                            aria-label={`${timeLabel}, empty`}
                            title="Empty slot"
                            data-dim={filtering ? "true" : undefined}
                            className={styles.empty}
                          >
                            <span aria-hidden>—</span>
                          </div>
                        </td>
                      );
                    }

                    const status = statusOf(entry);
                    const meta = STATUS_META[status];
                    const dim = filtering && status !== filter;
                    const Icon = meta.Icon;
                    const label = `${timeLabel}, ${entry.subject.name}${
                      entry.teacherName ? ` with ${entry.teacherName.name}` : ""
                    } (${meta.label})`;

                    return (
                      <td key={day} className={styles.cell}>
                        <div
                          aria-label={label}
                          title={`${entry.subject.name}${
                            entry.teacherName ? ` — ${entry.teacherName.name}` : ""
                          } (${meta.label})`}
                          data-status={status}
                          data-dim={dim ? "true" : undefined}
                          className={styles.slot}
                        >
                          <span className={styles.slotTop}>
                            <span className={styles.slotName} title={entry.subject.name}>
                              {entry.subject.name}
                            </span>
                            <span className={styles.slotState} aria-hidden>
                              <Icon size={10} />
                            </span>
                          </span>
                          <span className={styles.slotTeacher}>
                            {entry.teacherName?.name ?? "Unassigned"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
