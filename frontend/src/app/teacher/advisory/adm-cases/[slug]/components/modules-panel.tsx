"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill, type PillTone } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { AdmMonitoredModule } from "@/services/teacher/admMonitoring.service";

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const STATUS: Record<
  AdmMonitoredModule["status"],
  { label: string; tone: PillTone; icon: typeof CheckCircle2; tile: string; toneText: string }
> = {
  submitted: {
    label: "Submitted",
    tone: "green",
    icon: CheckCircle2,
    tile: "bg-emerald-500/10",
    toneText: "text-emerald-600 dark:text-emerald-400",
  },
  pending: {
    label: "Pending",
    tone: "amber",
    icon: Clock3,
    tile: "bg-amber-500/10",
    toneText: "text-amber-600 dark:text-amber-400",
  },
  overdue: {
    label: "Overdue",
    tone: "red",
    icon: TriangleAlert,
    tile: "bg-red-500/10",
    toneText: "text-red-600 dark:text-red-400",
  },
};

const FILTER_LABELS = {
  all: "All",
  submitted: "Submitted",
  pending: "Pending",
  overdue: "Overdue",
} as const;

type Filter = keyof typeof FILTER_LABELS;

function ModuleCard({
  module,
  onEdit,
}: {
  module: AdmMonitoredModule;
  onEdit?: (module: AdmMonitoredModule) => void;
}) {
  const status = STATUS[module.status];
  const StatusIcon = status.icon;
  const editable = module.source === "case";

  return (
    <article className="flex flex-col gap-3 rounded-md border bg-background p-3 transition-colors duration-150 hover:border-foreground/20 sm:flex-row sm:items-start">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          status.tile
        )}
        aria-hidden
      >
        <StatusIcon size={16} className={status.toneText} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className="m-0 min-w-0 max-w-full truncate text-sm font-semibold text-foreground"
            title={module.moduleName}
          >
            {module.moduleName}
          </p>
          <Pill tone={status.tone} label="Module status">
            {status.label}
          </Pill>
          <Pill
            tone={module.source === "section" ? "violet" : "neutral"}
            label="Module source"
          >
            {module.source === "section" ? "Section ADM" : "This case"}
          </Pill>
        </div>

        <dl className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <dt className="m-0">Released</dt>
            <dd className="m-0 font-medium text-foreground">{dateLabel(module.releaseDate)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="m-0">Due</dt>
            <dd
              className={cn(
                "m-0 font-medium",
                module.status === "overdue" ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}
            >
              {dateLabel(module.dueDate)}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <dt className="m-0">Submitted</dt>
            <dd className="m-0 font-medium text-foreground">
              {module.submitted ? dateLabel(module.submissionDate) : "—"}
            </dd>
          </div>
        </dl>

        {module.submissionUrl || module.fileUrl || module.studentSubmissionUrl ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {module.submissionUrl ? (
              <a
                href={module.submissionUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                title={module.submissionUrl}
              >
                <ExternalLink size={12} aria-hidden /> Open module
              </a>
            ) : null}
            {module.studentSubmissionUrl &&
            module.studentSubmissionUrl !== module.submissionUrl ? (
              <a
                href={module.studentSubmissionUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                title={module.studentSubmissionUrl}
              >
                <ExternalLink size={12} aria-hidden /> Answered link
              </a>
            ) : null}
            {module.fileUrl ? (
              <a
                href={module.fileUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                title={module.fileUrl}
              >
                <FileText size={12} aria-hidden /> {module.fileName ?? "Answered file"}
              </a>
            ) : null}
          </div>
        ) : null}

        {module.remarks ? (
          <p className="m-0 rounded-md bg-muted/60 px-2 py-1 text-[12px] text-muted-foreground">
            {module.remarks}
          </p>
        ) : null}
      </div>

      {onEdit ? (
        editable ? (
          <Button
            type="button"
            variant="outline"
            className="h-7 w-full shrink-0 px-2.5 text-[12px] sm:w-auto"
            onClick={() => onEdit(module)}
            aria-label={`Update ${module.moduleName}`}
          >
            <Pencil size={11} aria-hidden />
            {module.submitted ? "Update" : module.submissionUrl ? "Record submission" : "Add link"}
          </Button>
        ) : (
          <Link
            href="/teacher/advisory/modules"
            className="inline-flex h-7 w-full shrink-0 items-center justify-center rounded-md border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground sm:w-auto"
            title="This module is released for the whole section — edit it on the Modules desk"
          >
            Modules desk
          </Link>
        )
      ) : null}
    </article>
  );
}

export function ModulesPanel({
  modules,
  onEdit,
}: {
  modules: AdmMonitoredModule[];
  /** Omit for read-only desks (the coordinator) — hides the edit affordances. */
  onEdit?: (module: AdmMonitoredModule) => void;
}) {
  const submitted = modules.filter((m) => m.submitted).length;
  const [filter, setFilter] = React.useState<Filter>("all");

  const counts: Record<Filter, number> = {
    all: modules.length,
    submitted,
    pending: modules.filter((m) => m.status === "pending").length,
    overdue: modules.filter((m) => m.status === "overdue").length,
  };
  const visible =
    filter === "all"
      ? modules
      : filter === "submitted"
        ? modules.filter((m) => m.submitted)
        : modules.filter((m) => m.status === filter);

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-4"
      aria-label="Modules and submissions"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-sm font-bold tracking-[-0.01em] text-foreground">
            Modules &amp; submissions
          </h2>
          <p className="m-0 max-w-xl text-[12px] text-muted-foreground">
            Post each module link, then record the submission once the learner hands in the
            answered work.
          </p>
        </div>

        {modules.length > 0 ? (
          <FilterTabs
            label="Filter modules by status"
            variant="tags"
            className="justify-self-end"
            options={(Object.keys(counts) as Filter[]).map((key) => ({
              value: key,
              label: FILTER_LABELS[key],
              count: counts[key],
              tone:
                key === "submitted"
                  ? "green"
                  : key === "pending"
                    ? "amber"
                    : key === "overdue"
                      ? "red"
                      : "neutral",
            }))}
            value={filter}
            onChange={setFilter}
          />
        ) : null}
      </header>

      {modules.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
          <p className="m-0 text-sm font-semibold text-foreground">No modules released yet</p>
          <p className="m-0 max-w-sm text-xs text-muted-foreground">
            Post an ADM module from the advisory Modules desk and its submissions will show up
            here automatically.
          </p>
          <Button asChild variant="outline" className="mt-1 h-7 px-2.5 text-xs">
            <Link href="/teacher/advisory/modules">Open Modules desk</Link>
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
          No {FILTER_LABELS[filter].toLowerCase()} modules.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((m) => (
            <ModuleCard key={m.id} module={m} onEdit={onEdit} />
          ))}
        </div>
      )}
    </section>
  );
}
