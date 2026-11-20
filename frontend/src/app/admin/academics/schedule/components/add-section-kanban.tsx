"use client";

import * as React from "react";
import { CalendarRange, Layers, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { DropdownSelect } from "@/app/principal/academics/assign/components/DropdownSelect";
import { useDock } from "@/components/dock/dock-store";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/errors";
import { toast } from "@/components/ui/sonner";
import { useTerm } from "@/lib/term/TermContext";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";
import styles from "./add-section-kanban.module.css";

const GRADE_LEVELS = ["G7", "G8", "G9", "G10", "G11", "G12"] as const;
type GradeLevel = (typeof GRADE_LEVELS)[number];

/** One name row per section; a single submit creates them all. */
const MAX_SECTION_ROWS = 12;

/** Optimistic rows carry this id prefix until the server list replaces them. */
export const PENDING_SECTION_PREFIX = "pending-section-";

export interface CreatedSection {
  id: string;
  name: string;
  gradeLevel: string;
  /** The year it was created in — the desk only paints same-scope rows. */
  schoolYearId?: string;
  /** True for the instant-paint row that is still being saved. */
  pending?: boolean;
}

interface CreatedSectionResponse {
  id: string;
  name: string;
  gradeLevel: string;
  schoolYearId?: string;
}

function gradeLabel(grade: string): string {
  return `Grade ${grade.replace("G", "")}`;
}

/**
 * Section creation lives in the schedule template workspace (not the desk
 * index) — a new section is only useful once its weekly timetable can be built.
 * The flow is deliberate: pick the school year, pick the grade level from the
 * tab filter, then type as many section names as that grade needs in one pass.
 *
 * Confirming closes at once: the board paints the new rows optimistically and
 * the shared Dock reports the save, so nothing waits on the network.
 */
export function AddSectionKanban({
  onSubmitted,
  onRejected,
  onCancel,
}: {
  /** Fired at confirm time with the optimistic rows, before any request runs. */
  onSubmitted?: (sections: CreatedSection[]) => void;
  /** Fired after the save settles, with the optimistic ids that failed. */
  onRejected?: (pendingIds: string[]) => void;
  onCancel?: () => void;
}) {
  const invalidateSchedule = useAdminScheduleInvalidate();
  const dock = useDock();
  const { schoolYears, activeTerm, activeSchoolYear } = useTerm();

  const defaultYearId =
    activeTerm?.schoolYearId ?? activeSchoolYear?.id ?? schoolYears[0]?.id ?? "";
  const [yearId, setYearId] = React.useState(defaultYearId);
  const [gradeLevel, setGradeLevel] = React.useState<GradeLevel>("G7");
  const [names, setNames] = React.useState<string[]>([""]);

  // The year list lands after the dialog opens on a cold page — settle onto the
  // steered (or active) year once it is known.
  /* eslint-disable react-hooks/set-state-in-effect -- settle the default year */
  React.useEffect(() => {
    if (!yearId && defaultYearId) setYearId(defaultYearId);
  }, [yearId, defaultYearId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setRow = (index: number, value: string) =>
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  const addRow = () => setNames((prev) => (prev.length >= MAX_SECTION_ROWS ? prev : [...prev, ""]));
  const removeRow = (index: number) =>
    setNames((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));

  const filled = React.useMemo(() => names.map((n) => n.trim()).filter(Boolean), [names]);
  const duplicateName = React.useMemo(() => {
    const seen = new Set<string>();
    for (const name of filled) {
      const key = name.toLowerCase();
      if (seen.has(key)) return name;
      seen.add(key);
    }
    return null;
  }, [filled]);

  const year = schoolYears.find((y) => y.id === yearId) ?? null;
  const canSubmit = yearId !== "" && filled.length > 0 && duplicateName === null;

  /**
   * Confirm = paint + close, then save in the background. The Dock carries the
   * progress; failures are reported there and in a toast, and the board drops
   * the optimistic rows when the schedule query revalidates.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const toCreate = filled;
    const total = toCreate.length;
    const stamp = Date.now();
    const optimistic: CreatedSection[] = toCreate.map((name, index) => ({
      id: `${PENDING_SECTION_PREFIX}${stamp}-${index}`,
      name,
      gradeLevel,
      schoolYearId: yearId,
      pending: true,
    }));

    // Instant paint + auto-close, before the first request goes out.
    onSubmitted?.(optimistic);
    setNames([""]);

    const taskId = dock.startTask({
      kind: "generic",
      title:
        total === 1 ? `Creating ${toCreate[0]}…` : `Creating ${total} sections…`,
      description: `${gradeLabel(gradeLevel)} · ${year?.name ?? "school year"}`,
      total,
    });

    // Keep the dock alive after this dialog unmounts: the loop owns the task.
    void (async () => {
      const created: CreatedSectionResponse[] = [];
      const failed: string[] = [];
      const failedIds: string[] = [];
      let settled = 0;
      for (const [index, name] of toCreate.entries()) {
        try {
          const { data } = await apiClient.post<CreatedSectionResponse>(
            "/api/admin/schedule/sections",
            {
              name,
              gradeLevel,
              schoolYearId: yearId,
              // The term only tags the audit trail; it must belong to the year.
              ...(activeTerm?.schoolYearId === yearId && activeTerm?.termId
                ? { termId: activeTerm.termId }
                : {}),
            },
          );
          created.push(data);
        } catch (err) {
          failed.push(`${name} — ${apiErrorMessage(err, "not created")}`);
          const pendingRow = optimistic[index];
          if (pendingRow) failedIds.push(pendingRow.id);
        }
        settled += 1;
        dock.updateTask(taskId, {
          progress: { done: settled, total },
          description: `${settled}/${total} saved · ${gradeLabel(gradeLevel)} · ${
            year?.name ?? "school year"
          }`,
        });
      }

      if (created.length > 0) invalidateSchedule();

      if (failed.length > 0) {
        const message = failed.join(" · ");
        dock.failTask(taskId, message);
        onRejected?.(failedIds);
        toast.error({
          title:
            failed.length === 1
              ? "One section was not created"
              : `${failed.length} sections were not created`,
          description: message,
        });
        return;
      }

      dock.completeTask(
        taskId,
        `${total} section${total === 1 ? "" : "s"} · ${gradeLabel(gradeLevel)} · ${
          year?.name ?? "school year"
        }`,
      );
      toast.success({
        title: total === 1 ? "Section created" : `${total} sections created`,
        description: `${gradeLabel(gradeLevel)} · ${year?.name ?? "school year"}`,
      });
    })();
  };

  const yearOptions = schoolYears.map((y) => ({
    value: y.id,
    label: (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{y.name}</span>
        {y.isActive ? (
          <span className="shrink-0 rounded bg-green-500/10 px-1 text-[12px] font-medium text-green-700 dark:text-green-400">
            Active
          </span>
        ) : null}
      </span>
    ),
  }));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <header className="flex items-start gap-2.5 border-b border-border px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
          aria-hidden
        >
          <Layers size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">New sections</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Pick the school year, then a grade level, then add as many section names as you need.
          </p>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close new sections"
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
      </header>

      <form onSubmit={handleSubmit}>
        <div className={`${styles.body} flex max-h-[60dvh] flex-col gap-4 overflow-y-auto px-4 py-4`}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-section-year" className="text-[12px] font-medium text-foreground">
              School year
            </label>
            <DropdownSelect
              id="new-section-year"
              value={yearId}
              onValueChange={setYearId}
              options={yearOptions}
              placeholder={schoolYears.length === 0 ? "No school year yet" : "Pick a school year…"}
              ariaLabel="School year for the new sections"
              disabled={schoolYears.length === 0}
            />
            <p className="text-[12px] leading-snug text-muted-foreground">
              Sections belong to the school year — choose the year they should live in first.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Grade level</span>
            <FilterTabs
              label="Grade level"
              options={GRADE_LEVELS.map((g) => ({ value: g, label: g }))}
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
            <span className="text-[12px] font-medium text-foreground">Section names</span>
            <div className="flex flex-col gap-1.5">
              {names.map((value, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <Input
                    className="h-8 text-[13px]"
                    placeholder={index === 0 ? "e.g. Rizal" : "Another section name"}
                    value={value}
                    onChange={(e) => setRow(index, e.target.value)}
                    maxLength={80}
                    autoFocus={index === 0}
                    autoComplete="off"
                    aria-label={`Section name ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeRow(index)}
                    disabled={names.length === 1}
                    aria-label={`Remove section name ${index + 1}`}
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
                onClick={addRow}
                disabled={names.length >= MAX_SECTION_ROWS}
                className="h-6 gap-1 px-2 text-[12px]"
              >
                <Plus size={12} aria-hidden />
                Add another section
              </Button>
              <span className="text-[12px] text-muted-foreground">
                {filled.length} to create
              </span>
            </div>
            <p className="text-[12px] leading-snug text-muted-foreground">
              Two grades can both have a Rizal — the grade level keeps them apart. Each section gets
              its own advisory code you can hand to its adviser.
            </p>
            {duplicateName ? (
              <p role="alert" className="text-[12px] text-destructive">
                &ldquo;{duplicateName}&rdquo; appears twice — each section name must be different.
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <CalendarRange size={13} aria-hidden className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {year ? (
                <>
                  Creates{" "}
                  <span className="font-medium text-foreground">
                    {filled.length || names.length} section
                    {(filled.length || names.length) === 1 ? "" : "s"}
                  </span>{" "}
                  in <span className="font-medium text-foreground">{year.name}</span> ·{" "}
                  {gradeLabel(gradeLevel)}. Each one arrives with an advisory code for its adviser;
                  its weekly timetable is built per term after it exists.
                </>
              ) : (
                <>Add a school year first — sections cannot be created without one.</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-6 gap-1.5 px-2.5 text-[12px]"
          >
            {filled.length > 1 ? `Create ${filled.length} sections` : "Create section"}
          </Button>
        </div>
      </form>
    </div>
  );
}
