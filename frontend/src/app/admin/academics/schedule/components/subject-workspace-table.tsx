"use client";

import type { CSSProperties } from "react";
import { BookOpen, Check, Lock, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { ScheduleSubject } from "../page";
import styles from "./subject-workspace-table.module.css";

const GRADES = [
  { key: "G7", label: "Grade 7" },
  { key: "G8", label: "Grade 8" },
  { key: "G9", label: "Grade 9" },
  { key: "G10", label: "Grade 10" },
  { key: "G11", label: "Grade 11" },
  { key: "G12", label: "Grade 12" },
] as const;

export function gradeLabel(grade: string): string {
  return GRADES.find((g) => g.key === grade)?.label ?? grade;
}

export function categoryLabel(category: string): string {
  return category === "ELECTIVE" ? "Elective" : "Core";
}

/** "Locked — used by 3 timetable slots, 1 teacher assignment, gradebook records". */
export function lockReason(links: ScheduleSubject["links"]): string {
  if (!links) return "Locked — used by existing records";
  const parts: string[] = [];
  if (links.timetableEntries > 0) {
    parts.push(
      `${links.timetableEntries} timetable slot${links.timetableEntries === 1 ? "" : "s"}`,
    );
  }
  if (links.assignments > 0) {
    parts.push(
      `${links.assignments} teacher assignment${links.assignments === 1 ? "" : "s"}`,
    );
  }
  if (links.gradebook > 0) parts.push("gradebook records");
  return parts.length > 0
    ? `Locked — used by ${parts.join(", ")}`
    : "Locked — used by existing records";
}

/**
 * The subject catalog as a data table — same anatomy as the timetable
 * workspace's section list (`section-workspace-table`): hairline header row,
 * muted 12px column labels, row separators, hover tint. Reduced to the columns
 * that matter when placing a subject on a weekly grid: the subject and its
 * category, grade level, system-minted code and whether records pin it.
 */
export function SubjectWorkspaceTable({
  subjects,
  deleteMode = false,
  selectedIds,
  onToggle,
  onEdit,
  onDelete,
}: {
  subjects: ScheduleSubject[];
  /** Puts a selection box on every unlocked row (delete mode). */
  deleteMode?: boolean;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  onEdit?: (subject: ScheduleSubject) => void;
  onDelete?: (subject: ScheduleSubject) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {deleteMode ? (
              <th scope="col" className="w-10 px-4 py-2.5">
                <span className="sr-only">Select</span>
              </th>
            ) : null}
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Subject
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Grade
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Category
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Code
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Availability
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-right text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, index) => {
            const locked = Boolean(s.locked);
            const checked = deleteMode && (selectedIds ?? []).includes(s.id);
            const selectable = deleteMode && !locked;
            return (
              <tr
                key={s.id}
                tabIndex={selectable ? 0 : undefined}
                aria-selected={checked || undefined}
                onClick={selectable ? () => onToggle?.(s.id) : undefined}
                onKeyDown={(event) => {
                  if (!selectable) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggle?.(s.id);
                  }
                }}
                style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as CSSProperties}
                className={cn(
                  styles.row,
                  "border-b border-border/60 transition-colors duration-150 last:border-b-0",
                  selectable && "cursor-pointer",
                  checked ? "bg-red-500/5 dark:bg-red-500/10" : "hover:bg-muted/60",
                )}
              >
                {deleteMode ? (
                  <td className="px-4 py-2.5 align-middle">
                    <span onClick={(event) => event.stopPropagation()} className="flex">
                      <Checkbox
                        checked={checked}
                        disabled={locked}
                        onCheckedChange={() => onToggle?.(s.id)}
                        title={locked ? lockReason(s.links) : undefined}
                        aria-label={
                          locked
                            ? `${s.name} (${s.code}) is locked and cannot be deleted`
                            : `Select ${s.name} (${s.code}) for deletion`
                        }
                      />
                    </span>
                  </td>
                ) : null}
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground"
                      aria-hidden
                    >
                      <BookOpen size={14} />
                    </span>
                    <p className="m-0 text-[13px] leading-tight font-semibold text-foreground">
                      {s.name}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                  {gradeLabel(s.gradeLevel)}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  <Pill
                    tone={s.category === "ELECTIVE" ? "sky" : "amber"}
                    label="Subject category"
                  >
                    {categoryLabel(s.category)}
                  </Pill>
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  <span className="font-mono text-[12px] tracking-wide text-muted-foreground">
                    {s.code}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  {locked ? (
                    <span
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700 dark:text-amber-400"
                      title={lockReason(s.links)}
                    >
                      <Lock size={11} aria-hidden />
                      Locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-700 dark:text-green-400">
                      <Check size={11} aria-hidden />
                      Can be deleted
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Edit ${s.name}`}
                      title="Edit subject"
                      onClick={() => onEdit?.(s)}
                    >
                      <Pencil size={12} aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${s.name}`}
                      title={locked ? lockReason(s.links) : "Delete subject"}
                      disabled={locked}
                      onClick={() => onDelete?.(s)}
                    >
                      <Trash2 size={12} aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
