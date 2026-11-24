"use client";

import * as React from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Megaphone,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill, type PillTone } from "@/components/ui/pill";
import {
  isUploadedModuleFile,
  moduleFileName,
  type AdvisoryModuleRow,
  type AdvisoryModuleStatus,
} from "@/services/teacher/advisoryModules.service";

const STATUS: Record<
  AdvisoryModuleStatus,
  { label: string; tone: PillTone; Icon: typeof CheckCircle2 }
> = {
  submitted: { label: "Submitted", tone: "green", Icon: CheckCircle2 },
  pending: { label: "Pending", tone: "amber", Icon: Clock3 },
  overdue: { label: "Overdue", tone: "red", Icon: TriangleAlert },
  posted: { label: "Posted", tone: "blue", Icon: Megaphone },
};

const KIND_COLOR: Record<AdvisoryModuleRow["kind"], string> = {
  adm: "#8b5cf6",
  general: "#3b82f6",
};

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Bordered metric tile used across the details sheet. */
function StatTile({
  icon,
  label,
  value,
  caption,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  caption?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-background/60 p-2.5">
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </span>
      <span className="truncate text-[13px] font-semibold text-foreground">{value}</span>
      {caption ? <span className="text-[12px] text-muted-foreground">{caption}</span> : null}
      {children}
    </div>
  );
}

/** Bordered detail row (label left, value right). */
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[12px] font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-[12px] font-semibold text-foreground">{children}</span>
    </div>
  );
}

export function ModuleDetailsOverlay({
  module,
  onClose,
  onEdit,
  onViewSubmissions,
}: {
  module: AdvisoryModuleRow | null;
  onClose: () => void;
  onEdit: (module: AdvisoryModuleRow) => void;
  onViewSubmissions: (module: AdvisoryModuleRow) => void;
}) {
  const status = module ? STATUS[module.status] : null;
  const StatusIcon = status?.Icon;
  const tracked = module?.kind === "adm";
  const total = module?.totalLearners ?? 0;
  const submitted = module?.submittedCount ?? 0;
  const pct = tracked && total > 0 ? Math.round((submitted / total) * 100) : 0;
  const accent = module ? KIND_COLOR[module.kind] : undefined;

  return (
    <KanbanOverlay
      open={!!module}
      onClose={onClose}
      title="Module details"
      ariaLabel={module ? `Module details for ${module.moduleName}` : "Module details"}
      icon={<FileText size={16} aria-hidden />}
      headerActions={
        status ? (
          <Pill tone={status.tone} label="Module status">
            {StatusIcon ? <StatusIcon size={11} aria-hidden /> : null} {status.label}
          </Pill>
        ) : undefined
      }
      width="xl"
      footer={
        module ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2 px-0.5 pb-0.5">
            <Button
              type="button"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              onClick={() => onEdit(module)}
            >
              Edit module
            </Button>
            {tracked ? (
              <Button
                type="button"
                className="h-7 px-2.5 text-xs"
                onClick={() => onViewSubmissions(module)}
              >
                View submissions
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {module && status ? (
        <div className="flex min-w-0 flex-col gap-3">
          {/* Hero: identity + the two things a teacher scans first. */}
          <div className="flex min-w-0 items-start gap-3 rounded-md border bg-background/60 p-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
              style={{ backgroundColor: accent }}
              aria-hidden
            >
              <FileText size={18} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h3 className="m-0 min-w-0 break-words text-sm font-semibold text-foreground">
                  {module.moduleName}
                </h3>
                <Pill tone={module.kind === "adm" ? "violet" : "neutral"} label="Module type">
                  {module.kind === "adm" ? "ADM" : "General"}
                </Pill>
              </div>
              <p className="m-0 text-[12px] text-muted-foreground">
                Released {dateLabel(module.releaseDate)} · Due {dateLabel(module.dueDate)}
              </p>
            </div>
          </div>

          {/* Metrics: submissions, progress, deadline. */}
          <div className="grid gap-2 sm:grid-cols-3">
            <StatTile
              icon={<Users size={11} aria-hidden />}
              label="Submissions"
              value={tracked ? `${submitted}/${total}` : "Not tracked"}
              caption={tracked ? "Learners who handed it in" : "General post only"}
            />
            <StatTile
              icon={<CheckCircle2 size={11} aria-hidden />}
              label="Progress"
              value={tracked ? `${pct}%` : "—"}
              caption={
                tracked ? `${Math.max(0, total - submitted)} still pending` : "No submission tracking"
              }
            >
              {tracked ? (
                <div
                  className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Submission progress"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ${
                      pct >= 100 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </StatTile>
            <StatTile
              icon={<CalendarClock size={11} aria-hidden />}
              label="Due date"
              value={dateLabel(module.dueDate)}
              caption={module.dueDate ? "Deadline for the section" : "No deadline set"}
            />
          </div>

          {/* Recap + handout, in the same two-column rhythm as a desk card. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col rounded-md border bg-background/60 p-2.5">
              <h4 className="m-0 mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                Overview
              </h4>
              <DetailRow label="Type">
                {module.kind === "adm" ? "ADM module" : "General post"}
              </DetailRow>
              <DetailRow label="Status">{status.label}</DetailRow>
              <DetailRow label="Released">{dateLabel(module.releaseDate)}</DetailRow>
              <DetailRow label="Due">{dateLabel(module.dueDate)}</DetailRow>
            </div>

            <div className="flex min-w-0 flex-col rounded-md border bg-background/60 p-2.5">
              <h4 className="m-0 mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                Module handout
              </h4>
              {module.moduleUrl ? (
                <a
                  href={module.moduleUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[12px] font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
                  title={module.moduleUrl}
                >
                  {isUploadedModuleFile(module.moduleUrl) ? (
                    <FileText size={12} className="shrink-0" aria-hidden />
                  ) : (
                    <ExternalLink size={12} className="shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {isUploadedModuleFile(module.moduleUrl)
                      ? (moduleFileName(module.moduleUrl) ?? "Attached file")
                      : hostOf(module.moduleUrl)}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground group-hover:text-primary">
                    Open
                  </span>
                </a>
              ) : (
                <p className="m-0 rounded-md border border-dashed px-2 py-3 text-center text-[12px] text-muted-foreground">
                  No handout attached to this module yet.
                </p>
              )}
            </div>
          </div>

          {/* Instructions — full width so long briefs read without a nested scroll. */}
          <div className="flex min-w-0 flex-col rounded-md border bg-background/60 p-2.5">
            <h4 className="m-0 mb-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
              Instructions
            </h4>
            <p className="m-0 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground">
              {module.description?.trim() || "No instructions were added to this module."}
            </p>
          </div>
        </div>
      ) : null}
    </KanbanOverlay>
  );
}
