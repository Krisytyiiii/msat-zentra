"use client";

import Link from "next/link";
import { CalendarRange, ExternalLink, Layers, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Empty-state board for `/admin/academics/schedule` — the same 3-up kanban
 * "starter" shape the teacher referral desk uses before its first record, so
 * the desk still offers the real actions (open the template workspace, its
 * school-day config, or its section creator) instead of a bare callout. Every
 * card is a link that opens the workspace.
 */

function ColumnHead({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="-mx-2.5 flex items-center justify-between gap-2 border-b border-border px-3.5 pb-2"
      aria-label={title}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
        {icon} <span className="truncate">{title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">{action ?? null}</span>
    </div>
  );
}

function LinkCard({
  href,
  title,
  description,
  icon,
  newTab = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{
    size?: number | string;
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  newTab?: boolean;
}) {
  const Icon = icon;
  return (
    <Link
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      aria-label={`Open ${title}${newTab ? " (opens in a new tab)" : ""}`}
      className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 rounded-lg border bg-white p-3 shadow-sm transition-colors [font-family:var(--font-inter)] hover:border-primary/60 hover:shadow dark:bg-card"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-muted-foreground" title={href}>
          {href}
        </span>
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground"
          aria-hidden
        >
          <Icon size={13} />
        </span>
      </span>
      <span className="truncate text-sm font-semibold leading-snug" title={title}>
        {title}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{description}</span>
    </Link>
  );
}

export function ScheduleEmptyKanban() {
  return (
    <div
      className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3"
      role="group"
      aria-label="Schedule starter actions"
    >
      <div
        className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-2.5 [font-family:var(--font-inter)]"
        aria-label="Schedule template"
      >
        <ColumnHead
          icon={<CalendarRange size={14} aria-hidden className="text-amber-500" />}
          title="Schedule template"
          action={
            <Button asChild className="h-6 px-2 text-[12px]">
              <Link href="/admin/academics/schedule/template" target="_blank" rel="noopener noreferrer">
                Open
              </Link>
            </Button>
          }
        />
        <LinkCard
          href="/admin/academics/schedule/template"
          title="Open schedule template"
          description="Build and publish each section's weekly grid"
          icon={ExternalLink}
          newTab
        />
      </div>

      <div
        className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-2.5 [font-family:var(--font-inter)]"
        aria-label="School day"
      >
        <ColumnHead
          icon={<Settings2 size={14} aria-hidden className="text-sky-500" />}
          title="School day"
        />
        <LinkCard
          href="/admin/academics/schedule/template?view=config"
          title="Open school day"
          description="Set the bell schedule, lunch and breaks before placing subjects"
          icon={Settings2}
          newTab
        />
      </div>

      <div
        className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-2.5 [font-family:var(--font-inter)]"
        aria-label="Sections"
      >
        <ColumnHead icon={<Layers size={14} aria-hidden className="text-muted-foreground" />} title="Sections" />
        <LinkCard
          href="/admin/academics/schedule/template?view=add-section"
          title="Create the first section"
          description="Add its name and grade, then timetable it"
          icon={Layers}
          newTab
        />
      </div>
    </div>
  );
}
