"use client";

import { useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import {
  buildTimetable,
  formatClock,
  workloadOf,
  type DayConfig,
} from "@/components/schedule/schedule-time";
import type { ScheduleConfigPreset } from "./use-schedule-catalog";
import { EmptyActionCard } from "./schedule-empty-kanban";
import { ApplyConfigOverlay } from "./apply-config-overlay";
import styles from "./schedule-config-presets.module.css";

export interface ConfigYearOption {
  id: string;
  name: string;
  isActive: boolean;
}

function ord(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

/** "Off" or "15 min · after 2nd" — the recess as one readable value. */
function recessSummary(recess: { enabled: boolean; afterPeriod: number; mins: number }): string {
  if (!recess.enabled) return "Off";
  return `${recess.mins} min · after ${ord(recess.afterPeriod)}`;
}

function endLabel(config: DayConfig): string {
  const rows = buildTimetable(config);
  const last = rows[rows.length - 1];
  return last ? formatClock(last.endMin) : "—";
}

/**
 * The whole day as one proportional strip — lesson blocks, recesses and lunch
 * sized by their real minutes — so two day shapes read apart at a glance.
 */
function daySegments(config: DayConfig): Array<{ kind: string; grow: number; label: string }> {
  const rows = buildTimetable(config);
  if (rows.length === 0) return [];
  const total = rows[rows.length - 1].endMin - rows[0].startMin;
  return rows.map((row) => ({
    kind: row.kind === "period" ? "period" : row.kind === "lunch" ? "lunch" : "break",
    grow: total > 0 ? (row.endMin - row.startMin) / total : 0,
    label:
      row.kind === "period"
        ? `Period ${row.periodIndex + 1}`
        : row.kind === "lunch"
          ? "Lunch"
          : row.label,
  }));
}

/**
 * Named day-shape presets for one school year. Exactly one is in use; the admin
 * swaps between them (regular day, El Niño adjusted day, …) without losing the
 * others. Each card lists that configuration's own numbers (start, lesson
 * length, lunch, breaks, caps) so presets can be compared without opening them.
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
  const [applyTarget, setApplyTarget] = useState<ScheduleConfigPreset | null>(null);
  const yearName =
    years.find((year) => year.id === selectedYearId)?.name ?? "this school year";
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
        {/* With nothing saved yet the empty card carries both actions, so the
            header button and the year switcher would just duplicate it. */}
        {presets.length > 0 ? (
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
        ) : null}
      </header>

      {years.length > 0 && presets.length > 0 ? (
        <div className={styles.scope}>
          <span className={styles.scopeLabel}>
            <CalendarDays size={12} aria-hidden />
            School year
          </span>
          <FilterTabs
            label="School year to configure"
            variant="tags"
            options={years.map((year) => ({
              value: year.id,
              label: year.name,
              tone: "neutral" as const,
            }))}
            value={selectedYearId ?? ""}
            onChange={(yearId) => onSelectYear(yearId)}
          />
        </div>
      ) : null}

      {presets.length === 0 ? (
        <div className="flex min-h-[calc(100dvh-16rem)] items-center justify-center py-8">
          <EmptyActionCard
            icon={CalendarDays}
            title={
              years.length === 0
                ? "No school year to configure yet"
                : "No saved configuration for this school year"
            }
            description={
              years.length === 0
                ? "Create the school year first from the School year tab, then set the start time, subject length, lunch and breaks here."
                : "Set the start time, subject length, lunch and breaks once. Every timetable, attendance slot and principal view of this year follows the configuration that is in use."
            }
            actions={
              years.length === 0
                ? [
                    {
                      href: "/admin/academics/schedule/school-year",
                      title: "Create school year",
                      description: "Open the School year tab and add the year first",
                      icon: CalendarRange,
                      accent: "text-amber-500",
                    },
                  ]
                : [
                    {
                      onClick: onNew,
                      title: "New configuration",
                      description: "Set the start time, subject length, lunch and breaks",
                      icon: Plus,
                      accent: "text-amber-500",
                    },
                  ]
            }
          />
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
                aria-pressed={active}
                role="button"
                tabIndex={busy ? -1 : 0}
                style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
                onClick={() => {
                  if (!active && !busy) setApplyTarget(preset);
                }}
                onKeyDown={(event) => {
                  // Only the card itself activates; Enter on an inner action
                  // button must not also queue the whole-day switch.
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!active && !busy) setApplyTarget(preset);
                  }
                }}
              >
                <header className={styles.cardHead}>
                  <div className={styles.cardId}>
                    <span className={styles.name} title={preset.name}>
                      {preset.name}
                    </span>
                    <span className={styles.cardSub}>
                      <Timer size={11} aria-hidden />
                      {preset.periodMins} min periods ·{" "}
                      {buildTimetable(preset).filter((row) => row.kind === "period").length}/day
                    </span>
                  </div>
                  {active ? (
                    <span className={styles.activeBadge}>
                      <CheckCircle2 size={11} aria-hidden />
                      In use
                    </span>
                  ) : null}
                  <span
                    className={`${styles.selectCircle} ${
                      active ? styles.selectCircleActive : ""
                    }`}
                    aria-hidden
                  >
                    {active ? <Check size={13} /> : null}
                  </span>
                </header>

                <div className={styles.shape} aria-hidden>
                  <div className={styles.shapeBar}>
                    {daySegments(preset).map((segment, segmentIndex) => (
                      <span
                        key={segmentIndex}
                        className={`${styles.segment} ${styles[`segment_${segment.kind}`]}`}
                        style={{ flexGrow: segment.grow }}
                        title={segment.label}
                      />
                    ))}
                  </div>
                  <div className={styles.shapeCaption}>
                    <span className={styles.shapeClock}>{preset.startTime}</span>
                    <span className={styles.shapeLegend}>
                      <span className={styles.legendItem}>
                        <span className={`${styles.legendDot} ${styles.legendPeriod}`} />
                        Lessons
                      </span>
                      <span className={styles.legendItem}>
                        <span className={`${styles.legendDot} ${styles.legendBreak}`} />
                        Breaks
                      </span>
                      <span className={styles.legendItem}>
                        <span className={`${styles.legendDot} ${styles.legendLunch}`} />
                        Lunch
                      </span>
                    </span>
                    <span className={styles.shapeClock}>{endLabel(preset)}</span>
                  </div>
                </div>

                <dl className={styles.details}>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>Start of classes</dt>
                    <dd className={styles.detailValue}>{preset.startTime}</dd>
                  </div>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>Subject duration</dt>
                    <dd className={styles.detailValue}>{preset.periodMins} min</dd>
                  </div>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>Lunch</dt>
                    <dd className={styles.detailValue}>
                      {preset.lunch.mins} min · after {ord(preset.lunch.afterPeriod)}
                    </dd>
                  </div>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>School day ends</dt>
                    <dd className={styles.detailValue}>{endLabel(preset)}</dd>
                  </div>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>Morning recess</dt>
                    <dd className={styles.detailValue}>{recessSummary(preset.morningRecess)}</dd>
                  </div>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>Afternoon recess</dt>
                    <dd className={styles.detailValue}>{recessSummary(preset.afternoonRecess)}</dd>
                  </div>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>Workload caps</dt>
                    <dd className={styles.detailValue}>
                      {workloadOf(preset).maxDailyPeriods}/day ·{" "}
                      {workloadOf(preset).maxWeeklyPeriods}/week
                    </dd>
                  </div>
                  <div className={styles.detail}>
                    <dt className={styles.detailLabel}>Periods per day</dt>
                    <dd className={styles.detailValue}>
                      {buildTimetable(preset).filter((row) => row.kind === "period").length}
                    </dd>
                  </div>
                </dl>

                <div
                  className={styles.cardActions}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {active ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setApplyTarget(preset)}
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

      {applyTarget ? (
        <ApplyConfigOverlay
          preset={applyTarget}
          yearName={yearName}
          pending={busy}
          onCancel={() => setApplyTarget(null)}
          onConfirm={() => {
            onActivate(applyTarget);
            setApplyTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}
