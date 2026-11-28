"use client";

import * as React from "react";
import { BookPlus, CalendarRange, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SelectionCard } from "@/components/ui/selection-card";
import { useTerm } from "@/lib/term/TermContext";
import { subjectCategoryLabel } from "@/lib/labels/subject-category";
import { useAddSubjects, type SubjectCreateProgress } from "./use-add-subjects";
import styles from "./add-section-kanban.module.css";

const MAX_ROWS = 10;

const GRADE_LEVELS = ["G7", "G8", "G9", "G10", "G11", "G12"] as const;

const CATEGORIES = [
  { value: "CORE", label: "Core" },
  { value: "APPLIED", label: "Applied" },
  { value: "SPECIALIZED", label: "Specialized" },
] as const;

interface Props {
  onClose: () => void;
  onProgress?: (p: SubjectCreateProgress | null) => void;
}

function gradeLabel(grade: string): string {
  return `Grade ${grade.replace("G", "")}`;
}

/**
 * Add subjects in one pass: pick the grade from the tab bar, pick the category,
 * then type as many subject names as needed. The code is system-minted from the
 * name + grade, confirming closes immediately, and the shared Dock reports the
 * save while the catalog already shows the new rows.
 *
 * Laid out exactly like the section creator (`add-section-kanban`): fixed
 * school-year context, tag filters, one name per row with a Cancel link, and
 * the summary note pinned above the footer.
 */
export function SubjectAddKanban({ onClose, onProgress }: Props) {
  const {
    rows,
    setRows,
    patchRow,
    filled,
    gradeLevel,
    setGradeLevel,
    category,
    setCategory,
    formError,
    handleCreate,
  } = useAddSubjects(onClose, onProgress);
  const { schoolYears, activeTerm, activeSchoolYear } = useTerm();

  // Subjects are created in the active school year — it is context, not a
  // choice, so the form only shows it (same as the section creator).
  const yearId =
    activeTerm?.schoolYearId ?? activeSchoolYear?.id ?? schoolYears[0]?.id ?? "";
  const year = schoolYears.find((y) => y.id === yearId) ?? null;

  const duplicateName = (() => {
    const seen = new Set<string>();
    for (const row of filled) {
      const key = row.name.trim().toLowerCase();
      if (seen.has(key)) return row.name.trim();
      seen.add(key);
    }
    return null;
  })();

  const addRow = () => setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, { name: "" }]));
  const removeRow = (index: number) =>
    setRows((prev) => (prev.length === 1 ? [{ name: "" }] : prev.filter((_, j) => j !== index)));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
          aria-hidden
        >
          <BookPlus size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">Add subjects</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Pick a grade level, then add as many subject names as you need.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add subjects"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <X size={15} aria-hidden />
        </button>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleCreate();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className={`${styles.body} flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4`}>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">School year</span>
            {year ? (
              <SelectionCard
                icon={<CalendarRange size={15} aria-hidden />}
                title={year.name}
                description="Subjects are created in the active school year."
                meta={
                  <span className="shrink-0 rounded bg-green-500/10 px-1 text-[12px] font-medium text-green-700 dark:text-green-400">
                    Active
                  </span>
                }
                selected
              />
            ) : (
              <SelectionCard
                icon={<CalendarRange size={15} aria-hidden />}
                title="No active school year"
                description="Add and activate a school year before creating subjects."
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Grade level</span>
            <FilterTabs
              label="Grade level"
              variant="tags"
              options={GRADE_LEVELS.map((g) => ({ value: g, label: g, tone: "neutral" as const }))}
              value={gradeLevel}
              onChange={(next) => setGradeLevel(next)}
              className="self-start"
            />
            <p className="text-[12px] leading-snug text-muted-foreground">
              Every name below is created for {gradeLabel(gradeLevel)}
              {year ? ` in ${year.name}` : ""}.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Category</span>
            <FilterTabs
              label="Category"
              variant="tags"
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label, tone: "neutral" as const }))}
              value={category === "ELECTIVE" ? "SPECIALIZED" : category}
              onChange={(next) => setCategory(next)}
              className="self-start"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-foreground">Subject names</span>
              <Button
                type="button"
                variant="ghost"
                onClick={addRow}
                disabled={rows.length >= MAX_ROWS}
                aria-label="Add another subject"
                title="Add another subject"
                className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              >
                <Plus size={14} aria-hidden />
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              {rows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    className="h-8 rounded-lg border-input bg-transparent px-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/25 dark:bg-transparent"
                    placeholder={index === 0 ? "e.g. Mathematics" : "Another subject name"}
                    value={row.name}
                    onChange={(e) => patchRow(index, { name: e.target.value })}
                    maxLength={120}
                    autoFocus={index === 0}
                    autoComplete="off"
                    aria-label={`Subject ${index + 1} name`}
                  />
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      aria-label={`Cancel subject name ${index + 1}`}
                      className="shrink-0 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground hover:underline hover:underline-offset-2"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => patchRow(index, { name: "" })}
                      disabled={row.name.trim() === ""}
                      aria-label={`Clear subject name ${index + 1}`}
                      className="shrink-0 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground hover:underline hover:underline-offset-2 disabled:pointer-events-none disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
            {duplicateName ? (
              <p role="alert" className="text-[12px] text-destructive">
                &ldquo;{duplicateName}&rdquo; appears twice — each subject name must be different.
              </p>
            ) : null}
          </div>

          <div className="mt-auto flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <BookPlus size={13} aria-hidden className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Creates{" "}
              <span className="font-medium text-foreground">
                {filled.length || rows.length} subject{(filled.length || rows.length) === 1 ? "" : "s"}
              </span>{" "}
              for <span className="font-medium text-foreground">{gradeLabel(gradeLevel)}</span> ·{" "}
              {subjectCategoryLabel(category)}. Every one is usable in the term&apos;s
              timetable right away.
            </p>
          </div>

          {formError ? (
            <p role="alert" className="text-[12px] leading-snug text-destructive">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="submit"
            disabled={filled.length === 0 || duplicateName !== null}
            className="h-6 gap-1.5 px-2.5 text-[12px]"
          >
            Create {filled.length > 1 ? `${filled.length} subjects` : "subject"}
          </Button>
        </div>
      </form>
    </div>
  );
}
