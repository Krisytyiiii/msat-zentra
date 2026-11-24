"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one in-page search field for every desk.
 *
 * Every list search (attendance, grading, anecdotal, referrals, SF10,
 * interventions, lock-grades, ADM cases, overview widgets, chat) renders this
 * so height, width, icon placement, focus ring, clear affordance and keyboard
 * behaviour are identical everywhere. The input is fully controlled and
 * updates on every keystroke, so the field itself never lags behind typing;
 * lists that search on the server can still debounce their query and pass
 * `loading` to keep the field honest while the request is in flight.
 *
 * The shell is hand-rolled instead of `InputGroup` on purpose: the group's
 * built-in focus treatment (`ring-3` in `--ring` gray) stacked a second gray
 * border on the field and read as a clipped/double edge, and the desk accent
 * is amber (`--amber-500`) everywhere, so focus here is one amber edge plus a
 * soft amber glow.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  className,
  inputClassName,
  autoFocus = false,
  disabled = false,
  loading = false,
  id,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  "aria-label": string;
  /** Wrapper width/placement. Defaults to the canonical 240px. */
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Shows a spinner while a debounced server query is running. */
  loading?: boolean;
  id?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && value !== "") {
      event.preventDefault();
      onChange("");
      return;
    }
    onKeyDown?.(event);
  };

  const hasValue = value !== "";

  return (
    <div
      data-slot="search-field"
      data-disabled={disabled ? "true" : undefined}
      className={cn(
        "flex h-8 w-60 max-w-full shrink-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 transition-[border-color,box-shadow] duration-150",
        "focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/25",
        "has-disabled:bg-input/40 has-disabled:opacity-60",
        className,
      )}
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed",
          inputClassName,
        )}
      />
      {loading && !hasValue ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : hasValue ? (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          disabled={disabled}
          onClick={() => onChange("")}
          className="grid size-5 shrink-0 place-items-center rounded-[calc(var(--radius)-6px)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:pointer-events-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * One wording for every "nothing matched" state in the teacher shell, so the
 * response to a search reads the same on every page:
 *   No students match “juan”. Try a different name or LRN.
 */
export function searchEmptyMessage(
  query: string,
  subject: string,
  hint = "Try a different name or LRN.",
): string {
  const trimmed = query.trim();
  return trimmed
    ? `No ${subject} match “${trimmed}”. ${hint}`
    : `No ${subject} match the current filters.`;
}
