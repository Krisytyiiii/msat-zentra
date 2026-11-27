"use client";

import * as React from "react";
import { BookOpen, CalendarDays } from "lucide-react";

import { SidePanel } from "@/components/ui/side-panel";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SheetDatePicker } from "./sheet-date-picker";
import type { AttendancePair } from "./use-attendance-pairs";
import styles from "./attendance-drawer.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  pair: AttendancePair | null;
  termNumber: number | null;
  schoolYearName: string | null;
  date: string;
  onDateChange: (date: string) => void;
  meetupDates: string[] | null;
  blocksMode: boolean;
  onToggleBlocks: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Attendance drawer: opens on the right when a timetable slot is picked. The
 * date picker and records/blocks switch live here so the teacher can record a
 * sheet for the selected class without leaving the week grid.
 */
export function AttendanceSheetDrawer({
  open,
  onClose,
  pair,
  termNumber,
  schoolYearName,
  date,
  onDateChange,
  meetupDates,
  blocksMode,
  onToggleBlocks,
  footer,
  children,
}: Props) {
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label={pair ? `${pair.subject?.name ?? "Class"} — take attendance` : "Take attendance"}
      width="4xl"
      showCloseButton
    >
      {pair ? (
        <div className={styles.panel}>
          <header className={styles.header}>
            <span className={styles.iconTile} aria-hidden>
              <BookOpen size={18} />
            </span>
            <div className={styles.headText}>
              <h2 className={styles.title}>
                {pair.subject?.name ?? "Class"}
                {pair.subject?.code ? (
                  <span className={styles.titleCode}>{pair.subject.code}</span>
                ) : null}
              </h2>
              <p className={styles.metaStrip}>
                <span>
                  Section:{" "}
                  <span className={styles.metaValue}>{pair.section.name}</span>
                </span>
                <span aria-hidden className={styles.metaSep}>
                  |
                </span>
                <span>
                  Grade level:{" "}
                  <span className={styles.metaValue}>
                    Grade{" "}
                    {pair.section.gradeLevel
                      ? pair.section.gradeLevel.replace("G", "")
                      : "—"}
                  </span>
                </span>
                <span aria-hidden className={styles.metaSep}>
                  |
                </span>
                <span>
                  Term:{" "}
                  <span className={styles.metaValue}>
                    {termNumber ? `Term ${termNumber}` : "—"}
                  </span>
                </span>
                <span aria-hidden className={styles.metaSep}>
                  |
                </span>
                <span>
                  School year:{" "}
                  <span className={styles.metaValue}>{schoolYearName ?? "—"}</span>
                </span>
              </p>
            </div>
          </header>

          <div className={styles.toolbar}>
            <FilterTabs
              label="Attendance view"
              variant="tags"
              options={[
                { value: "records", label: "Records", tone: "blue" },
                { value: "blocks", label: "Blocks", tone: "amber" },
              ]}
              value={blocksMode ? "blocks" : "records"}
              onChange={(next) => {
                if ((next === "blocks") !== blocksMode) onToggleBlocks();
              }}
            />
            <div className={styles.dateField}>
              <span className={styles.railLabel}>
                <CalendarDays size={12} aria-hidden />
                Sheet date
              </span>
              <SheetDatePicker
                date={date}
                onChange={onDateChange}
                meetupDates={meetupDates}
                showShortcuts={false}
              />
            </div>
          </div>

          <div className={styles.body}>{children}</div>

          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </div>
      ) : null}
    </SidePanel>
  );
}
