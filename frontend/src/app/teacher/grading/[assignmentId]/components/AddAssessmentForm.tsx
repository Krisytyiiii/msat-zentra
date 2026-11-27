"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { SelectionCard } from "@/components/ui/selection-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { COMPONENT_LABELS } from "@/services/teacher/grading.compute";
import type { ComponentType } from "@/services/teacher/grading.types";
import { cn } from "@/lib/utils";
import { CategoryTabs } from "./CategoryTabs";
import { AudienceTabs } from "./AudienceTabs";
import { useAddAssessmentSave } from "./add-assessment-save-context";

/** Same ceiling the grading schema enforces on POST/PATCH. */
export const MAX_SCORE_LIMIT = 100000;

/** Digits plus a single decimal point — the same input the score cells use. */
function sanitizeMaxScore(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  const digits = (whole ?? "").slice(0, 6);
  return rest.length > 0 ? `${digits}.${rest.join("")}` : digits;
}

/** Admin drawer field shell — same label, input and focus styles as the
 *  schedule drawers (New sections / Edit subject). */
const fieldLabel = "text-[12px] font-medium text-foreground";
const fieldInput =
  "h-8 rounded-lg border-input bg-transparent px-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/25 dark:bg-transparent";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDayKey(dayKey: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return undefined;
  const day = new Date(`${dayKey}T00:00:00`);
  return Number.isNaN(day.getTime()) ? undefined : day;
}

/** "G7" → "Grade 7"; leaves already-spelled labels alone. */
function gradeLabel(grade: string): string {
  return /^G\d/i.test(grade) ? `Grade ${grade.slice(1)}` : grade;
}

type Props = {
  assignmentId: string;
  defaultType?: ComponentType;
  onSaved: () => void;
  /** `drawer` renders the full admin-drawer card (header, body, footer);
   *  `inline` is the compact form inside the rail tool panel. */
  variant?: "inline" | "drawer";
  onCancel?: () => void;
  /** Class context shown as the fixed selection card in the drawer. */
  sectionName?: string;
  gradeLevel?: string;
};

/**
 * Add-assessment form. The drawer variant mirrors the administrator's
 * schedule drawers (icon header + scrolling body + bordered footer); the
 * inline variant drops the chrome and lives inside the rail tool card. The
 * save itself runs in the root-level provider, so the dock keeps working
 * across navigation.
 */
export function AddAssessmentForm({
  assignmentId,
  defaultType = "WRITTEN_WORK",
  onSaved,
  variant = "inline",
  onCancel,
  sectionName,
  gradeLevel,
}: Props) {
  const { saveAssessment } = useAddAssessmentSave();
  const [componentType, setComponentType] =
    React.useState<ComponentType>(defaultType);
  const [audience, setAudience] = React.useState<"regular" | "adm">("regular");
  const [title, setTitle] = React.useState("");
  const [max, setMax] = React.useState("100");
  const [date, setDate] = React.useState(todayKey());
  const [dateOpen, setDateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedDate = parseDayKey(date);
  const maxNumber = Number(max);
  const maxInvalid =
    max.trim() !== "" &&
    (!Number.isFinite(maxNumber) || maxNumber <= 0 || maxNumber > MAX_SCORE_LIMIT);
  const maxReady = max.trim() !== "" && !maxInvalid;

  const handleSave = async () => {
    if (saving) return;
    const maxScore = Number(max);
    if (!title.trim()) {
      setError("Assessment title is required.");
      return;
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      setError("Max score must be greater than 0.");
      return;
    }
    if (maxScore > MAX_SCORE_LIMIT) {
      setError(`Max score must be ${MAX_SCORE_LIMIT} or less.`);
      return;
    }
    setError(null);
    setSaving(true);
    const trimmedTitle = title.trim();
    const pills = [
      COMPONENT_LABELS[componentType],
      audience === "adm" ? "ADM" : "Regular",
      `${maxScore} max`,
      selectedDate ? format(selectedDate, "MM/dd/yyyy") : "No date",
    ];
    // The dock opens this tick inside the provider and keeps running even
    // if the user navigates away mid-flight.
    const pending = saveAssessment(assignmentId, {
      componentType,
      title: trimmedTitle,
      maxScore,
      dateGiven: date
        ? new Date(`${date}T00:00:00Z`).toISOString()
        : undefined,
      audience,
      pills,
    });
    // Drawer form: the dock owns the save from here, so the sheet slides out
    // the moment the teacher confirms instead of waiting behind the request.
    if (variant === "drawer") onCancel?.();
    const result = await pending;
    setSaving(false);
    if (result.ok) {
      setTitle("");
      onSaved();
    } else {
      setError(result.message);
    }
  };

  const submitLabel = saving ? (
    <>
      <Loader2 className="animate-spin" aria-hidden size={14} />
      Adding…
    </>
  ) : (
    "Add assessment"
  );

  const fields = (
    <>
      <div className="flex flex-col gap-1.5">
        <Label className={fieldLabel} htmlFor="gutter-add-assessment-title">
          Title
        </Label>
        <Input
          id="gutter-add-assessment-title"
          className={fieldInput}
          value={title}
          placeholder="e.g. Quiz 1 — Fractions"
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          autoFocus={variant === "drawer"}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabel}>Category</span>
          <CategoryTabs
            value={componentType}
            onChange={setComponentType}
            className="self-start"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabel}>Grade input</span>
          <AudienceTabs
            value={audience}
            onChange={setAudience}
          />
        </div>
      </div>

      <p className="text-[12px] leading-snug text-muted-foreground">
        Regular counts toward regular learners; ADM counts toward signed ADM
        learners.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className={fieldLabel} htmlFor="gutter-add-assessment-max">
            Max score
          </Label>
          <Input
            id="gutter-add-assessment-max"
            className={fieldInput}
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(sanitizeMaxScore(e.target.value))}
            disabled={saving}
            aria-invalid={maxInvalid || undefined}
            aria-describedby="gutter-add-assessment-max-hint"
          />
          <p
            id="gutter-add-assessment-max-hint"
            className={cn(
              "text-[12px] leading-snug",
              maxInvalid ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {maxInvalid
              ? `Enter a number from 1 to ${MAX_SCORE_LIMIT}.`
              : `Whole or decimal points, up to ${MAX_SCORE_LIMIT}.`}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className={fieldLabel} htmlFor="gutter-add-assessment-date">
            Date given
          </Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                id="gutter-add-assessment-date"
                type="button"
                variant="outline"
                disabled={saving}
                className={cn(
                  fieldInput,
                  "min-w-0 justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon
                  size={14}
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">
                  {selectedDate
                    ? format(selectedDate, "MM/dd/yyyy")
                    : "Pick a date"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                defaultMonth={selectedDate ?? new Date()}
                onSelect={(day) => {
                  if (!day) return;
                  setDate(format(day, "yyyy-MM-dd"));
                  setDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[12px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );

  if (variant === "drawer") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
            aria-hidden
          >
            <Plus size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm leading-tight font-semibold text-foreground">
              Add assessment
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              New quiz, activity, or exam for this class.
            </p>
          </div>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close add assessment"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
          ) : null}
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
            {sectionName ? (
              <div className="flex flex-col gap-1.5">
                <span className={fieldLabel}>Class</span>
                <SelectionCard
                  icon={<Users size={15} aria-hidden />}
                  title={`${sectionName}${
                    gradeLevel ? ` · ${gradeLabel(gradeLevel)}` : ""
                  }`}
                  description="This assessment is created for this class only."
                  selected
                />
              </div>
            ) : null}
            {fields}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="secondary"
              className="h-6 px-2.5 text-[12px]"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !maxReady}
              aria-busy={saving || undefined}
              className="h-6 gap-1.5 px-2.5 text-[12px]"
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 px-1 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
    >
      {fields}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 pb-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill tone="amber" label="Category">
            {COMPONENT_LABELS[componentType]}
          </Pill>
          <Pill tone={audience === "adm" ? "amber" : "neutral"} label="Assessment type">
            {audience === "adm" ? "ADM" : "Regular"}
          </Pill>
          <Pill tone="neutral" label="Max score">
            {max.trim() === "" ? "—" : max} max
          </Pill>
          <Pill tone="neutral" label="Date given">
            {selectedDate ? format(selectedDate, "MM/dd/yyyy") : "No date"}
          </Pill>
        </span>
        <Button
          type="submit"
          size="sm"
          className="h-6 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          disabled={saving}
          aria-busy={saving || undefined}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
