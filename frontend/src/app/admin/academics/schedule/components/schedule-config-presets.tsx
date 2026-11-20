"use client";

import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  Timer,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import {
  buildTimetable,
  formatClock,
  type DayConfig,
} from "@/components/schedule/schedule-time";
import type { ScheduleConfigPreset } from "./use-schedule-catalog";
import styles from "./schedule-config-presets.module.css";

export interface ConfigYearOption {
  id: string;
  name: string;
  isActive: boolean;
}

function daySegments(config: DayConfig) {
  return buildTimetable(config).map((row) => {
    const mins = Math.max(1, row.endMin - row.startMin);
    if (row.kind === "lunch") {
      return { key: `lunch-${row.startMin}`, mins, className: styles.segmentLunch, title: `Lunch · ${mins} min` };
    }
    if (row.kind === "recess") {
      return {
        key: `${row.label}-${row.startMin}`,
        mins,
        className: styles.segmentRecess,
        title: `${row.label} · ${mins} min`,
      };
    }
    return {
      key: `p-${row.periodIndex}`,
      mins,
      className: styles.segmentPeriod,
      title: `Period ${row.periodIndex + 1} · ${mins} min`,
    };
  });
}

function endLabel(config: DayConfig): string {
  const rows = buildTimetable(config);
  const last = rows[rows.length - 1];
  return last ? formatClock(last.endMin) : "—";
}

/**
 * Named day-shape presets for one school year. Exactly one is in use; the admin
 * swaps between them (regular day, El Niño adjusted day, …) without losing the
 * others. Each card previews the day's proportional shape so presets can be
 * compared at a glance.
 */
export function ScheduleConfigPresets({
  presets,
  activeId,
  years,
  selectedYearId,
  onSelectYear,
  busy,
  onNew,
  onEdit,
  onDuplicate,
  onActivate,
  onDelete,
}: {
  presets: ScheduleConfigPreset[];
  activeId: string | null;
  years: ConfigYearOption[];
  selectedYearId: string | null;
  onSelectYear: (yearId: string) => void;
  busy?: boolean;
  onNew: () => void;
  onEdit: (preset: ScheduleConfigPreset) => void;
  onDuplicate: (preset: ScheduleConfigPreset) => void;
  onActivate: (preset: ScheduleConfigPreset) => void;
  onDelete: (preset: ScheduleConfigPreset) => void;
}) {
  const activePreset = presets.find((preset) => preset.isActive || preset.id === activeId) ?? null;
  return (
    <section className={styles.board} aria-label="School-day configurations">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <CalendarDays size={16} />
            </span>
            <h2 className={styles.title}>School-day configurations</h2>
          </div>
          <p className={styles.subtitle}>
            One shape is in use across the school year. Keep alternates — a shortened
            El Niño day, exam week, half day — and switch whenever the times change.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            size="sm"
            onClick={onNew}
            disabled={busy || years.length === 0}
            title={years.length === 0 ? "Create a school year first" : undefined}
            className="h-7 gap-1 px-2.5 text-[12px]"
          >
            <Plus size={13} aria-hidden />
            New configuration
          </Button>
        </div>
      </header>

      {years.length > 0 ? (
        <div className={styles.scope}>
          <span className={styles.scopeLabel}>
            <CalendarDays size={12} aria-hidden />
            School year
          </span>
          <FilterTabs
            label="School year to configure"
            options={years.map((year) => ({ value: year.id, label: year.name }))}
            value={selectedYearId ?? ""}
            onChange={(yearId) => onSelectYear(yearId)}
          />
        </div>
      ) : null}

      {activePreset ? (
        <p className={styles.summaryLine}>
          <CheckCircle2 size={13} className="text-amber-500" aria-hidden />
          <span>
            <strong className={styles.summaryStrong}>{activePreset.name}</strong> is in use — classes{" "}
            {activePreset.startTime} to {endLabel(activePreset)}.
          </span>
        </p>
      ) : null}

      {presets.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {years.length === 0
              ? "No school year to configure yet"
              : "No saved configuration for this school year"}
          </p>
          <p className={styles.emptyText}>
            {years.length === 0
              ? "Create the school year first from the School year tab, then set the start time, subject length, lunch and breaks here."
              : "Set the start time, subject length, lunch and breaks once. Every timetable, attendance slot and principal view of this year follows the configuration that is in use."}
          </p>
          <Button
            size="sm"
            onClick={onNew}
            disabled={busy || years.length === 0}
            className="mt-1 h-7 gap-1 px-2.5 text-[12px]"
          >
            <Plus size={13} aria-hidden />
            Create the first configuration
          </Button>
        </div>
      ) : (
        <div className={styles.grid} aria-label="Saved configurations">
          {presets.map((preset, index) => {
            const active = preset.isActive || preset.id === activeId;
            return (
              <article
                key={preset.id}
                className={`${styles.card} ${active ? styles.cardActive : ""}`}
                aria-label={`${preset.name}${active ? " — in use" : ""}`}
                style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
              >
                <header className={styles.cardHead}>
                  <div className={styles.cardId}>
                    <span className={styles.name} title={preset.name}>
                      {preset.name}
                    </span>
                    <span className={styles.cardSub}>
                      <Timer size={11} aria-hidden />
                      {preset.periodMins} min periods · ends {endLabel(preset)}
                    </span>
                  </div>
                  {active ? (
                    <span className={styles.activeBadge}>
                      <CheckCircle2 size={11} aria-hidden />
                      In use
                    </span>
                  ) : null}
                </header>

                <div
                  className={styles.dayBar}
                  aria-label="Proportional day shape"
                  role="img"
                >
                  {daySegments(preset).map((segment) => (
                    <span
                      key={segment.key}
                      className={`${styles.segment} ${segment.className}`}
                      style={{ flexGrow: segment.mins }}
                      title={segment.title}
                    />
                  ))}
                </div>

                <div className={styles.legend}>
                  <span className={styles.legendItem}>
                    <span className={styles.legendSwatch} aria-hidden />
                    {preset.startTime} start
                  </span>
                  <span className={styles.legendItem}>
                    <span className={styles.legendSwatch} aria-hidden />
                    <UtensilsCrossed size={10} aria-hidden />
                    Lunch {preset.lunch.mins}m
                  </span>
                </div>

                <div className={styles.cardActions}>
                  {active ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onActivate(preset)}
                      disabled={busy}
                      title="Switch the whole school year to this day shape"
                      className={`h-6 gap-1 px-2 text-[12px] ${styles.useBtn}`}
                    >
                      <CheckCircle2 size={12} className="text-amber-500" aria-hidden />
                      Use this
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit(preset)}
                    disabled={busy}
                    className={`gap-1 ${styles.rowBtn}`}
                  >
                    <Pencil size={12} aria-hidden />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDuplicate(preset)}
                    disabled={busy}
                    className={`gap-1 ${styles.rowBtn}`}
                  >
                    <Copy size={12} aria-hidden />
                    Duplicate
                  </Button>
                  {active ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(preset)}
                      disabled={busy}
                      aria-label={`Delete ${preset.name}`}
                      title="Delete configuration"
                      className={`${styles.rowBtn} ${styles.dangerGhost}`}
                    >
                      <Trash2 size={12} aria-hidden />
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
