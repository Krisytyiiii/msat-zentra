"use client";

import * as React from "react";
import { BookOpen, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SelectionCard } from "@/components/ui/selection-card";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/errors";
import { toast } from "@/components/ui/sonner";
import type { ScheduleSubject } from "../page";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";
import { gradeLabel } from "./subject-workspace-table";
import styles from "./add-section-kanban.module.css";

const CATEGORIES = [
  { value: "CORE", label: "Core" },
  { value: "APPLIED", label: "Applied" },
  { value: "SPECIALIZED", label: "Specialized" },
] as const;

interface Props {
  subject: ScheduleSubject;
  onClose: () => void;
}

/**
 * Edit one catalog subject — same drawer anatomy as the subject creator.
 * Renaming leaves the minted code (and every linked timetable/gradebook row)
 * untouched; the grade level is fixed because the code belongs to it.
 */
export function SubjectEditKanban({ subject, onClose }: Props) {
  const invalidateSchedule = useAdminScheduleInvalidate();
  const [name, setName] = React.useState(subject.name);
  const [category, setCategory] = React.useState<string>(subject.category);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const trimmed = name.trim();
  const unchanged = trimmed === subject.name && category === subject.category;
  const canSubmit = trimmed.length > 0 && !unchanged && !saving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setFormError(null);
    try {
      await apiClient.patch(`/api/admin/schedule/subjects/${subject.id}`, {
        name: trimmed,
        category,
      });
      invalidateSchedule();
      toast.success({
        title: "Subject updated",
        description: `${trimmed} · ${gradeLabel(subject.gradeLevel)}`,
      });
      onClose();
    } catch (err) {
      const message = apiErrorMessage(err, "Failed to update subject.");
      setFormError(message);
      toast.error({ title: "Subject not updated", description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
          aria-hidden
        >
          <Pencil size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">Edit subject</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Rename it or change its category — the code and grade level stay put.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close edit subject"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <X size={15} aria-hidden />
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className={`${styles.body} flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4`}>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Grade level</span>
            <SelectionCard
              icon={<BookOpen size={15} aria-hidden />}
              title={gradeLabel(subject.gradeLevel)}
              description={`Code ${subject.code} — the code stays with this subject.`}
              selected
            />
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
            <label htmlFor="edit-subject-name" className="text-[12px] font-medium text-foreground">
              Subject name
            </label>
            <Input
              id="edit-subject-name"
              className="h-8 rounded-lg border-input bg-transparent px-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/25 dark:bg-transparent"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoFocus
              autoComplete="off"
            />
          </div>

          {formError ? (
            <p role="alert" className="text-[12px] leading-snug text-destructive">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-6 px-2.5 text-[12px]"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} className="h-6 gap-1.5 px-2.5 text-[12px]">
            <Save size={12} aria-hidden />
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
