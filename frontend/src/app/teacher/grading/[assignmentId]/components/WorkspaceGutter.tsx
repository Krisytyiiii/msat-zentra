"use client";

import * as React from "react";
import {
  BookOpenText,
  FileText,
  GraduationCap,
  Hash,
  Layers,
  Lock,
  Pencil,
  Plus,
  Scale,
  Users,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { gradeLabel } from "@/services/teacher/grading.compute";
import { gradebookSlug } from "@/lib/gradebookSlug";
import type {
  ClassAssignment,
  ClassComponent,
  ClassDetail,
} from "@/services/teacher/grading.types";
import { LockGradesButton } from "./LockGradesButton";
import { AddAssessmentForm } from "./AddAssessmentForm";
import { WeightsEditor } from "./WeightsEditor";

/** Which tool the workspace's right rail has selected. */
export type WorkspaceToolKey = "subject" | "weights" | "add" | "record" | "lock";

export type WorkspaceView = "scores" | "finals";

const NAV_ITEMS: ReadonlyArray<{
  key: WorkspaceToolKey;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
}> = [
  { key: "subject", label: "Subject info", icon: BookOpenText },
  { key: "weights", label: "Subject weights", icon: Scale },
  { key: "add", label: "Add assessment", icon: Plus },
  { key: "record", label: "Class record", icon: FileText },
  { key: "lock", label: "Lock grades", icon: Lock },
];

/**
 * Tool nav for the grading workspace: one link per tool, the selected link
 * highlighted. Selecting a link swaps the panel in the content column — nothing
 * floats over the content.
 */
export function WorkspaceToolNav({
  value,
  onChange,
  unlockCount,
  collapsed = false,
}: {
  value: WorkspaceToolKey;
  onChange: (next: WorkspaceToolKey) => void;
  unlockCount: number;
  /** Icon-only rail; labels become hover/focus tooltips. */
  collapsed?: boolean;
}) {
  return (
    <nav
      className={`flex min-w-0 flex-col ${collapsed ? "gap-1" : "gap-0.5"}`}
      aria-label="Gradebook tools"
    >
      {NAV_ITEMS.map((item) => {
        const active = value === item.key;
        const disabled = item.key === "lock" && unlockCount === 0;
        const Icon = item.icon;
        const badge =
          item.key === "lock" && unlockCount > 0 ? unlockCount : null;
        return (
          <button
            key={item.key}
            type="button"
            onClick={disabled ? undefined : () => onChange(item.key)}
            aria-disabled={disabled || undefined}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={`group relative flex w-full min-w-0 items-center rounded-md py-1.5 text-left text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:outline-none ${
              collapsed ? "justify-center px-0" : "px-2"
            } ${
              disabled
                ? "cursor-not-allowed opacity-40"
                : active
                  ? "bg-amber-500/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <span
              className={`relative shrink-0 ${active ? "text-amber-500" : ""}`}
              aria-hidden="true"
            >
              <Icon size={16} />
              {collapsed && badge ? (
                <span className="absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[12px] leading-none font-bold text-black">
                  {badge}
                </span>
              ) : null}
            </span>
            <span
              className={`min-w-0 truncate transition-[max-width,opacity,margin] duration-200 ease-out ${
                collapsed
                  ? "ml-0 max-w-0 opacity-0"
                  : "ml-2 max-w-40 opacity-100"
              }`}
            >
              {item.label}
            </span>
            {!collapsed && badge ? (
              <span
                className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[12px] font-bold text-black"
                aria-label={`${unlockCount} ready to lock`}
              >
                {badge}
              </span>
            ) : null}
            {collapsed ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute top-1/2 right-full z-50 mr-2.5 -translate-y-1/2 translate-x-1 rounded-md border border-border bg-popover px-2 py-1 text-[12px] font-medium whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
              >
                {item.label}
                {disabled
                  ? " · nothing to lock"
                  : badge
                    ? ` · ${badge} ready`
                    : ""}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

type WeightKey = "ww" | "pt" | "exam";

/** Interactive weights donut — hovering/focusing a legend row highlights its
 *  arc and swaps the centre readout to that category. */
function WeightsDonut({
  ww,
  pt,
  exam,
  active,
  className,
}: {
  ww: number;
  pt: number;
  exam: number;
  active?: WeightKey | null;
  className?: string;
}) {
  const total = ww + pt + exam;
  const segs: ReadonlyArray<{
    key: WeightKey;
    value: number;
    short: string;
    color: string;
  }> = [
    { key: "ww", value: ww, short: "WW", color: "#3b82f6" },
    { key: "pt", value: pt, short: "PT", color: "#f59e0b" },
    { key: "exam", value: exam, short: "Exam", color: "#ef4444" },
  ];
  const activeSeg = active ? segs.find((s) => s.key === active) : undefined;
  let acc = 0;
  return (
    <div
      className={`relative h-32 w-32 ${className ?? ""}`}
      role="img"
      aria-label={`Weights: Written Work ${ww} percent, Performance Task ${pt} percent, Exam ${exam} percent`}
    >
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
        <circle cx="21" cy="21" r="15.9155" fill="none" strokeWidth="5" className="stroke-muted" />
        {segs.map((s) => {
          const offset = acc;
          acc += s.value;
          if (s.value <= 0) return null;
          const dimmed = active != null && active !== s.key;
          return (
            <circle
              key={s.key}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={s.color}
              strokeWidth={active === s.key ? 6 : 5}
              pathLength={100}
              strokeDasharray={`${s.value} ${100 - s.value}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              opacity={dimmed ? 0.22 : 1}
              className="transition-opacity duration-150 ease-out"
            />
          );
        })}
      </svg>
      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums">
          {activeSeg ? activeSeg.value : total}%
        </span>
        <span className="max-w-20 truncate text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
          {activeSeg ? activeSeg.short : "total"}
        </span>
      </span>
    </div>
  );
}

type WeightRow = {
  key: WeightKey;
  label: string;
  value: number;
  dot: string;
};

/**
 * Left-hand weights panel shared by the Subject info and Class record cards:
 * donut, hover-linked legend and the balanced-total note.
 */
function WeightsSummaryCard({
  weights,
  activeWeight,
  onActiveWeight,
}: {
  weights: ReadonlyArray<WeightRow>;
  activeWeight: WeightKey | null;
  onActiveWeight: (key: WeightKey | null) => void;
}) {
  const total = weights.reduce((sum, row) => sum + row.value, 0);
  const valueOf = (key: WeightKey) => weights.find((row) => row.key === key)?.value ?? 0;
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/20 p-4 dark:bg-transparent">
      <WeightsDonut
        ww={valueOf("ww")}
        pt={valueOf("pt")}
        exam={valueOf("exam")}
        active={activeWeight}
      />
      <div className="flex w-full flex-col gap-0.5" role="group" aria-label="Category weights">
        {weights.map((row) => {
          const active = activeWeight === row.key;
          return (
            <button
              key={row.key}
              type="button"
              onMouseEnter={() => onActiveWeight(row.key)}
              onMouseLeave={() => onActiveWeight(null)}
              onFocus={() => onActiveWeight(row.key)}
              onBlur={() => onActiveWeight(null)}
              aria-label={`${row.label}: ${row.value} percent`}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                active ? "bg-background" : ""
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                {row.label}
              </span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums">
                {row.value}%
              </span>
            </button>
          );
        })}
      </div>
      <p
        className={`w-full border-t border-border/70 pt-2 text-center text-[12px] ${
          total === 100 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {total === 100 ? "Weights balanced at 100%" : `Weights total ${total}% — should be 100%`}
      </p>
    </div>
  );
}

type ToolCardProps = {
  icon: React.ComponentType<{ size?: number | string }>;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The focused tool card: one bordered surface with a large amber icon tile,
 * a bold title, an optional meta line, chips on the right and a bordered
 * footer for the panel's own actions. Same card language as the admin desks.
 */
function ToolCard({
  icon: Icon,
  title,
  description,
  actions,
  footer,
  children,
}: ToolCardProps) {
  return (
    <section className="w-full rounded-xl border border-border bg-card p-5 shadow-sm [font-family:var(--font-inter)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500"
            aria-hidden
          >
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-[0.9375rem] font-bold tracking-[-0.01em] text-foreground">
              {title}
            </h2>
            {description ? (
              <div className="mt-1 text-[0.8125rem] leading-[1.45] text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <span className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</span>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-4">{children}</div>

      {footer ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

type PanelProps = {
  tool: WorkspaceToolKey;
  assignment: ClassAssignment;
  detail: ClassDetail;
  studentCount: number;
  assignmentId: string;
  components: ClassComponent[];
  unlockCount: number;
  subjectLabel: string;
  termLabel: string;
  onChanged: () => void;
  /** Switches the rail tool (e.g. from the subject card's "Manage weights"). */
  onSelectTool?: (next: WorkspaceToolKey) => void;
};

/**
 * The selected tool's content, rendered inline in the workspace's right
 * column (the rail is only the switcher).
 */
export function WorkspaceToolPanel({
  tool,
  assignment,
  detail,
  studentCount,
  assignmentId,
  components,
  unlockCount,
  subjectLabel,
  termLabel,
  onChanged,
  onSelectTool,
}: PanelProps) {
  const [editingWeights, setEditingWeights] = React.useState(false);
  const [activeWeight, setActiveWeight] = React.useState<WeightKey | null>(null);

  // Leaving the weights tool always resets it to the summary view.
  // Render-time adjustment (not an effect) to satisfy the react-compiler gate.
  const [prevTool, setPrevTool] = React.useState<WorkspaceToolKey>(tool);
  if (tool !== prevTool) {
    setPrevTool(tool);
    if (tool !== "weights" && editingWeights) setEditingWeights(false);
  }

  const weightOf = (type: string) => components.find((c) => c.type === type)?.weight ?? 0;
  // Human-readable class record URL (same slug as the gradebook route) —
  // never the internal `subjectId|sectionId` composite.
  const recordSlug = gradebookSlug({
    subject: assignment.subjectName,
    section: assignment.sectionName,
  });

  // Category shares — shared by the weights card and the subject info legend.
  const weights: ReadonlyArray<{
    key: WeightKey;
    label: string;
    value: number;
    dot: string;
    color: string;
  }> = [
    {
      key: "ww",
      label: "Written Work",
      value: weightOf("WRITTEN_WORK"),
      dot: "bg-blue-500",
      color: "#3b82f6",
    },
    {
      key: "pt",
      label: "Performance Task",
      value: weightOf("PERFORMANCE_TASK"),
      dot: "bg-amber-500",
      color: "#f59e0b",
    },
    {
      key: "exam",
      label: "Exam",
      value: weightOf("EXAM"),
      dot: "bg-red-500",
      color: "#ef4444",
    },
  ];

  if (tool === "weights") {
    if (editingWeights) {
      // Same card language as the summary — the editor stays a panel in the
      // column, never a full-width slab.
      return (
        <div className="flex min-w-0 flex-1 items-center justify-center py-6">
          <div className="w-full max-w-2xl">
            <ToolCard
              icon={Scale}
              title="Category weights"
              description="Each category's share of the final grade. The three weights must total 100%."
            >
              <WeightsEditor
                detail={detail}
                onConfirm={() => setEditingWeights(false)}
                onSaved={() => {
                  setEditingWeights(false);
                  onChanged();
                }}
              />
            </ToolCard>
          </div>
        </div>
      );
    }
    // Same card language as Subject info: header chips, interactive donut +
    // one tile per weight category.
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-2xl">
          <ToolCard
            icon={Scale}
            title="Subject weights"
            description="Written Work / Performance Task / Exam shares of the final grade."
            footer={
              <>
                <span className="text-[12px] text-muted-foreground">
                  Weights must total 100%.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 gap-1.5 px-3 text-xs"
                  onClick={() => setEditingWeights(true)}
                >
                  <Pencil size={14} aria-hidden />
                  Edit weights
                </Button>
              </>
            }
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-center">
              <div className="flex justify-center rounded-lg border border-border bg-muted/20 p-4 dark:bg-transparent">
                <WeightsDonut
                  ww={weightOf("WRITTEN_WORK")}
                  pt={weightOf("PERFORMANCE_TASK")}
                  exam={weightOf("EXAM")}
                  active={activeWeight}
                />
              </div>
              <div className="flex flex-col gap-2" role="group" aria-label="Category weights">
                {weights.map((row) => {
                  const active = activeWeight === row.key;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onMouseEnter={() => setActiveWeight(row.key)}
                      onMouseLeave={() => setActiveWeight(null)}
                      onFocus={() => setActiveWeight(row.key)}
                      onBlur={() => setActiveWeight(null)}
                      aria-label={`${row.label}: ${row.value} percent`}
                      className={`group flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:border-amber-500/40 hover:bg-amber-500/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-transparent ${
                        active ? "border-amber-500/40 bg-amber-500/[0.04]" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                          {row.label}
                        </span>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                          {row.value}%
                        </span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span
                          className="block h-full rounded-full transition-[width] duration-150 ease-out"
                          style={{ width: `${row.value}%`, backgroundColor: row.color }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </ToolCard>
        </div>
      </div>
    );
  }

  if (tool === "add") {
    // Same card language as Subject info / Subject weights.
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-xl">
          <ToolCard
            icon={Plus}
            title="Add assessment"
            description="New quiz, activity, or exam for this class."
          >
            <AddAssessmentForm
              assignmentId={assignmentId}
              onSaved={() => {
                onChanged();
              }}
            />
          </ToolCard>
        </div>
      </div>
    );
  }

  if (tool === "record") {
    // Same card language as Subject info, exactly: the weights donut panel
    // beside the same icon-tile fact grid, with footer actions for the weights
    // editor and the printable sheet.
    const recordFacts: Array<{
      label: string;
      value: string;
      icon: React.ComponentType<{ size?: number | string; className?: string }>;
      wide?: boolean;
    }> = [
      { label: "Section", value: assignment.sectionName, icon: Users },
      {
        label: "Grade level",
        value: `Grade ${gradeLabel(assignment.gradeLevel)}`,
        icon: GraduationCap,
      },
      { label: "Subject code", value: assignment.subjectCode, icon: Hash },
      {
        label: "Subject type",
        value: assignment.subjectCategory === "ELECTIVE" ? "Elective" : "Core",
        icon: Layers,
      },
      {
        label: "Enrolled",
        value: `${studentCount} student${studentCount === 1 ? "" : "s"}`,
        icon: UsersRound,
        wide: true,
      },
    ];
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-3xl">
          <ToolCard
            icon={FileText}
            title="Class record"
            footer={
              <>
                <span className="text-[12px] text-muted-foreground">
                  Opens in a new tab
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {onSelectTool ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-3 text-xs"
                      onClick={() => onSelectTool("weights")}
                    >
                      <Scale size={14} aria-hidden />
                      Manage weights
                    </Button>
                  ) : null}
                  <Button
                    asChild
                    size="sm"
                    className="h-7 gap-1.5 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                  >
                    <a href={`/record/${recordSlug}`} target="_blank" rel="noopener noreferrer">
                      <FileText size={14} aria-hidden />
                      Open record
                    </a>
                  </Button>
                </span>
              </>
            }
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-stretch">
              <WeightsSummaryCard
                weights={weights}
                activeWeight={activeWeight}
                onActiveWeight={setActiveWeight}
              />

              <div className="grid grid-cols-2 gap-2">
                {recordFacts.map((fact) => {
                  const Icon = fact.icon;
                  return (
                    <div
                      key={fact.label}
                      className={`group flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors duration-150 ease-out hover:border-amber-500/40 hover:bg-amber-500/[0.04] ${
                        fact.wide ? "col-span-2" : ""
                      }`}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors duration-150 ease-out group-hover:bg-amber-500/10 group-hover:text-amber-500"
                        aria-hidden
                      >
                        <Icon size={14} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                          {fact.label}
                        </span>
                        <span className="truncate text-[13px] font-semibold text-foreground">
                          {fact.value}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </ToolCard>
        </div>
      </div>
    );
  }

  if (tool === "lock") {
    // Same centered card language as Class record — one focused panel.
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-xl">
          <ToolCard
            icon={Lock}
            title="Lock grades"
            description="Send this term's computed finals to the adviser for approval."
            footer={
              unlockCount > 0 ? (
                <>
                  <span className="text-[12px] text-muted-foreground">
                    Editable until the adviser approves
                  </span>
                  <LockGradesButton
                    assignmentId={assignmentId}
                    subjectLabel={subjectLabel}
                    termLabel={termLabel}
                    unlockCount={unlockCount}
                    className="ml-auto h-7 px-3 text-xs"
                  />
                </>
              ) : null
            }
          >
            <div className="flex flex-col gap-2">
              <div
                className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors duration-150 ease-out ${
                  unlockCount > 0
                    ? "border-amber-500/40 bg-amber-500/[0.04]"
                    : "border-border bg-muted/20 dark:bg-transparent"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-amber-500">
                  <Lock size={16} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Finals ready to lock
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">
                    {unlockCount > 0
                      ? `${unlockCount} unlocked final${unlockCount === 1 ? "" : "s"}`
                      : "Nothing to send right now"}
                  </span>
                </span>
                <span className="shrink-0 text-2xl leading-none font-bold text-amber-500 tabular-nums">
                  {unlockCount}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 px-3 py-2 sm:col-span-2 dark:bg-transparent">
                  <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Subject
                  </span>
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    {assignment.subjectName}
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({assignment.subjectCode})
                    </span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 px-3 py-2 dark:bg-transparent">
                  <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Term
                  </span>
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    Term {assignment.termNumber}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/20 px-3 py-2 dark:bg-transparent">
                  <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    School year
                  </span>
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    {assignment.schoolYear}
                  </span>
                </div>
              </div>

              <p className="text-[12px] leading-snug text-muted-foreground">
                Locked finals can still be edited until the adviser approves them.
              </p>
            </div>
          </ToolCard>
        </div>
      </div>
    );
  }

  const facts: Array<{
    label: string;
    value: string;
    icon: React.ComponentType<{ size?: number | string; className?: string }>;
    wide?: boolean;
  }> = [
    { label: "Section", value: assignment.sectionName, icon: Users },
    { label: "Grade level", value: `Grade ${gradeLabel(assignment.gradeLevel)}`, icon: GraduationCap },
    { label: "Subject code", value: assignment.subjectCode, icon: Hash },
    {
      label: "Subject type",
      value: assignment.subjectCategory === "ELECTIVE" ? "Elective" : "Core",
      icon: Layers,
    },
    {
      label: "Enrolled",
      value: `${studentCount} student${studentCount === 1 ? "" : "s"}`,
      icon: UsersRound,
      wide: true,
    },
  ];

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center py-6">
      <div className="w-full max-w-3xl">
        <ToolCard
          icon={BookOpenText}
          title={assignment.subjectName}
          footer={
            <>
              <span className="text-[12px] text-muted-foreground">
                Final grades follow the DepEd transmutation table.
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {onSelectTool ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-3 text-xs"
                    onClick={() => onSelectTool("weights")}
                  >
                    <Scale size={14} aria-hidden />
                    Manage weights
                  </Button>
                ) : null}
                <Button
                  asChild
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                >
                  <a href={`/record/${recordSlug}`} target="_blank" rel="noopener noreferrer">
                    <FileText size={14} aria-hidden />
                    Class record
                  </a>
                </Button>
              </span>
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-stretch">
            <WeightsSummaryCard
              weights={weights}
              activeWeight={activeWeight}
              onActiveWeight={setActiveWeight}
            />

            <div className="grid grid-cols-2 gap-2">
              {facts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <div
                    key={fact.label}
                    className={`group flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors duration-150 ease-out hover:border-amber-500/40 hover:bg-amber-500/[0.04] ${
                      fact.wide ? "col-span-2" : ""
                    }`}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors duration-150 ease-out group-hover:bg-amber-500/10 group-hover:text-amber-500"
                      aria-hidden
                    >
                      <Icon size={14} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        {fact.label}
                      </span>
                      <span className="truncate text-[13px] font-semibold text-foreground">
                        {fact.value}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </ToolCard>
      </div>
    </div>
  );
}
