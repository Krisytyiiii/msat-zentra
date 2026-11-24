"use client";

import * as React from "react";
import {
  ArrowUpRight,
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
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
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
import styles from "./ClassWorkspace.module.css";

/** Which tool the workspace's left rail has selected. */
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
 * Left nav for the grading workspace: one link per tool, the selected link
 * highlighted. Selecting a link swaps the panel in the right column — nothing
 * floats over the content.
 */
export function WorkspaceToolNav({
  value,
  onChange,
  unlockCount,
}: {
  value: WorkspaceToolKey;
  onChange: (next: WorkspaceToolKey) => void;
  unlockCount: number;
}) {
  return (
    <nav
      className="flex min-w-0 flex-col gap-0.5"
      aria-label="Gradebook tools"
    >
      {NAV_ITEMS.map((item) => {
        const active = value === item.key;
        const disabled = item.key === "lock" && unlockCount === 0;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={disabled ? undefined : () => onChange(item.key)}
            aria-disabled={disabled || undefined}
            aria-current={active ? "page" : undefined}
            className={`relative flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
              disabled
                ? "cursor-not-allowed opacity-40"
                : active
                  ? "bg-amber-500/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <span
              className={`shrink-0 ${active ? "text-amber-500" : ""}`}
              aria-hidden="true"
            >
              <Icon size={16} />
            </span>
            <span className="truncate">{item.label}</span>
            {item.key === "lock" && unlockCount > 0 ? (
              <span
                className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[12px] font-bold text-black"
                aria-label={`${unlockCount} ready to lock`}
              >
                {unlockCount}
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
      // Same centered card language as the summary — the editor stays a panel
      // in the column, never a full-width slab.
      return (
        <div className="flex min-w-0 flex-1 items-center justify-center py-6">
          <div className="w-full max-w-2xl">
            <KanbanBoard
              title="Category weights"
              className={styles.subjectBoard}
              icon={
                <span className="text-amber-500" aria-hidden>
                  <Scale size={14} />
                </span>
              }
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
            </KanbanBoard>
          </div>
        </div>
      );
    }
    // Same card language as Subject info: centered card, header chips,
    // interactive donut + one tile per weight category.
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-2xl">
          <KanbanBoard
            title="Subject weights"
            className={styles.subjectBoard}
            icon={
              <span className="text-amber-500" aria-hidden>
                <Scale size={14} />
              </span>
            }
            actions={
              <span className="flex items-center gap-1.5">
                <Pill tone="green" label="Section">
                  {assignment.sectionName}
                </Pill>
                <Pill tone="blue" label="Grade level">
                  Grade {gradeLabel(assignment.gradeLevel)}
                </Pill>
              </span>
            }
            description="Written Work / Performance Task / Exam shares of the final grade."
            footer={
              <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-3 text-xs"
                  onClick={() => setEditingWeights(true)}
                >
                  <Pencil size={14} aria-hidden />
                  Edit weights
                </Button>
              </div>
            }
          >
            <div className="grid gap-5 px-1 py-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-center">
              <div className="flex justify-center">
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
                      className={`group flex flex-col gap-1.5 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:border-amber-500/40 hover:bg-amber-500/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-transparent ${
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
          </KanbanBoard>
        </div>
      </div>
    );
  }

  if (tool === "add") {
    // Same centered card language as Subject info / Subject weights.
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-xl">
          <KanbanBoard
            title="Add assessment"
            className={styles.subjectBoard}
            icon={
              <span className="text-amber-500" aria-hidden>
                <Plus size={14} />
              </span>
            }
            actions={
              <span className="flex items-center gap-1.5">
                <Pill tone="green" label="Section">
                  {assignment.sectionName}
                </Pill>
                <Pill tone="blue" label="Grade level">
                  Grade {gradeLabel(assignment.gradeLevel)}
                </Pill>
              </span>
            }
            description="New quiz, activity, or exam for this class."
          >
            <AddAssessmentForm
              assignmentId={assignmentId}
              onSaved={() => {
                onChanged();
              }}
            />
          </KanbanBoard>
        </div>
      </div>
    );
  }

  if (tool === "record") {
    // Same centered card language as Subject info / weights: one focused panel,
    // no assessment list or audience toggle beneath it.
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-xl">
          <KanbanBoard
            title="Class record"
            className={styles.subjectBoard}
            icon={
              <span className="text-amber-500" aria-hidden>
                <FileText size={14} />
              </span>
            }
            actions={
              <span className="flex items-center gap-1.5">
                <Pill tone="green" label="Section">
                  {assignment.sectionName}
                </Pill>
                <Pill tone="blue" label="Grade level">
                  Grade {gradeLabel(assignment.gradeLevel)}
                </Pill>
              </span>
            }
            description="Printable record sheet for this class — opens in a new tab."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-1 pt-3 pb-1">
                <span className="text-[12px] text-muted-foreground">
                  Opens in a new tab
                </span>
                <Button
                  asChild
                  size="sm"
                  className="h-6 gap-1.5 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                >
                  <a href={`/record/${recordSlug}`} target="_blank" rel="noopener noreferrer">
                    <FileText size={14} aria-hidden />
                    Open record
                  </a>
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-2 px-1 py-3">
              <a
                href={`/record/${recordSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-3 transition-colors duration-150 ease-out hover:border-amber-500/40 hover:bg-amber-500/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-transparent"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-amber-500 transition-colors duration-150 ease-out group-hover:border-amber-500/40">
                  <FileText size={16} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-foreground">
                    Class record sheet
                  </span>
                  <span className="truncate text-[12px] text-muted-foreground">
                    Written work, performance tasks, exams and final ratings.
                  </span>
                </span>
                <ArrowUpRight
                  size={15}
                  aria-hidden
                  className="shrink-0 text-muted-foreground transition-colors duration-150 ease-out group-hover:text-amber-500"
                />
              </a>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:bg-transparent">
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
                <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:bg-transparent">
                  <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Section
                  </span>
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    {assignment.sectionName}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · Term {assignment.termNumber}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </KanbanBoard>
        </div>
      </div>
    );
  }

  if (tool === "lock") {
    // Same centered card language as Class record — one focused panel.
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center py-6">
        <div className="w-full max-w-xl">
          <KanbanBoard
            title="Lock grades"
            className={styles.subjectBoard}
            icon={
              <span className="text-amber-500" aria-hidden>
                <Lock size={14} />
              </span>
            }
            actions={
              <span className="flex items-center gap-1.5">
                <Pill tone="green" label="Section">
                  {assignment.sectionName}
                </Pill>
                <Pill tone="blue" label="Grade level">
                  Grade {gradeLabel(assignment.gradeLevel)}
                </Pill>
              </span>
            }
            description="Send this term's computed finals to the adviser for approval."
            footer={
              unlockCount > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-1 pt-3 pb-1">
                  <span className="text-[12px] text-muted-foreground">
                    Editable until the adviser approves
                  </span>
                  <LockGradesButton
                    assignmentId={assignmentId}
                    subjectLabel={subjectLabel}
                    termLabel={termLabel}
                    unlockCount={unlockCount}
                    className="h-6 px-3 text-xs"
                  />
                </div>
              ) : null
            }
          >
            <div className="flex flex-col gap-2 px-1 py-3">
              <div
                className={`flex items-center gap-3 rounded-md border px-3 py-3 transition-colors duration-150 ease-out ${
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
                <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:bg-transparent">
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
                <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:bg-transparent">
                  <span className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Term
                  </span>
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    Term {assignment.termNumber}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {assignment.schoolYear}
                    </span>
                  </span>
                </div>
              </div>

              <p className="px-1 text-[12px] leading-snug text-muted-foreground">
                Locked finals can still be edited until the adviser approves them.
              </p>
            </div>
          </KanbanBoard>
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
      <div className="w-full max-w-2xl">
        <KanbanBoard
          title={assignment.subjectName}
          className={styles.subjectBoard}
          icon={
            <span className="text-amber-500" aria-hidden>
              <BookOpenText size={14} />
            </span>
          }
          actions={
            <span className="flex items-center gap-1.5">
              <Pill tone="green" label="Section">
                {assignment.sectionName}
              </Pill>
              <Pill tone="blue" label="Grade level">
                Grade {gradeLabel(assignment.gradeLevel)}
              </Pill>
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-foreground">{assignment.subjectCode}</span>
              <span aria-hidden>·</span>
              <span>Term {assignment.termNumber}</span>
              <span aria-hidden>·</span>
              <span>{assignment.schoolYear}</span>
            </span>
          }
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1">
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
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-3 text-xs"
              >
                <a href={`/record/${recordSlug}`} target="_blank" rel="noopener noreferrer">
                  <FileText size={14} aria-hidden />
                  Class record
                </a>
              </Button>
            </div>
          }
        >
          <div className="grid gap-5 px-1 py-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:items-center">
            <div className="flex flex-col items-center gap-3">
              <WeightsDonut
                ww={weightOf("WRITTEN_WORK")}
                pt={weightOf("PERFORMANCE_TASK")}
                exam={weightOf("EXAM")}
                active={activeWeight}
              />
              <div className="flex w-full flex-col gap-0.5" role="group" aria-label="Category weights">
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
                      className={`flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors duration-150 ease-out hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                        active ? "bg-muted" : ""
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
            </div>

            <dl className="grid grid-cols-2 gap-2">
              {facts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <div
                    key={fact.label}
                    className={`group flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 transition-colors duration-150 ease-out hover:border-amber-500/40 hover:bg-amber-500/[0.04] ${
                      fact.wide ? "col-span-2" : ""
                    }`}
                  >
                    <dt className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                      <Icon
                        size={12}
                        aria-hidden
                        className="shrink-0 text-muted-foreground/70 transition-colors duration-150 ease-out group-hover:text-amber-500"
                      />
                      {fact.label}
                    </dt>
                    <dd className="truncate text-[13px] font-semibold text-foreground">
                      {fact.value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </KanbanBoard>
      </div>
    </div>
  );
}
