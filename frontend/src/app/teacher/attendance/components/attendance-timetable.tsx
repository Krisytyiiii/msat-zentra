"use client";

import * as React from "react";
import { Coffee, Utensils } from "lucide-react";

import { WEEK_LABELS_SHORT } from "@/services/teacher/schedule";
import { formatRange, type TimetableRow } from "@/components/schedule/schedule-time";
import { ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { cn } from "@/lib/utils";
import type { AttendancePair } from "./use-attendance-pairs";

const DAYS = [1, 2, 3, 4, 5];
const SKELETON_PERIODS = 8;
const SKELETON_LUNCH_AFTER = 4;

export interface AttendanceCell {
  key: string;
  pairKey: string;
  section: AttendancePair["section"];
  subject: NonNullable<AttendancePair["subject"]>;
  day: number;
  period: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
}

interface Props {
  rows: TimetableRow[];
  pairs: AttendancePair[];
  todayDow: number | null;
  nowMin: number;
  activeKey: string | null;
  onPick: (cell: AttendanceCell) => void;
}

/**
 * The teacher's published teaching load as a week grid — the same day × period
 * timetable `/teacher/classes` renders, but each slot is a button that opens
 * the attendance drawer for that class and weekday.
 */
export function AttendanceTimetable({
  rows,
  pairs,
  todayDow,
  nowMin,
  activeKey,
  onPick,
}: Props) {
  const byCell = new Map<string, AttendanceCell[]>();
  for (const pair of pairs) {
    if (!pair.subject) continue;
    for (const slot of pair.slots) {
      const key = `${pair.key}|${slot.day}|${slot.period}`;
      const cell: AttendanceCell = {
        key,
        pairKey: pair.key,
        section: pair.section,
        subject: pair.subject,
        day: slot.day,
        period: slot.period,
        status: slot.status,
      };
      const list = byCell.get(`${slot.day}:${slot.period}`);
      if (list) list.push(cell);
      else byCell.set(`${slot.day}:${slot.period}`, [cell]);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card dark:bg-transparent">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-28 p-2 text-left">
              <span className="sr-only">Time</span>
            </th>
            {DAYS.map((day) => (
              <th
                key={day}
                scope="col"
                className={cn(
                  "border-l border-border/60 p-2 text-center text-xs font-semibold",
                  todayDow === day && "text-amber-600 dark:text-amber-400",
                )}
              >
                {WEEK_LABELS_SHORT[day - 1]}
                {todayDow === day ? (
                  <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[12px] font-medium text-amber-700 dark:text-amber-300">
                    Today
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            if (row.kind !== "period") {
              const isLunch = row.kind === "lunch";
              return (
                <tr key={`break-${ri}`}>
                  <td
                    colSpan={DAYS.length + 1}
                    className="border-t border-border/60 bg-muted/30 px-2 py-1 text-center text-xs text-muted-foreground"
                  >
                    {isLunch ? (
                      <>
                        <Utensils size={12} className="mr-1 inline" aria-hidden />
                        Lunch Break · {formatRange(row.startMin, row.endMin)}
                      </>
                    ) : (
                      <>
                        <Coffee size={12} className="mr-1 inline" aria-hidden /> {row.label} ·{" "}
                        {formatRange(row.startMin, row.endMin)}
                      </>
                    )}
                  </td>
                </tr>
              );
            }

            return (
              <tr key={`period-${row.periodIndex}`}>
                <th
                  scope="row"
                  className="border-t border-border/60 p-2 text-left align-top text-xs font-medium whitespace-nowrap text-muted-foreground"
                >
                  <span className="block font-semibold text-foreground/80">
                    Period {row.periodIndex + 1}
                  </span>
                  {formatRange(row.startMin, row.endMin)}
                </th>
                {DAYS.map((day) => {
                  const cellSlots = byCell.get(`${day}:${row.periodIndex}`) ?? [];
                  return (
                    <td key={day} className="border-t border-l border-border/60 p-1 align-top">
                      {cellSlots.length === 0 ? (
                        <div
                          aria-label={`${WEEK_LABELS_SHORT[day - 1]} ${formatRange(row.startMin, row.endMin)}, free`}
                          className="flex min-h-14 items-center justify-center rounded-md border border-dashed border-border/70 text-xs text-muted-foreground/60"
                        >
                          —
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {cellSlots.map((cell) => {
                            const live =
                              todayDow === day &&
                              nowMin >= row.startMin &&
                              nowMin < row.endMin;
                            const active = cell.key === activeKey;
                            const timeLabel = `${WEEK_LABELS_SHORT[day - 1]} ${formatRange(row.startMin, row.endMin)}`;
                            return (
                              <button
                                key={cell.key}
                                type="button"
                                onClick={() => onPick(cell)}
                                aria-current={active ? "true" : undefined}
                                aria-label={`${timeLabel}, ${cell.subject.name} — ${cell.section.name}${live ? ", live now" : ""}`}
                                title={`${cell.subject.name} · ${cell.section.name} · ${cell.subject.code}`}
                                className={cn(
                                  "relative flex min-h-14 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-solid px-1.5 py-1 text-center text-xs transition-colors duration-150",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
                                  live
                                    ? "border-green-500/60 bg-green-500/10"
                                    : "border-amber-500/25 bg-amber-500/10 hover:border-amber-500/60 hover:bg-amber-500/20",
                                  active && "border-amber-500 bg-amber-500/20 ring-1 ring-amber-500/40",
                                )}
                              >
                                <span className="w-full truncate font-medium text-foreground">
                                  {cell.subject.name}
                                </span>
                                <span className="w-full truncate text-[12px] text-muted-foreground">
                                  {cell.section.name} · Grade{" "}
                                  {cell.section.gradeLevel
                                    ? cell.section.gradeLevel.replace("G", "")
                                    : "—"}
                                </span>
                                {live ? (
                                  <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-green-700 dark:text-green-400">
                                    <span className="size-1.5 rounded-full bg-green-500" aria-hidden />
                                    Live
                                  </span>
                                ) : null}
                                <span
                                  aria-hidden
                                  className={cn(
                                    "absolute bottom-1.5 left-1.5 size-1.5 rounded-full",
                                    cell.status === "APPROVED"
                                      ? "bg-green-500"
                                      : cell.status === "SUBMITTED"
                                        ? "bg-blue-500"
                                        : "bg-amber-500",
                                  )}
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Loading placeholder for the week grid — same table shell, day columns and
 * period rows as the real timetable, built from the shared `ShimmerSkeleton`
 * sheen so the fetch reads as a sweep rather than a pulse.
 */
export function AttendanceTimetableSkeleton() {
  return (
    <div
      className="overflow-x-auto rounded-xl border border-border bg-card dark:bg-transparent"
      aria-busy="true"
      aria-label="Loading weekly attendance"
    >
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-28 p-2 text-left">
              <ShimmerSkeleton className="h-3 w-10" />
            </th>
            {DAYS.map((day) => (
              <th key={day} scope="col" className="border-l border-border/60 p-2">
                <ShimmerSkeleton className="mx-auto h-3 w-12" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: SKELETON_PERIODS }).map((_, period) => (
            <React.Fragment key={period}>
              <tr>
                <th scope="row" className="border-t border-border/60 p-2 text-left align-top">
                  <ShimmerSkeleton className="h-3 w-14" />
                  <ShimmerSkeleton className="mt-1.5 h-3 w-20" />
                </th>
                {DAYS.map((day) => (
                  <td key={day} className="border-t border-l border-border/60 p-1 align-top">
                    <ShimmerSkeleton className="h-14 w-full" />
                  </td>
                ))}
              </tr>
              {period === SKELETON_LUNCH_AFTER - 1 ? (
                <tr>
                  <td
                    colSpan={DAYS.length + 1}
                    className="border-t border-border/60 bg-muted/30 px-2 py-1.5"
                  >
                    <ShimmerSkeleton className="mx-auto h-3 w-44" />
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
