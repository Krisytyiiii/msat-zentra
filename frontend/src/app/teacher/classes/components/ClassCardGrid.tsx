"use client";

import * as React from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Layers,
  MapPin,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { WEEK_LABELS_SHORT } from "@/services/teacher/schedule";
import { formatRange } from "@/components/schedule/schedule-time";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";
import type { MyClass, MySlot, PeriodTimes } from "./class-types";

interface Props {
  classes: MyClass[];
  slots: MySlot[];
  periodTimes: PeriodTimes;
  todayDow: number | null;
  nowMin: number | null;
  grade: string | null;
  query: string;
  onOpen: (cls: MyClass) => void;
}

function gradeNumber(grade: string): number {
  return Number(grade.replace("G", "")) || 0;
}

function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

/**
 * Teacher My Classes, presented as the same action cards the administrator's
 * schedule board uses: one card per subject × section, with status, coverage
 * rail, load facts and an "Open class" action that slides its detail drawer in.
 */
export function ClassCardGrid({
  classes,
  slots,
  periodTimes,
  todayDow,
  nowMin,
  grade,
  query,
  onOpen,
}: Props) {
  const needle = query.trim().toLowerCase();

  const sessionsOf = React.useCallback(
    (cls: MyClass) =>
      slots
        .filter(
          (slot) =>
            slot.subject.id === cls.subjectId && slot.section.id === cls.sectionId,
        )
        .sort((a, b) => a.day - b.day || a.period - b.period),
    [slots],
  );

  const nextLabelOf = React.useCallback(
    (sessions: MySlot[]) => {
      if (sessions.length === 0) return null;
      let next = sessions[0]!;
      if (todayDow != null && nowMin != null) {
        next =
          sessions.find((slot) => {
            if (slot.day !== todayDow) return slot.day > todayDow;
            const time = periodTimes.get(slot.period);
            return time ? time.endMin > nowMin : true;
          }) ?? sessions[0]!;
      }
      const time = periodTimes.get(next.period);
      return `${WEEK_LABELS_SHORT[next.day - 1]} · ${
        time ? formatRange(time.startMin, time.endMin) : `Period ${next.period + 1}`
      }`;
    },
    [todayDow, nowMin, periodTimes],
  );

  const visible = React.useMemo(
    () =>
      classes
        .filter((cls) => {
          if (grade != null && cls.gradeLevel !== grade) return false;
          if (!needle) return true;
          return (
            cls.subjectName.toLowerCase().includes(needle) ||
            cls.subjectCode.toLowerCase().includes(needle) ||
            cls.sectionName.toLowerCase().includes(needle)
          );
        })
        .sort(
          (a, b) =>
            gradeNumber(a.gradeLevel) - gradeNumber(b.gradeLevel) ||
            a.sectionName.localeCompare(b.sectionName) ||
            a.subjectName.localeCompare(b.subjectName),
        ),
    [classes, grade, needle],
  );

  return (
    <div className={cn(cardStyles.grid, "min-w-0")} aria-label="Classes">
      {visible.map((cls, index) => {
        const sessions = sessionsOf(cls);
        const dayCount = new Set(sessions.map((slot) => slot.day)).size;
        const minutes = sessions.reduce((sum, slot) => {
          const time = periodTimes.get(slot.period);
          return sum + (time ? time.endMin - time.startMin : 0);
        }, 0);
        const pct = Math.round((dayCount / 5) * 100);
        const scheduled = sessions.length > 0;
        const nextLabel = nextLabelOf(sessions);
        return (
          <article
            key={`${cls.subjectId}|${cls.sectionId}`}
            className={cn(scheduleCardStyles.card, scheduled && scheduleCardStyles.cardPublished)}
            aria-label={`${cls.subjectName} — ${cls.sectionName}`}
            style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
          >
            <header className={cardStyles.cardHead}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <BookOpen size={16} aria-hidden />
              </span>
              <div className={cardStyles.cardId}>
                <span className={cardStyles.sectionName} title={cls.subjectName}>
                  {cls.subjectName}
                </span>
                <span className={cardStyles.teacher} title={cls.sectionName}>
                  {cls.sectionName} · {cls.subjectCode}
                </span>
              </div>
              <span className={scheduleCardStyles.gradeText}>
                Grade {cls.gradeLevel.replace("G", "")}
              </span>
            </header>

            <div className={cardStyles.metaRow}>
              {scheduled ? (
                <span className={scheduleCardStyles.statusText} data-tone="green">
                  <Check size={12} aria-hidden />
                  Scheduled
                </span>
              ) : (
                <span className={scheduleCardStyles.statusText} data-tone="neutral">
                  No timeslot yet
                </span>
              )}
              <span className={scheduleCardStyles.codeBadgeWrap}>
                <Pill tone="amber" label="Subject code">
                  {cls.subjectCode}
                </Pill>
              </span>
            </div>

            <div
              className={scheduleCardStyles.progress}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`${dayCount} of 5 weekdays have a session`}
            >
              <span
                className={cn(
                  scheduleCardStyles.progressFill,
                  dayCount === 5 && scheduleCardStyles.progressDone,
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={scheduleCardStyles.progressLine}>
              {scheduled
                ? `${sessions.length} session${sessions.length === 1 ? "" : "s"} across ${dayCount} day${dayCount === 1 ? "" : "s"}`
                : "No published timeslot this term"}
            </p>

            <div className={cardStyles.linksRow}>
              <span className={cardStyles.linkStat}>
                <Layers size={11} aria-hidden />
                {sessions.length} session{sessions.length === 1 ? "" : "s"}
              </span>
              <span className={cardStyles.linkStat}>
                <Clock size={11} aria-hidden />
                {durationLabel(minutes)} weekly
              </span>
              <span className={cardStyles.linkStat}>
                <MapPin size={11} aria-hidden />
                {cls.sectionName}
              </span>
            </div>

            <div className={cardStyles.cardActions}>
              <span className={`${cardStyles.lockedHint} min-w-0`}>
                <CalendarDays size={11} aria-hidden />
                <span className="truncate">
                  {nextLabel ? `Next · ${nextLabel}` : "Not placed yet"}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
                onClick={() => onOpen(cls)}
                aria-label={`Open class details for ${cls.subjectName}, ${cls.sectionName}`}
              >
                Open class
                <ChevronRight size={12} aria-hidden />
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
