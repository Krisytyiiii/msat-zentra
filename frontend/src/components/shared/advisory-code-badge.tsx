"use client";

import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Advisory-code badge — the white chip the section boards show next to a
 * section's adviser status, with its copy control built in. One look on every
 * page that hands the code to an adviser (sections board, schedule overview),
 * so the same value never renders as a different object.
 */
export function AdvisoryCodeBadge({
  code,
  copied = false,
  onCopy,
  ariaLabel,
  className,
}: {
  code: string;
  /** Swaps the copy glyph for a check after a successful copy. */
  copied?: boolean;
  onCopy: () => void;
  /** Spoken name for the copy control, e.g. "Copy advisory code for Rizal". */
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <span
      title="Advisory code"
      className={cn(
        "inline-flex h-[1.125rem] max-w-full flex-none items-center gap-0.5 overflow-hidden rounded-[0.3125rem] border border-border bg-white pr-0.5 pl-1.5 text-[12px] leading-none font-semibold tracking-[0.05em] whitespace-nowrap text-[#111827]",
        className,
      )}
    >
      <span className="truncate">{code}</span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={ariaLabel ?? `Copy advisory code ${code}`}
        title="Copy advisory code"
        className="grid size-4 flex-none place-items-center rounded text-[#6b7280] transition-colors duration-150 hover:bg-black/10 hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1"
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      </button>
    </span>
  );
}
