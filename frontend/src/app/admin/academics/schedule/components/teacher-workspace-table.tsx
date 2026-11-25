"use client";

import type { CSSProperties } from "react";
import { Check, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { cn } from "@/lib/utils";
import type { CatalogTeacher } from "./use-schedule-catalog";
import styles from "./subject-workspace-table.module.css";

/** "linked account, 2 timetable slots" — what keeps a name locked. */
export function teacherLockReason(teacher: CatalogTeacher): string {
  const parts: string[] = [];
  if (teacher.linked) parts.push("a linked account");
  const slots = teacher.links?.timetableEntries ?? 0;
  if (slots > 0) parts.push(`${slots} timetable slot${slots === 1 ? "" : "s"}`);
  const grants = teacher.links?.termGrants ?? 0;
  if (grants > 0) parts.push(`${grants} term grant${grants === 1 ? "" : "s"}`);
  return parts.length > 0 ? `Locked — used by ${parts.join(", ")}` : "Locked — used by existing records";
}

/**
 * The teacher catalog as a data table — same anatomy as the subject catalog
 * (`subject-workspace-table`): hairline header row, muted 12px column labels,
 * row separators, hover tint. Reduced to the columns that matter when picking a
 * name for a weekly grid: the teacher and its linked account, the system-minted
 * code, how many slots already point at it and whether records pin it.
 */
export function TeacherWorkspaceTable({
  teachers,
  deleteMode = false,
  selectedIds,
  onToggle,
  onDelete,
}: {
  teachers: CatalogTeacher[];
  /** Puts a selection box on every unlocked row (delete mode). */
  deleteMode?: boolean;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  onDelete?: (teacher: CatalogTeacher) => void;
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
              Teacher
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
              Account
            </th>
            <th
              scope="col"
              className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
            >
              Timetable slots
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
          {teachers.map((t, index) => {
            const locked = Boolean(t.locked);
            const checked = deleteMode && (selectedIds ?? []).includes(t.id);
            const selectable = deleteMode && !locked;
            const slots = t.links?.timetableEntries ?? 0;
            return (
              <tr
                key={t.id}
                tabIndex={selectable ? 0 : undefined}
                aria-selected={checked || undefined}
                onClick={selectable ? () => onToggle?.(t.id) : undefined}
                onKeyDown={(event) => {
                  if (!selectable) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggle?.(t.id);
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
                        onCheckedChange={() => onToggle?.(t.id)}
                        title={locked ? teacherLockReason(t) : undefined}
                        aria-label={
                          locked
                            ? `${t.name} is locked and cannot be deleted`
                            : `Select ${t.name} for deletion`
                        }
                      />
                    </span>
                  </td>
                ) : null}
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex items-center gap-2">
                    <StudentMascot name={t.name} seed={t.id} size={28} />
                    <div className="flex min-w-0 flex-col">
                      <p className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground">
                        {t.name}
                      </p>
                      <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
                        {t.linkedName ?? "Name only"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  {t.code ? (
                    <span className="font-mono text-[12px] tracking-wide text-muted-foreground">
                      {t.code}
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">No code</span>
                  )}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  {t.linked ? (
                    <Pill tone="green" label="Account">
                      <Check size={11} aria-hidden />
                      Linked
                    </Pill>
                  ) : (
                    <Pill tone="neutral" label="Account">
                      Name only
                    </Pill>
                  )}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                  {slots > 0 ? `${slots} slot${slots === 1 ? "" : "s"}` : "—"}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  {locked ? (
                    <span
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700 dark:text-amber-400"
                      title={teacherLockReason(t)}
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
                      aria-label={`Delete ${t.name}`}
                      title={locked ? teacherLockReason(t) : "Delete teacher"}
                      disabled={locked}
                      onClick={() => onDelete?.(t)}
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
