"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface SelectionCardProps {
  /** Leading glyph — the same icon the picker's rows use. */
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Trailing metadata before the circle (e.g. an "Active" chip). */
  meta?: React.ReactNode
  /** Paints the filled radio circle of a picked menu row. */
  selected?: boolean
  className?: string
}

/**
 * Read-only companion to `FilterMenuSelect`: the same icon + label + radio row,
 * rendered as a static card. Use it when a form field is fixed by context (the
 * active school year) instead of being a choice.
 */
export function SelectionCard({
  icon,
  title,
  description,
  meta,
  selected = false,
  className,
}: SelectionCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-2",
        className,
      )}
    >
      {icon ? (
        <span className="flex size-4 shrink-0 items-center justify-center text-foreground">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-[12px] leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {meta}
      {selected ? (
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center rounded-full border border-foreground"
        >
          <span className="size-1.5 rounded-full bg-foreground" />
        </span>
      ) : null}
    </div>
  )
}
