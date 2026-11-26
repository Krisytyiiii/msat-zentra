"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarCheck,
  Clock,
  MapPin,
  NotebookPen,
} from "lucide-react";

import { SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { WEEK_LABELS_SHORT } from "@/services/teacher/schedule";
import { formatClock, formatRange } from "@/components/schedule/schedule-time";
import type { MyClass, MySlot, PeriodTimes } from "./class-types";
import styles from "./class-detail-drawer.module.css";

interface Props {
  selectedClass: MyClass | null;
  slots: MySlot[];
  periodTimes: PeriodTimes;
  todayDow: number | null;
  nowMin: number | null;
  onClose: () => void;
}

const DAYS = [1, 2, 3, 4, 5] as const;

/**
 * Class detail drawer: slides in from the right like the administrator's
 * schedule drawer, with its header/body/footer easing in from the edge instead
 * of snapping. Holds the class's published week, facts and desk actions.
 */
export function ClassDetailDrawer({
  selectedClass,
  slots,
  periodTimes,
  todayDow,
  nowMin,
  onClose,
}: Props) {
  const selectedSlots = React.useMemo(() => {
    if (!selectedClass) return [];
    return slots
      .filter(
        (slot) =>
          slot.subject.id === selectedClass.subjectId &&
          slot.section.id === selectedClass.sectionId,
      )
      .sort((a, b) => a.day - b.day || a.period - b.period);
  }, [selectedClass, slots]);

  const selectedMinutes = selectedSlots.reduce((sum, slot) => {
    const time = periodTimes.get(slot.period);
    return sum + (time ? time.endMin - time.startMin : 0);
  }, 0);
  const selectedTimeLabel =
    selectedMinutes >= 60
      ? `${Math.floor(selectedMinutes / 60)}h${selectedMinutes % 60 ? ` ${selectedMinutes % 60}m` : ""}`
      : `${selectedMinutes}m`;
  const selectedDays = React.useMemo(
    () => Array.from(new Set(selectedSlots.map((slot) => slot.day))).sort((a, b) => a - b),
    [selectedSlots],
  );
  const nextSlot = React.useMemo(() => {
    if (selectedSlots.length === 0) return null;
    const sorted = [...selectedSlots].sort((a, b) => a.day - b.day || a.period - b.period);
    if (todayDow == null || nowMin == null) return sorted[0];
    return (
      sorted.find((slot) => {
        if (slot.day !== todayDow) return slot.day > todayDow;
        const time = periodTimes.get(slot.period);
        return time ? time.endMin > nowMin : true;
      }) ?? sorted[0]
    );
  }, [selectedSlots, todayDow, nowMin, periodTimes]);
  const nextSlotLabel = (() => {
    if (!nextSlot) return null;
    const time = periodTimes.get(nextSlot.period);
    return `${WEEK_LABELS_SHORT[nextSlot.day - 1]} · ${
      time ? formatRange(time.startMin, time.endMin) : `Period ${nextSlot.period + 1}`
    }`;
  })();

  return (
    <SidePanel
      open={!!selectedClass}
      onClose={onClose}
      label={selectedClass ? `${selectedClass.subjectName} — class details` : "Class details"}
      width="xl"
      showCloseButton
    >
      {selectedClass ? (
        <div
          key={`${selectedClass.subjectId}|${selectedClass.sectionId}`}
          className={styles.panel}
        >
          <header className={styles.header}>
            <span className={styles.iconTile} aria-hidden>
              <BookOpen size={18} />
            </span>
            <div className={styles.headText}>
              <h2 className={styles.title}>{selectedClass.subjectName}</h2>
              <p className={styles.subtitle}>
                {selectedClass.sectionName} · Grade{" "}
                {selectedClass.gradeLevel.replace("G", "")}
              </p>
            </div>
          </header>

          <div className={styles.body}>
            <div className={styles.pills}>
              <Pill tone="amber" label="Subject code">
                {selectedClass.subjectCode}
              </Pill>
              <Pill field="grade">
                Grade {selectedClass.gradeLevel.replace("G", "")}
              </Pill>
              <Pill field="section">{selectedClass.sectionName}</Pill>
            </div>

            <div className={styles.detailGrid}>
              <section
                aria-label="Week at a glance"
                className={styles.weekCard}
              >
                <header className={styles.weekHead}>
                  <p className={styles.eyebrow}>Week at a glance</p>
                  <span className={styles.muted}>
                    {selectedSlots.length}{" "}
                    {selectedSlots.length === 1 ? "session" : "sessions"}
                  </span>
                </header>
                <div className={styles.weekGrid}>
                  {DAYS.map((day) => {
                    const daySlots = selectedSlots.filter((slot) => slot.day === day);
                    const isToday = todayDow === day;
                    return (
                      <div
                        key={day}
                        className={cn(styles.dayColumn, isToday && styles.dayToday)}
                      >
                        <span
                          className={cn(
                            styles.dayLabel,
                            isToday && styles.dayLabelToday,
                          )}
                        >
                          {WEEK_LABELS_SHORT[day - 1]}
                          {isToday ? (
                            <span className={styles.todayDot} title="Today" />
                          ) : null}
                        </span>
                        {daySlots.length === 0 ? (
                          <span className={styles.emptyDay}>—</span>
                        ) : (
                          daySlots.map((slot) => {
                            const time = periodTimes.get(slot.period);
                            return (
                              <span key={`${slot.day}:${slot.period}`} className={styles.timeChip}>
                                {time ? formatClock(time.startMin) : `Period ${slot.period + 1}`}
                                {time ? (
                                  <span className={styles.timeChipEnd}>
                                    {formatClock(time.endMin)}
                                  </span>
                                ) : null}
                              </span>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <aside className={styles.facts}>
                <div className={styles.fact}>
                  <p className={styles.eyebrow}>Time in class</p>
                  <p className={styles.factValue}>
                    <Clock size={14} aria-hidden className={styles.factIcon} />
                    {selectedTimeLabel}
                  </p>
                </div>
                <div className={styles.fact}>
                  <p className={styles.eyebrow}>Meetup days</p>
                  <p className={styles.factText}>
                    {selectedDays.length === 0
                      ? "—"
                      : selectedDays.map((d) => WEEK_LABELS_SHORT[d - 1]).join(" · ")}
                  </p>
                </div>
                <div className={styles.fact}>
                  <p className={styles.eyebrow}>Where</p>
                  <p className={cn(styles.factText, styles.where)}>
                    <MapPin size={13} aria-hidden className={styles.factIcon} />
                    <span>{selectedClass.sectionName}</span>
                  </p>
                  <p className={styles.muted}>
                    Grade {selectedClass.gradeLevel.replace("G", "")}
                  </p>
                </div>
              </aside>
            </div>

            {selectedSlots.length === 0 ? (
              <p className={styles.noSlots}>
                No published timeslot for this class this term yet — the administrator
                has not released its grid.
              </p>
            ) : null}
          </div>

          <footer className={styles.footer}>
            <p className={styles.nextLine}>
              {nextSlotLabel ? `Next session · ${nextSlotLabel}` : "No published timeslot yet"}
            </p>
            <div className={styles.actions}>
              <Button asChild variant="outline" size="sm" className="h-6 gap-1 px-2 text-[12px]">
                <Link href="/teacher/grading">
                  <NotebookPen size={12} aria-hidden />
                  Gradebook
                </Link>
              </Button>
              <Button asChild size="sm" className="h-6 gap-1 px-2 text-[12px]">
                <Link href="/teacher/attendance">
                  <CalendarCheck size={12} aria-hidden />
                  Attendance
                </Link>
              </Button>
            </div>
          </footer>
        </div>
      ) : null}
    </SidePanel>
  );
}
