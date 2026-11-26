"use client";

import * as React from "react";

export function KanbanBoardHeader({
  icon,
  title,
  count,
  actions,
  center,
  toolbar,
  toolbarAlign = "end",
  ariaLabel,
  divider = true,
  flush = false,
}: {
  icon?: React.ReactNode;
  /** Omit to render the filter/search row without a title segment. */
  title?: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  /** Slot centered in the title row (e.g. a status filter / view switcher). */
  center?: React.ReactNode;
  /** Wide controls (search + filters) that share the title row and wrap. */
  toolbar?: React.ReactNode;
  /** Horizontal alignment of the toolbar segment. Defaults to "end". */
  toolbarAlign?: "start" | "end";
  ariaLabel?: string;
  /** Draw the hairline under the header row. Defaults to true. */
  divider?: boolean;
  /** Flush header: no card padding to compensate for (used by `bare` boards). */
  flush?: boolean;
}) {
  return (
    <div
      className={
        flush
          ? `relative flex items-center gap-2 pb-2 ${divider ? "border-b border-border" : ""}`
          : `-mx-2.5 relative flex items-center gap-2 px-3.5 pb-2 ${
              divider ? "border-b border-border" : ""
            }`
      }
      aria-label={ariaLabel}
    >
      {title || icon ? (
        <span
          className={`inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-muted-foreground ${
            toolbar ? "shrink-0" : "flex-1"
          }`}
        >
          {icon}
          <span className="truncate">{title}</span>
        </span>
      ) : null}
      {toolbar ? (
        <div
          className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${
            toolbarAlign === "start" ? "justify-start" : "justify-end"
          }`}
        >
          {toolbar}
        </div>
      ) : center ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
          <div className="pointer-events-auto flex items-center">{center}</div>
        </div>
      ) : null}
      {/* Right side hugs its content — the title keeps every spare pixel
          (a flex-1 here split the row 50/50 and clipped long titles). */}
      <span className="flex shrink-0 items-center justify-end gap-2">
        {actions ?? null}
        {count !== undefined ? (
          <span className="text-xs font-semibold text-muted-foreground">{count}</span>
        ) : null}
      </span>
    </div>
  );
}

export function KanbanBoardEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-24 flex-1 items-center justify-center px-1 py-8 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

interface KanbanBoardProps {
  /** Omit to render only the filters/search row (no title segment). */
  title?: React.ReactNode;
  icon?: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  /** Centered in the title row — e.g. a status filter or view switcher. */
  headerCenter?: React.ReactNode;
  /** Search/filter strip that shares the title row (wraps when narrow). */
  headerToolbar?: React.ReactNode;
  /** Horizontal alignment of the header toolbar segment. Defaults to "end". */
  headerToolbarAlign?: "start" | "end";
  /** Draw the hairline under the header row. Defaults to true. */
  headerDivider?: boolean;
  description?: React.ReactNode;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Override for the section aria-label. Defaults to title when title is a string. */
  ariaLabel?: string;
  /** Override for the inner card aria-label. */
  boardLabel?: string;
  className?: string;
  /** Extra classes on the outer section (e.g. `flex-1` to fill the page). */
  sectionClassName?: string;
  /** Tint for the inner board (e.g. status-tinted reminder cards). */
  style?: React.CSSProperties;
  /** Render the title/count header row. Defaults to true. */
  showHeader?: boolean;
  /**
   * Drop the wrapper card: header, description, toolbar, list and footer sit
   * directly on the page canvas, so a data table/card grid is the only surface.
   */
  bare?: boolean;
}

export function KanbanBoard({
  title,
  icon,
  count,
  actions,
  headerCenter,
  headerToolbar,
  headerToolbarAlign,
  headerDivider = true,
  description,
  toolbar,
  footer,
  children,
  ariaLabel,
  boardLabel,
  className,
  sectionClassName,
  style,
  showHeader = true,
  bare = false,
}: KanbanBoardProps) {
  const sectionLabel = ariaLabel ?? (typeof title === "string" ? title : undefined);
  return (
    <section
      aria-label={sectionLabel}
      className={`flex min-w-0 flex-col gap-3 ${sectionClassName ?? ""}`}
    >
      <div
        className={
          bare
            ? `flex min-w-0 flex-col gap-3 ${className ?? ""}`
            : `board-surface flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-2.5 ${className ?? ""}`
        }
        aria-label={boardLabel}
        style={style}
      >
        {showHeader ? (
          <KanbanBoardHeader
            icon={icon}
            title={title}
            count={count}
            actions={actions}
            center={headerCenter}
            toolbar={headerToolbar}
            toolbarAlign={headerToolbarAlign}
            divider={headerDivider}
            flush={bare}
            ariaLabel={
              typeof title === "string" && count !== undefined
                ? `${title}, ${String(count)}`
                : undefined
            }
          />
        ) : null}
        {description ? (
          <div className="px-1 text-xs text-muted-foreground whitespace-normal break-words">
            {description}
          </div>
        ) : null}
        {toolbar ?? null}
        {children}
        {footer ?? null}
      </div>
    </section>
  );
}
