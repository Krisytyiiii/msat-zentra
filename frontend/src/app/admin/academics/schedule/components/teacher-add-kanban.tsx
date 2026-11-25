"use client";

import { CalendarRange, CheckCircle2, Loader2, Plus, UserPlus, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectionCard } from "@/components/ui/selection-card";
import { ScrollList } from "@/components/ui/scroll-list";
import { useTerm } from "@/lib/term/TermContext";
import { useAddTeachers, type TeacherCreateProgress } from "./use-add-teachers";
import styles from "./add-section-kanban.module.css";

const MAX_ROWS = 10;

const TEACHER_CREATE_STEPS = ["Preparing names", "Saving to server", "Confirming catalog"];

interface Props {
  onClose: () => void;
  onProgress?: (p: TeacherCreateProgress | null) => void;
}

/**
 * Add teacher names in one pass. Laid out exactly like the subject creator
 * (`subject-add-kanban`): fixed school-year context, one name per row with a
 * Cancel link, and the summary note pinned above the footer.
 */
export function TeacherAddKanban({ onClose, onProgress }: Props) {
  const { rows, setRows, patchRow, filled, formError, handleCreate } =
    useAddTeachers(onClose, onProgress);
  const { schoolYears, activeTerm, activeSchoolYear } = useTerm();

  // Teacher names are created in the active school year — it is context, not a
  // choice, so the form only shows it (same as the subject creator).
  const yearId =
    activeTerm?.schoolYearId ?? activeSchoolYear?.id ?? schoolYears[0]?.id ?? "";
  const year = schoolYears.find((y) => y.id === yearId) ?? null;

  const addRow = () => setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, { fullName: "" }]));
  const removeRow = (index: number) =>
    setRows((prev) => (prev.length === 1 ? [{ fullName: "" }] : prev.filter((_, j) => j !== index)));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
          aria-hidden
        >
          <UserPlus size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight text-foreground">Add teachers</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Type each name once, then pick from the list. Just names — no accounts involved.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close add teachers"
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
                description="Teacher names are created in the active school year."
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
                description="Add and activate a school year before creating teacher names."
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-foreground">Teacher names</span>
              <Button
                type="button"
                variant="ghost"
                onClick={addRow}
                disabled={rows.length >= MAX_ROWS}
                aria-label="Add another teacher"
                title="Add another teacher"
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
                    placeholder={index === 0 ? "Full name" : "Another teacher name"}
                    value={row.fullName}
                    onChange={(e) => patchRow(index, { fullName: e.target.value })}
                    maxLength={120}
                    autoFocus={index === 0}
                    autoComplete="off"
                    aria-label={`Teacher ${index + 1} full name`}
                  />
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      aria-label={`Remove teacher row ${index + 1}`}
                      className="shrink-0 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground hover:underline hover:underline-offset-2"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => patchRow(index, { fullName: "" })}
                      disabled={row.fullName.trim() === ""}
                      aria-label={`Clear teacher name ${index + 1}`}
                      className="shrink-0 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground hover:underline hover:underline-offset-2 disabled:pointer-events-none disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <UserPlus size={13} aria-hidden className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Creates{" "}
              <span className="font-medium text-foreground">
                {filled.length || rows.length} teacher{(filled.length || rows.length) === 1 ? "" : "s"}
              </span>{" "}
              for <span className="font-medium text-foreground">{year ? year.name : "the active school year"}</span>.
              Every name is shared by all section timetables and pickable in a slot right away.
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
            disabled={filled.length === 0}
            className="h-6 gap-1.5 px-2.5 text-[12px]"
          >
            Create {filled.length > 1 ? `${filled.length} teachers` : "teacher"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function TeacherCreateDockRows({ rows }: { rows: TeacherCreateProgress["rows"] }) {
  return (
    <ScrollList as="ul" className="max-h-56 gap-1" ariaLabel="Teachers in this creation">
      {rows.map((r, i) => (
        <li key={`${r.name}-${i}`} className="flex min-w-0 items-center gap-2 rounded px-1 py-1">
          <span className="shrink-0" aria-hidden>
            {r.status === "created" ? (
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
            ) : r.status === "failed" ? (
              <XCircle size={15} className="text-destructive" />
            ) : (
              <Loader2 size={15} className="animate-spin text-muted-foreground" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-center text-xs font-medium" title={r.name}>
              {r.name}
            </span>
          </span>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {r.status === "created" ? "Added" : r.status === "failed" ? (r.message ?? "Failed") : "Creating…"}
          </span>
        </li>
      ))}
    </ScrollList>
  );
}

export { TEACHER_CREATE_STEPS };
