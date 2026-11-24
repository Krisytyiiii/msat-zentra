"use client";

import * as React from "react";
import { BookOpen, CalendarDays, Layers } from "lucide-react";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { Pill } from "@/components/ui/pill";
import { ScrollList } from "@/components/ui/scroll-list";
import { SheetDatePicker } from "./sheet-date-picker";
import type { SlotCard } from "./use-slot-cards";
import { gradeLabel } from "@/services/teacher/grading.compute";
import styles from "./attendance-sheet.module.css";

/**
 * Left desk rail — the teacher's scheduled subject list (grouped by section),
 * the sheet date and the records/blocks switch. Mirrors the grading
 * workspace: a persistent left panel, the sheet itself owns the right column.
 */
export function AttendanceRail({
  date,
  onDateChange,
  meetupDates,
  slotCards,
  hasSubjects,
  activeSlotKey,
  slotQuery,
  onSlotQueryChange,
  onSelect,
  blocksMode,
  onToggleBlocks,
}: {
  date: string;
  onDateChange: (date: string) => void;
  meetupDates: string[] | null;
  slotCards: SlotCard[];
  hasSubjects: boolean;
  activeSlotKey: string | null;
  slotQuery: string;
  onSlotQueryChange: (value: string) => void;
  onSelect: (card: SlotCard) => void;
  blocksMode: boolean;
  onToggleBlocks: () => void;
}) {
  const groups = React.useMemo(() => {
    const bySection = new Map<string, { label: string; items: SlotCard[] }>();
    for (const card of slotCards) {
      const group = bySection.get(card.section.id) ?? {
        label: card.section.name,
        items: [],
      };
      group.items.push(card);
      bySection.set(card.section.id, group);
    }
    return [...bySection.entries()].map(([id, group]) => ({ id, ...group }));
  }, [slotCards]);

  return (
    <aside className={styles.railColumn} aria-label="Attendance subjects and tools">
      <div className={styles.railInner}>
        <div className={styles.railTop}>
          <div className={styles.railField}>
            <span className={styles.railLabel}>View</span>
            <FilterTabs
              label="Attendance view"
              options={[
                { value: "records", label: "Records" },
                { value: "blocks", label: "Blocks" },
              ]}
              value={blocksMode ? "blocks" : "records"}
              onChange={(next) => {
                if ((next === "blocks") !== blocksMode) onToggleBlocks();
              }}
            />
            <p className={styles.railFieldHint}>
              {blocksMode
                ? "Every meetup day in this term, side by side."
                : "Mark today's status for each learner."}
            </p>
          </div>
          <div className={styles.railField}>
            <span className={styles.railLabel}>
              <CalendarDays size={12} aria-hidden />
              Sheet date
            </span>
            <p className={styles.railFieldHint}>The day you are taking attendance for.</p>
            <SheetDatePicker date={date} onChange={onDateChange} meetupDates={meetupDates} />
          </div>
        </div>

        <div className={styles.railHead}>
          <span className={styles.railTitle}>
            <BookOpen size={14} aria-hidden />
            Subjects
          </span>
          <Pill tone="neutral" label="Scheduled subjects">
            {slotCards.length}
          </Pill>
        </div>
        <p className={styles.railHint}>Pick a subject to open its attendance sheet.</p>

        <TeacherSearchField
          className="w-full min-w-0"
          placeholder="Search subjects…"
          value={slotQuery}
          onChange={onSlotQueryChange}
          aria-label="Search subjects"
        />

        {slotCards.length === 0 ? (
          <p className={styles.railEmpty}>
            {hasSubjects
              ? searchEmptyMessage(slotQuery, "subjects", "Clear the search to see them all.")
              : "No scheduled subjects yet."}
          </p>
        ) : (
          <ScrollList className={styles.railList} ariaLabel="Subjects">
            {groups.map((group) => (
              <div key={group.id} className={styles.railGroup}>
                <p className={styles.railGroupLabel}>
                  <Layers size={11} aria-hidden />
                  {group.label}
                </p>
                {group.items.map((card) => {
                  const active = card.key === activeSlotKey;
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => onSelect(card)}
                      aria-current={active ? "true" : undefined}
                      aria-label={`${card.subject.name} — ${card.section.name}${card.live ? ", live now" : ""}`}
                      title={`${card.subject.name} — ${card.section.name}${card.live ? " · Live" : ""}`}
                      className={`${styles.subjectBtn} ${active ? styles.subjectBtnActive : ""}`}
                    >
                      <span className={styles.subjectIcon} aria-hidden>
                        <BookOpen size={14} />
                      </span>
                      <span className={styles.subjectText}>
                        <span className={styles.subjectName} title={card.subject.name}>
                          {card.subject.name}
                          <span className={styles.subjectCode}>{card.subject.code}</span>
                        </span>
                        <span className={styles.subjectMeta}>
                          {card.section.gradeLevel ? (
                            <Pill field="grade">
                              Grade {gradeLabel(card.section.gradeLevel)}
                            </Pill>
                          ) : null}
                          <Pill field="section" className="max-w-full truncate">
                            {card.section.name}
                          </Pill>
                        </span>
                      </span>
                      {card.live ? (
                        <span className={`${styles.subjectState} ${styles.subjectStateLive}`}>
                          <span className={styles.liveDot} aria-hidden />
                          Live
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </ScrollList>
        )}
      </div>
    </aside>
  );
}
