"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type PillTone =
  | "neutral"
  | "amber"
  | "red"
  | "green"
  | "blue"
  | "violet"
  | "teal"
  | "indigo"
  | "rose"
  | "sky";

const TONES: Record<PillTone, string> = {
  /* Plain grey chip — identity values such as section name. */
  neutral: "border-border text-foreground",
  amber: "border-amber-500/45 text-amber-700 dark:text-amber-300",
  red: "border-red-500/45 text-red-700 dark:text-red-300",
  green: "border-green-500/45 text-green-700 dark:text-green-300",
  blue: "border-blue-500/45 text-blue-700 dark:text-blue-300",
  violet: "border-violet-500/45 text-violet-700 dark:text-violet-300",
  teal: "border-teal-500/45 text-teal-700 dark:text-teal-300",
  indigo: "border-indigo-500/45 text-indigo-700 dark:text-indigo-300",
  rose: "border-rose-500/45 text-rose-700 dark:text-rose-300",
  sky: "border-sky-500/45 text-sky-700 dark:text-sky-300",
};

/**
 * One colour per identity field, system-wide: LRN amber, grade level blue,
 * section green. Applied from the pill's `label`/`aria-label` **and** from the
 * pill text itself, so every desk renders the same field the same colour
 * without a per-call `tone` (an explicit `tone` can never override an identity
 * field).
 */
const IDENTITY_TONE: Record<IdentityField, PillTone> = {
  lrn: "amber",
  grade: "blue",
  section: "green",
};

export type IdentityField = "lrn" | "grade" | "section";

/** Field names used in tooltips/aria labels across the desks. */
function fieldFromLabel(text: string | undefined): IdentityField | undefined {
  const key = (text ?? "").trim().toLowerCase();
  if (!key) return undefined;
  if (/^lrn\b/.test(key)) return "lrn";
  // Exact "Grade" / "Grade level" only — "Grade 7-NEWTON" is a section value
  // and must fall through to `fieldFromValue`.
  if (key === "grade" || /^grade\s*level\b/.test(key)) return "grade";
  if (/^section\b/.test(key)) return "section";
  return undefined;
}

/**
 * Identity values that carry the field on their own (pills whose tooltip is
 * the value, or that render no label at all): a 12-digit LRN, "Grade 7",
 * "Grade 7-NEWTON", "G7", "Section Rizal".
 */
function fieldFromValue(text: string | undefined): IdentityField | undefined {
  const value = (text ?? "").trim();
  if (!value) return undefined;
  if (/^\d{12}$/.test(value)) return "lrn";
  if (/^section\b/i.test(value)) return "section";
  if (/^grade\s*\d{1,2}\s*[-–]\s*\S/i.test(value)) return "section";
  if (/^grade\s*\d{1,2}$/i.test(value) || /^g\d{1,2}$/i.test(value)) return "grade";
  return undefined;
}

function identityTone(
  field: IdentityField | undefined,
  label: string | undefined,
  ariaLabel: string | undefined,
  text: string | undefined,
): PillTone | undefined {
  const resolved =
    field ??
    fieldFromLabel(label) ??
    fieldFromLabel(ariaLabel) ??
    fieldFromValue(label) ??
    fieldFromValue(ariaLabel) ??
    fieldFromValue(text);
  return resolved ? IDENTITY_TONE[resolved] : undefined;
}

/** Text content of a pill when it is a plain string (used for identity tones). */
function plainText(node: React.ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    const parts = node.map(plainText).filter((p): p is string => !!p);
    return parts.length ? parts.join(" ") : undefined;
  }
  return undefined;
}

const IDENTITY_TOOLTIP: Record<IdentityField, string> = {
  lrn: "LRN",
  grade: "Grade level",
  section: "Section",
};

/**
 * Shared rectangle pill used for compact metadata (LRN, section, risk level,
 * session kind, …). One shape + one palette everywhere so desk cards, dialogs
 * and boards read the same; `tone` only changes the colour family.
 *
 * Pass `label` to get the standard hover/focus tooltip that names the field
 * (label only — the value is already on the pill). Identity pills always get
 * one: `field` without `label` falls back to the field name.
 */
export function Pill({
  tone = "neutral",
  className,
  title,
  label,
  field,
  children,
  ...rest
}: {
  tone?: PillTone;
  className?: string;
  title?: string;
  /** Field name shown in the pill's tooltip (e.g. "LRN", "Section"). */
  label?: string;
  /**
   * Forces the shared identity colour (LRN amber, grade level blue, section
   * green) when the field cannot be read from `label`/the text — e.g. a
   * section pill whose tooltip carries something else.
   */
  field?: IdentityField;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "title" | "className" | "children">) {
  const ariaLabel =
    typeof rest["aria-label"] === "string" ? rest["aria-label"] : undefined;
  const resolvedTone =
    identityTone(field, label, ariaLabel, plainText(children)) ?? tone;
  // Every identity pill carries a tooltip naming its field, even when the call
  // site only passed `field` (e.g. the grade/section chips on desk cards).
  const tooltipLabel = label ?? (field ? IDENTITY_TOOLTIP[field] : undefined);
  const pill = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border bg-transparent px-2 py-0.5 text-[12px] font-semibold",
        TONES[resolvedTone],
        className
      )}
      title={title}
      aria-label={tooltipLabel}
      {...rest}
    >
      {children}
    </span>
  );

  if (!tooltipLabel) return pill;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <span className="font-medium">{tooltipLabel}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
