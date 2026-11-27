"use client";

import { Coffee, Utensils } from "lucide-react";

import { WEEK_LABELS_SHORT } from "@/services/teacher/schedule";
import { formatRange, type TimetableRow } from "@/components/schedule/schedule-time";
import { cn } from "@/lib/utils";
import type { MySlot } from "./class-types";

const DAYS = [1, 2, 3, 4, 5];

interface Props {
  rows: TimetableRow[];
  slots: MySlot[];
  todayDow: number | null;
}

/**
 * The teacher's own published teaching load as a week grid — the same
 * day × period timetable the administrator's section workspace renders, but
 * read-only and non-interactive.
 */
export function ClassTimetable({ rows, slots, todayDow }: Props) {
  const byCell = new Map<string, MySlot[]>();
  for (const slot of slots) {
    const key = `${slot.day}:${slot.period}`;
    const list = byCell.get(key);
    if (list) list.push(slot);
    else byCell.set(key, [slot]);
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
                          {cellSlots.map((slot) => {
                            const timeLabel = `${WEEK_LABELS_SHORT[day - 1]} ${formatRange(row.startMin, row.endMin)}`;
                            const label = `${timeLabel}, ${slot.subject.name} — ${slot.section.name}`;
                            return (
                              <div
                                key={`${slot.subject.id}-${slot.section.id}`}
                                aria-label={label}
                                title={`${slot.subject.name} · ${slot.section.name} · ${slot.subject.code}`}
                                className="relative flex min-h-14 w-full flex-col items-center justify-center rounded-md border border-solid border-amber-500/25 bg-amber-500/10 px-1.5 py-1 text-center text-xs"
                              >
                                <span className="w-full truncate font-medium text-foreground">
                                  {slot.subject.name}
                                </span>
                                <span className="w-full truncate text-[12px] text-muted-foreground">
                                  {slot.section.name} · Grade{" "}
                                  {slot.section.gradeLevel.replace("G", "")}
                                </span>
                                <span
                                  aria-hidden
                                  className={cn(
                                    "absolute bottom-1.5 left-1.5 size-1.5 rounded-full",
                                    slot.status === "APPROVED"
                                      ? "bg-green-500"
                                      : slot.status === "SUBMITTED"
                                        ? "bg-blue-500"
                                        : "bg-amber-500",
                                  )}
                                />
                              </div>
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
