"use client";

import { BookPlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import { useAddSubjects, type SubjectCreateProgress } from "./use-add-subjects";
import { subjectCodePreview } from "./subject-code";
import styles from "./add-section-kanban.module.css";

const MAX_ROWS = 10;

const GRADE_LEVELS = ["G7", "G8", "G9", "G10", "G11", "G12"] as const;

const CATEGORIES = [
  { value: "CORE", label: "Core" },
  { value: "ELECTIVE", label: "Elective" },
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
 * name + grade (shown live per row), confirming closes immediately, and the
 * shared Dock reports the save while the catalog already shows the new rows.
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

  const duplicateName = (() => {
    const seen = new Set<string>();
    for (const row of filled) {
      const key = row.name.trim().toLowerCase();
      if (seen.has(key)) return row.name.trim();
      seen.add(key);
    }
    return null;
  })();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <header className="flex items-start gap-2.5 border-b border-border px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
          aria-hidden
        >
          <BookPlus size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">Add subjects</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Type the subject names — the system gives each one its code.
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
      >
        <div className={`${styles.body} flex max-h-[60dvh] flex-col gap-4 overflow-y-auto px-4 py-4`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-[12px] font-medium text-foreground">Grade level</span>
              <FilterTabs
                label="Grade level"
                options={GRADE_LEVELS.map((g) => ({ value: g, label: g.replace("G", "") }))}
                value={gradeLevel}
                onChange={(next) => setGradeLevel(next)}
                className="self-start"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-[12px] font-medium text-foreground">Category</span>
              <FilterTabs
                label="Category"
                options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                value={category === "ELECTIVE" ? "ELECTIVE" : "CORE"}
                onChange={(next) => setCategory(next)}
                className="self-start"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Subject names</span>
            <div className="flex flex-col gap-1.5">
              {rows.map((row, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <Input
                    className="h-8 text-[13px]"
                    placeholder={index === 0 ? "e.g. Mathematics" : "Another subject name"}
                    value={row.name}
                    onChange={(e) => patchRow(index, { name: e.target.value })}
                    maxLength={120}
                    autoFocus={index === 0}
                    autoComplete="off"
                    aria-label={`Subject ${index + 1} name`}
                  />
                  <Pill
                    tone={row.name.trim() ? "violet" : "neutral"}
                    className="shrink-0 font-mono tracking-wide"
                  >
                    {row.name.trim() ? subjectCodePreview(row.name, gradeLevel) : "Auto"}
                  </Pill>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setRows((prev) => (prev.length === 1 ? [{ name: "" }] : prev.filter((_, j) => j !== index)))
                    }
                    disabled={rows.length === 1}
                    aria-label={`Remove subject name ${index + 1}`}
                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
                  >
                    <X size={14} aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, { name: "" }]))}
                disabled={rows.length >= MAX_ROWS}
                className="h-6 gap-1 px-2 text-[12px]"
              >
                <Plus size={12} aria-hidden />
                Add another subject
              </Button>
              <span className="text-[12px] text-muted-foreground">{filled.length} to create</span>
            </div>
            <p className="text-[12px] leading-snug text-muted-foreground">
              Codes are generated automatically from the name and grade — two subjects can share a
              name only across grades.
            </p>
            {duplicateName ? (
              <p role="alert" className="text-[12px] text-destructive">
                &ldquo;{duplicateName}&rdquo; appears twice — each subject name must be different.
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <BookPlus size={13} aria-hidden className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Creates{" "}
              <span className="font-medium text-foreground">
                {filled.length || rows.length} subject{(filled.length || rows.length) === 1 ? "" : "s"}
              </span>{" "}
              for <span className="font-medium text-foreground">{gradeLabel(gradeLevel)}</span> ·{" "}
              {category === "ELECTIVE" ? "Elective" : "Core"}. Every one is usable in the term&apos;s
              timetable right away.
            </p>
          </div>

          {formError ? (
            <p role="alert" className="text-[12px] leading-snug text-destructive">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="submit"
            disabled={filled.length === 0 || duplicateName !== null}
            className="h-6 gap-1.5 px-2.5 text-[12px]"
          >
            <BookPlus size={12} aria-hidden />
            Create {filled.length > 1 ? `${filled.length} subjects` : "subject"}
          </Button>
        </div>
      </form>
    </div>
  );
}
