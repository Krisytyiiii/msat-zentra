"use client";

import { useState, type ComponentType } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  CupSoda,
  Gauge,
  Loader2,
  RotateCcw,
  Settings2,
  Sparkles,
  Timer,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { ScrollList } from "@/components/ui/scroll-list";
import { Pill } from "@/components/ui/pill";
import {
  AfterSelect,
  TimePicker,
} from "./ScheduleConfigDialog";
import {
  buildTimetable,
  DEFAULT_DAY_CONFIG,
  formatClock,
  formatRange,
  type DayConfig,
  type TimetableRow,
} from "@/components/schedule/schedule-time";
import kanbanStyles from "@/components/schedule/subject-kanban.module.css";
import styles from "./schedule-config-kanban.module.css";

const CONFIG_SAVE_STEPS = ["Validating shape", "Saving to server", "Confirming timetables"];

/** Wizard steps — one board, three screens, apply lands on the last one. */
const CONFIG_STEPS = ["Day shape", "Breaks", "Workload caps"] as const;

/** Plain-language guidance for each step — the wizard is used by non-technical staff. */
const STEP_HINTS = [
  "Pick a starting shape, give it a name, then adjust the times. The preview on the right updates as you type.",
  "Switch on a break only if the school day has one, then choose when it starts and how long it lasts.",
  "These caps only warn the conflict checker. Leave the defaults if you are not sure.",
] as const;

/** One-click starting shapes so an adjusted day is two clicks, not ten fields. */
const QUICK_SHAPES: Array<{ label: string; caption: string; patch: Partial<DayConfig> }> = [
  {
    label: "Regular day",
    caption: "60 min · 7:30",
    patch: {
      startTime: "07:30",
      periodMins: 60,
      lunch: { afterPeriod: 4, mins: 60 },
      morningRecess: { enabled: false, afterPeriod: 2, mins: 15 },
      afternoonRecess: { enabled: false, afterPeriod: 6, mins: 15 },
    },
  },
  {
    label: "Shortened day",
    caption: "45 min · 6:30",
    patch: {
      startTime: "06:30",
      periodMins: 45,
      lunch: { afterPeriod: 4, mins: 45 },
      morningRecess: { enabled: true, afterPeriod: 2, mins: 10 },
      afternoonRecess: { enabled: false, afterPeriod: 6, mins: 15 },
    },
  },
  {
    label: "Half day",
    caption: "30 min · 7:00",
    patch: {
      startTime: "07:00",
      periodMins: 30,
      lunch: { afterPeriod: 4, mins: 30 },
      morningRecess: { enabled: false, afterPeriod: 2, mins: 15 },
      afternoonRecess: { enabled: false, afterPeriod: 6, mins: 15 },
    },
  },
];

export type ConfigSaveStatus = "saving" | "saved" | "failed";

export type ConfigIcon = "clock" | "timer" | "lunch" | "recess-am" | "recess-pm" | "caps";

const CONFIG_ICONS: Record<ConfigIcon, ComponentType<{ size?: number | string; className?: string }>> = {
  clock: Clock,
  timer: Timer,
  lunch: UtensilsCrossed,
  "recess-am": Coffee,
  "recess-pm": CupSoda,
  caps: Gauge,
};

/** One shared pill family per data type (no all-amber wall). */
export interface ConfigSaveItem {
  label: string;
  /** Each info bit renders as its own rectangle pill (never joined in one string). */
  parts: string[];
  icon: ConfigIcon;
}

export interface ConfigSaveProgress {
  active: boolean;
  done: boolean;
  status: ConfigSaveStatus;
  items: ConfigSaveItem[];
  summary: string;
  message?: string;
}

function ord(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

function formatStart(startTime: string): string {
  const [h, m] = startTime.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return startTime;
  return formatClock(h * 60 + m);
}

function recessParts(recess: { enabled: boolean; afterPeriod: number; mins: number }): string[] {
  if (!recess.enabled) return ["Off"];
  return ["On", `after ${ord(recess.afterPeriod)}`, `${recess.mins} min`];
}

/** Human-readable snapshot of an applied config for the save dock. */
export function describeConfig(next: DayConfig): { items: ConfigSaveItem[]; summary: string } {
  const rows = buildTimetable(next);
  const lastRow = rows[rows.length - 1];
  const items: ConfigSaveItem[] = [
    { label: "Start of classes", parts: [formatStart(next.startTime)], icon: "clock" },
    { label: "Subject duration", parts: [`${next.periodMins} min`], icon: "timer" },
    { label: "Lunch", parts: [`${next.lunch.mins} min`, `after ${ord(next.lunch.afterPeriod)}`], icon: "lunch" },
    { label: "Morning recess", parts: recessParts(next.morningRecess), icon: "recess-am" },
    { label: "Afternoon recess", parts: recessParts(next.afternoonRecess), icon: "recess-pm" },
    {
      label: "Workload caps",
      parts: [
        `${next.workload?.maxDailyPeriods ?? 6} / day`,
        `${next.workload?.maxWeeklyPeriods ?? 30} / week`,
      ],
      icon: "caps",
    },
  ];
  const summary = lastRow ? `School day ends ${formatClock(lastRow.endMin)}` : "School day saved";
  return { items, summary };
}

const inputClass = "rounded-md border border-input bg-transparent px-2 py-1 font-sans text-sm";
const FOOTER_BUTTON = "h-6 gap-1 px-2 font-sans text-[12px]";
const APPLY_BUTTON =
  "border-input bg-white text-black hover:bg-neutral-100 hover:text-black dark:border-transparent dark:bg-white dark:text-black dark:hover:bg-neutral-200 dark:hover:text-black";

/** Does the working draft already match one of the one-click starting shapes? */
function matchesShape(config: DayConfig, patch: Partial<DayConfig>): boolean {
  const next = { ...config, ...patch };
  return (
    config.startTime === next.startTime &&
    config.periodMins === next.periodMins &&
    config.lunch.mins === next.lunch.mins &&
    config.lunch.afterPeriod === next.lunch.afterPeriod &&
    config.morningRecess.enabled === next.morningRecess.enabled &&
    config.morningRecess.afterPeriod === next.morningRecess.afterPeriod &&
    config.morningRecess.mins === next.morningRecess.mins &&
    config.afternoonRecess.enabled === next.afternoonRecess.enabled &&
    config.afternoonRecess.afterPeriod === next.afternoonRecess.afterPeriod &&
    config.afternoonRecess.mins === next.afternoonRecess.mins
  );
}

/** Tiny proportional bar on a quick-shape card — the day's rhythm at a glance. */
function ShapeBar({ config }: { config: DayConfig }) {
  return (
    <span className={styles.shapeBar} aria-hidden>
      {buildTimetable(config).map((row) => (
        <span
          key={`${row.kind}-${row.startMin}`}
          className={`${styles.shapeSegment} ${
            row.kind === "lunch"
              ? styles.shapeSegLunch
              : row.kind === "recess"
                ? styles.shapeSegRecess
                : ""
          }`}
          style={{ flexGrow: Math.max(1, row.endMin - row.startMin) }}
        />
      ))}
    </span>
  );
}

/** Live proportional day preview shown beside the wizard fields. */
function DayTimeline({ config, name }: { config: DayConfig; name?: string }) {
  const rows = buildTimetable(config);
  const last = rows[rows.length - 1];
  const periods = rows.filter((row) => row.kind === "period").length;
  return (
    <aside className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-muted/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-sans text-[12px] font-semibold">Day preview</span>
        <Pill tone="amber">{last ? `ends ${formatClock(last.endMin)}` : "—"}</Pill>
      </div>
      {name !== undefined ? (
        <p className="truncate font-sans text-[12px] font-medium" title={name}>
          {name.trim() || "Untitled configuration"}
        </p>
      ) : null}
      <ol
        className={`${styles.scrollArea} flex max-h-[21rem] flex-col gap-1 overflow-y-auto pr-1.5`}
        aria-label="Day timeline"
      >
        {rows.map((row) => {
          if (row.kind === "lunch") {
            return (
              <li
                key={`lunch-${row.startMin}`}
                className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-sans text-[12px]"
              >
                <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                  <UtensilsCrossed size={11} aria-hidden />
                  Lunch
                </span>
                <span className="text-muted-foreground">{formatRange(row.startMin, row.endMin)}</span>
              </li>
            );
          }
          if (row.kind === "recess") {
            return (
              <li
                key={`${row.label}-${row.startMin}`}
                className="flex items-center justify-between gap-2 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-1 font-sans text-[12px]"
              >
                <span className="flex items-center gap-1.5 font-medium text-teal-700 dark:text-teal-400">
                  <Coffee size={11} aria-hidden />
                  {row.label.replace(" Recess", "")} recess
                </span>
                <span className="text-muted-foreground">{formatRange(row.startMin, row.endMin)}</span>
              </li>
            );
          }
          return (
            <li
              key={`p-${row.periodIndex}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1 font-sans text-[12px]"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold tabular-nums">
                  {row.periodIndex + 1}
                </span>
                <span className="whitespace-nowrap">Period {row.periodIndex + 1}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
                {formatRange(row.startMin, row.endMin)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-1">
        <Pill tone="neutral">{config.periodMins} min</Pill>
        <Pill tone="neutral">{periods} periods</Pill>
        <Pill tone="neutral">{config.lunch.mins}m lunch</Pill>
      </div>
    </aside>
  );
}

interface Props {
  config: DayConfig;
  initialName?: string;
  heading?: string;
  onClose: () => void;
  onApply: (config: DayConfig, name: string) => void;
  saving?: boolean;
}

export function ScheduleConfigKanban({
  config,
  initialName = "Default",
  heading = "Configure school day",
  onClose,
  onApply,
  saving,
}: Props) {
  const [draft, setDraft] = useState<DayConfig>(config);
  const [name, setName] = useState(initialName);
  const [step, setStep] = useState(0);
  // Dropdown triggers are native buttons (centered text by default) — force left.
  const left = kanbanStyles.triggerLeft;

  const preview = buildTimetable(draft);
  const isRecess = (
    r: TimetableRow,
    label: "Morning Recess" | "Afternoon Recess",
  ): r is Extract<TimetableRow, { kind: "recess" }> =>
    r.kind === "recess" && r.label === label;
  const morningRow = preview.find((r) => isRecess(r, "Morning Recess"));
  const afternoonRow = preview.find((r) => isRecess(r, "Afternoon Recess"));
  const lastRow = preview[preview.length - 1];

  const clampMins = (v: number, fallback: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(v) || fallback));

  const handleApply = () => {
    const workload = {
      maxDailyPeriods: Math.min(8, Math.max(1, Math.round(draft.workload?.maxDailyPeriods ?? 6) || 6)),
      maxWeeklyPeriods: Math.min(40, Math.max(1, Math.round(draft.workload?.maxWeeklyPeriods ?? 30) || 30)),
    };
    onApply({
      startTime: draft.startTime || DEFAULT_DAY_CONFIG.startTime,
      periodMins: clampMins(draft.periodMins, DEFAULT_DAY_CONFIG.periodMins, 15, 120),
      lunch: {
        afterPeriod: [1, 2, 3, 4, 5, 6, 7, 8].includes(draft.lunch.afterPeriod)
          ? draft.lunch.afterPeriod
          : DEFAULT_DAY_CONFIG.lunch.afterPeriod,
        mins: clampMins(draft.lunch.mins, DEFAULT_DAY_CONFIG.lunch.mins, 15, 180),
      },
      morningRecess: {
        ...draft.morningRecess,
        mins: clampMins(draft.morningRecess.mins, 15, 5, 45),
      },
      afternoonRecess: {
        ...draft.afternoonRecess,
        mins: clampMins(draft.afternoonRecess.mins, 15, 5, 45),
      },
      workload,
    }, name.trim());
  };

  const recessField = (
    key: "morningRecess" | "afternoonRecess",
    title: string,
    options: number[],
  ) => {
    const recess = draft[key];
    const row = key === "morningRecess" ? morningRow : afternoonRow;
    return (
      <div className={styles.panel}>
        <div className="flex items-center justify-between gap-2">
          <div className={styles.panelHead}>
            <span className={styles.panelIcon} aria-hidden>
              <Coffee size={13} />
            </span>
            <div className={styles.panelText}>
              <p className={styles.panelTitle}>{title}</p>
              <p className={styles.panelHint}>
                {recess.enabled
                  ? "Learners get a short break at this point of the day."
                  : "No break in this part of the day."}
              </p>
            </div>
          </div>
          <Switch
            checked={recess.enabled}
            onCheckedChange={(v) => setDraft({ ...draft, [key]: { ...recess, enabled: v } })}
            aria-label={`${title} enabled`}
          />
        </div>
        {recess.enabled ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 font-sans text-xs text-muted-foreground">
              <span>After period</span>
              <AfterSelect
                value={recess.afterPeriod}
                options={options}
                onChange={(v) => setDraft({ ...draft, [key]: { ...recess, afterPeriod: v } })}
                label={`${title} after period`}
                triggerClassName={left}
              />
            </div>
            <label className="flex flex-col gap-1 font-sans text-xs text-muted-foreground">
              Duration (min)
              <input
                type="number"
                min={5}
                max={45}
                step={5}
                value={recess.mins}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  if (Number.isFinite(v)) setDraft({ ...draft, [key]: { ...recess, mins: v } });
                }}
                className={inputClass}
              />
            </label>
          </div>
        ) : null}
        {recess.enabled && row ? (
          <p className="mt-2 font-sans text-xs text-muted-foreground">
            {row.label} → {formatClock(row.startMin)}–{formatClock(row.endMin)}
          </p>
        ) : null}
      </div>
    );
  };

  const stepHeader = (
    <ol className="flex flex-wrap items-center gap-1.5 px-1" aria-label="Configuration steps">
      {CONFIG_STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-sans text-[12px] transition-colors duration-150 ${
                active
                  ? "border-amber-500/60 bg-amber-500/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[12px] font-semibold ${
                  active || done ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground"
                }`}
                aria-hidden
              >
                {done ? <Check size={10} /> : i + 1}
              </span>
              {label}
            </button>
            {i < CONFIG_STEPS.length - 1 ? (
              <span className="h-px w-3 bg-border" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className={kanbanStyles.view} aria-label="Configure school day">
      <div className={`${kanbanStyles.column} mx-auto w-full max-w-5xl`}>
        <KanbanBoard
          title={heading}
          icon={
            <span className="text-amber-500" aria-hidden>
              <Settings2 size={14} />
            </span>
          }
          description="Day shape for the whole school year. Saving applies to every timetable of the year; keep other presets for adjusted schedules."
          className="h-full bg-card shadow-xl"
          actions={
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close configure school day"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={14} aria-hidden="true" />
            </button>
          }
          footer={
            <div className="flex flex-wrap items-center justify-end gap-1.5 px-1 pb-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(DEFAULT_DAY_CONFIG);
                  setStep(0);
                }}
                disabled={saving}
                className={FOOTER_BUTTON}
              >
                <RotateCcw size={12} aria-hidden />
                Reset
              </Button>
              {step > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={saving}
                  className={FOOTER_BUTTON}
                >
                  <ChevronLeft size={12} aria-hidden />
                  Back
                </Button>
              ) : null}
              {step < CONFIG_STEPS.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => Math.min(CONFIG_STEPS.length - 1, s + 1))}
                  disabled={saving}
                  className={FOOTER_BUTTON}
                >
                  Next
                  <ChevronRight size={12} aria-hidden />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={saving || name.trim().length === 0}
                  aria-busy={saving || undefined}
                  className={`${FOOTER_BUTTON} ${APPLY_BUTTON}`}
                >
                  {saving ? (
                    <>
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                      <span aria-live="polite">Saving…</span>
                    </>
                  ) : (
                    <>
                      <Check size={12} aria-hidden />
                      Apply
                    </>
                  )}
                </Button>
              )}
            </div>
          }
        >
          <div className="flex flex-col gap-3 px-1">
            {stepHeader}
            <p className={styles.hint}>{STEP_HINTS[step]}</p>

            <div className="grid min-w-0 items-start gap-4 md:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="flex min-w-0 flex-col gap-3">
                {step === 0 ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={styles.groupLabel}>
                          <Sparkles size={12} className="text-amber-500" aria-hidden />
                          Starting shape
                        </span>
                        <span className={styles.groupHint}>
                          Optional — pick one to fill the times for you.
                        </span>
                      </div>
                      <div
                        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                        role="group"
                        aria-label="Starting shapes"
                      >
                        {QUICK_SHAPES.map((shape) => {
                          const selected = matchesShape(draft, shape.patch);
                          return (
                            <button
                              key={shape.label}
                              type="button"
                              onClick={() => setDraft({ ...draft, ...shape.patch })}
                              aria-pressed={selected}
                              className={`${styles.shapeCard} ${
                                selected ? styles.shapeCardActive : ""
                              }`}
                            >
                              <span className={styles.shapeTop}>
                                <span className={styles.shapeName}>{shape.label}</span>
                                {selected ? (
                                  <span className={styles.shapeCheck} aria-hidden>
                                    <Check size={10} />
                                  </span>
                                ) : null}
                              </span>
                              <span className={styles.shapeMeta}>{shape.caption}</span>
                              <ShapeBar config={{ ...draft, ...shape.patch }} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className={styles.fieldLabel}>Configuration name</span>
                      <input
                        type="text"
                        maxLength={80}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Regular day, El Niño adjusted"
                        className={inputClass}
                        aria-label="Configuration name"
                      />
                      <span className={styles.fieldHint}>
                        Shown on the configuration cards so staff can tell them apart.
                      </span>
                    </label>

                    <div className={styles.panel}>
                      <div className={styles.panelHead}>
                        <span className={styles.panelIcon} aria-hidden>
                          <Clock size={13} />
                        </span>
                        <div className={styles.panelText}>
                          <p className={styles.panelTitle}>Day timing</p>
                          <p className={styles.panelHint}>
                            When classes start, how long each subject lasts, and when lunch falls.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <span className={styles.fieldLabel}>Start of classes</span>
                          <TimePicker
                            value={draft.startTime}
                            onChange={(v) => setDraft({ ...draft, startTime: v })}
                            label="Start of classes"
                            triggerClassName={left}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className={styles.fieldLabel}>Lunch after</span>
                          <AfterSelect
                            value={draft.lunch.afterPeriod}
                            options={[1, 2, 3, 4, 5, 6, 7, 8]}
                            onChange={(v) =>
                              setDraft({ ...draft, lunch: { ...draft.lunch, afterPeriod: v } })
                            }
                            label="Lunch after period"
                            triggerClassName={left}
                          />
                        </div>

                        <label className="flex flex-col gap-1">
                          <span className={styles.fieldLabel}>Subject duration (min)</span>
                          <input
                            type="number"
                            min={15}
                            max={120}
                            step={5}
                            value={draft.periodMins}
                            onChange={(e) => {
                              const v = e.target.valueAsNumber;
                              if (Number.isFinite(v)) setDraft({ ...draft, periodMins: v });
                            }}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={styles.fieldLabel}>Lunch length (min)</span>
                          <input
                            type="number"
                            min={15}
                            max={180}
                            step={5}
                            value={draft.lunch.mins}
                            onChange={(e) => {
                              const v = e.target.valueAsNumber;
                              if (Number.isFinite(v))
                                setDraft({ ...draft, lunch: { ...draft.lunch, mins: v } });
                            }}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </div>
                  </>
                ) : null}

                {step === 1 ? (
                  <>
                    {recessField("morningRecess", "Morning recess", [1, 2, 3, 4])}
                    {recessField("afternoonRecess", "Afternoon recess", [5, 6, 7, 8])}
                  </>
                ) : null}

                {step === 2 ? (
                  <>
                    <div className={styles.panel}>
                      <div className={styles.panelHead}>
                        <span className={styles.panelIcon} aria-hidden>
                          <Gauge size={13} />
                        </span>
                        <div className={styles.panelText}>
                          <p className={styles.panelTitle}>Teacher workload caps</p>
                          <p className={styles.panelHint}>
                            Warn-allow limits for the conflict checker. Saving still goes
                            through.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1 font-sans text-xs text-muted-foreground">
                          Max periods / day
                          <input
                            type="number"
                            min={1}
                            max={8}
                            step={1}
                            value={draft.workload?.maxDailyPeriods ?? 6}
                            onChange={(e) => {
                              const v = e.target.valueAsNumber;
                              if (Number.isFinite(v))
                                setDraft({
                                  ...draft,
                                  workload: {
                                    maxDailyPeriods: v,
                                    maxWeeklyPeriods: draft.workload?.maxWeeklyPeriods ?? 30,
                                  },
                                });
                            }}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex flex-col gap-1 font-sans text-xs text-muted-foreground">
                          Max periods / week
                          <input
                            type="number"
                            min={1}
                            max={40}
                            step={1}
                            value={draft.workload?.maxWeeklyPeriods ?? 30}
                            onChange={(e) => {
                              const v = e.target.valueAsNumber;
                              if (Number.isFinite(v))
                                setDraft({
                                  ...draft,
                                  workload: {
                                    maxDailyPeriods: draft.workload?.maxDailyPeriods ?? 6,
                                    maxWeeklyPeriods: v,
                                  },
                                });
                            }}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </div>

                    <p className="font-sans text-xs text-muted-foreground">
                      School day ends {lastRow ? formatClock(lastRow.endMin) : "—"}.
                    </p>
                  </>
                ) : null}
              </div>
              <DayTimeline config={draft} name={name} />
            </div>
          </div>
        </KanbanBoard>
      </div>
    </div>
  );
}

export function ConfigDockRows({
  items,
  status,
}: {
  items: ConfigSaveItem[];
  status: ConfigSaveStatus;
}) {
  return (
    <ScrollList as="ul" className="max-h-56 gap-1" ariaLabel="Applied school-day settings">
      {items.map((it) => {
        const Icon = CONFIG_ICONS[it.icon] ?? Settings2;
        return (
          <li key={it.label} className="flex min-w-0 items-start gap-2 rounded px-1 py-1">
            <span className="shrink-0 pt-0.5" aria-hidden>
              {status === "saving" ? (
                <Loader2 size={15} className="animate-spin text-muted-foreground" />
              ) : (
                <Icon
                  size={15}
                  className={
                    status === "saved"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  }
                />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="font-sans text-xs font-medium" title={it.label}>
                {it.label}
              </span>
              <span className="flex flex-wrap gap-1">
                {it.parts.map((part) => (
                  <Pill key={part} tone="amber">
                    {part}
                  </Pill>
                ))}
              </span>
            </span>
            <span className="shrink-0 pt-0.5 font-sans text-[12px] text-muted-foreground">
              {status === "saved" ? "Saved" : status === "failed" ? "Failed" : "Saving…"}
            </span>
          </li>
        );
      })}
    </ScrollList>
  );
}

export { CONFIG_SAVE_STEPS };
