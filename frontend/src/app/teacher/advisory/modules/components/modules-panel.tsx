"use client";

import * as React from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Pagination } from "@/components/shared/pagination";
import {
  isUploadedModuleFile,
  moduleFileName,
  type AdvisoryModuleRow,
  type AdvisoryModuleStatus,
  type ModuleStatusCounts,
} from "@/services/teacher/advisoryModules.service";
import motion from "./modules-motion.module.css";
import glass from "./modules-glass.module.css";

const dateLabel = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const STATUS: Record<
  AdvisoryModuleStatus,
  { label: string; tone: PillTone; icon: typeof CheckCircle2 }
> = {
  submitted: { label: "Submitted", tone: "green", icon: CheckCircle2 },
  pending: { label: "Pending", tone: "amber", icon: Clock3 },
  overdue: { label: "Overdue", tone: "red", icon: TriangleAlert },
  posted: { label: "Posted", tone: "blue", icon: Megaphone },
};

const FILTER_LABELS: Record<keyof ModuleStatusCounts, string> = {
  all: "All",
  submitted: "Submitted",
  pending: "Pending",
  overdue: "Overdue",
};

const KIND_ACCENT: Record<AdvisoryModuleRow["kind"], string> = {
  adm: "#8b5cf6",
  general: "#3b82f6",
};

/** One-line summary of the module's attachment: file name, link host, or none. */
function AttachmentLine({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
        <Info size={12} className="shrink-0" aria-hidden /> No handout attached
      </span>
    );
  }
  const isFile = isUploadedModuleFile(url);
  const label = isFile ? (moduleFileName(url) ?? "Attached file") : hostOf(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-medium text-primary hover:underline"
      title={isFile ? url : label}
    >
      {isFile ? (
        <FileText size={12} className="shrink-0" aria-hidden />
      ) : (
        <Link2 size={12} className="shrink-0" aria-hidden />
      )}
      <span className="max-w-[190px] truncate">{label}</span>
      <ExternalLink size={11} className="shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

function ModuleCard({
  module,
  selected,
  index,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
}: {
  module: AdvisoryModuleRow;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = STATUS[module.status];
  const StatusIcon = status.icon;
  const accent = KIND_ACCENT[module.kind];
  const tracked = module.kind === "adm" && module.totalLearners > 0;
  const pct = tracked
    ? Math.min(100, Math.round((module.submittedCount / module.totalLearners) * 100))
    : 0;
  const due = dateLabel(module.dueDate);
  const released = dateLabel(module.releaseDate);

  return (
    <article
      style={{ "--card-index": Math.min(index, 9) } as React.CSSProperties}
      className={`${motion.card} min-w-0`}
    >
      <GlassCard className="flex h-full w-full min-w-0">
        <div
          onClick={onSelect}
          className={`${glass.card} ${selected ? glass.cardSelected : ""}`}
        >
          <div className={glass.cardHead}>
            <span
              className={glass.cardIcon}
              style={{ backgroundColor: accent }}
              aria-hidden
            >
              <FileText size={16} />
            </span>
            <div className={glass.cardHeading}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
                aria-pressed={selected}
                className={glass.cardNameButton}
                title={`Show submissions for ${module.moduleName}`}
              >
                {module.moduleName}
              </button>
              <span className={glass.cardMetaRow}>
                <Pill tone={module.kind === "adm" ? "violet" : "blue"} label="Module type">
                  {module.kind === "adm" ? "ADM module" : "General post"}
                </Pill>
              </span>
            </div>
            <Pill tone={status.tone} label="Module status" className="shrink-0">
              <StatusIcon size={11} aria-hidden /> {status.label}
            </Pill>
          </div>

          <div className={glass.cardMetrics}>
            <div className={glass.cardMetric}>
              <span className={glass.metricLabel}>Submissions</span>
              <span className={glass.metricValue}>
                {tracked ? `${module.submittedCount}/${module.totalLearners}` : "—"}
              </span>
              <span className={glass.metricHint}>
                {tracked ? `${pct}% turned in` : "Not tracked"}
              </span>
              {tracked ? (
                <span
                  className={glass.metricTrack}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${module.moduleName} submissions`}
                >
                  <span
                    className={glass.metricFill}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 100 ? "#10b981" : "#f59e0b",
                    }}
                  />
                </span>
              ) : null}
            </div>
            <div className={glass.cardMetric}>
              <span className={glass.metricLabel}>
                {due ? "Due" : released ? "Released" : "Schedule"}
              </span>
              <span className={`${glass.metricValue} ${glass.metricValueDate}`}>
                {due ?? released ?? "No date"}
              </span>
              <span className={glass.metricHint}>
                {due
                  ? "submission deadline"
                  : released
                    ? "posted to section"
                    : "no dates set"}
              </span>
            </div>
          </div>

          <div className={glass.cardFoot}>
            <AttachmentLine url={module.moduleUrl} />
            <div
              className={glass.cardActions}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                type="button"
                variant="ghost"
                className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                onClick={onOpen}
                aria-label={`View ${module.moduleName} details`}
              >
                <Info size={12} aria-hidden /> Details
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-6 w-6 px-0 text-muted-foreground hover:text-foreground"
                onClick={onEdit}
                aria-label={`Edit ${module.moduleName}`}
              >
                <Pencil size={12} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-6 w-6 px-0 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                aria-label={`Delete ${module.moduleName}`}
              >
                <Trash2 size={12} aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </GlassCard>
    </article>
  );
}

export function ModulesPanel({
  rows,
  counts,
  total,
  page,
  selectedId,
  filter,
  headerActions,
  onFilterChange,
  onPageChange,
  onAdd,
  onEdit,
  onDelete,
  onSelect,
  onOpen,
}: {
  rows: AdvisoryModuleRow[];
  counts: ModuleStatusCounts;
  total: number;
  page: number;
  selectedId: string | null;
  filter: keyof ModuleStatusCounts;
  /** Extra controls (e.g. the advisory section picker) shown beside Add module. */
  headerActions?: React.ReactNode;
  onFilterChange: (filter: keyof ModuleStatusCounts) => void;
  onPageChange: (page: number) => void;
  onAdd: () => void;
  onEdit: (module: AdvisoryModuleRow) => void;
  onDelete: (module: AdvisoryModuleRow) => void;
  onSelect: (module: AdvisoryModuleRow) => void;
  /** Fired from the card's Details action — opens the module overlay. */
  onOpen: (module: AdvisoryModuleRow) => void;
}) {
  return (
    <section
      className={`${motion.reveal} flex min-w-0 flex-col gap-3`}
      aria-label="Modules"
    >
      <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/70 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"
            aria-hidden
          >
            <BookOpen size={14} />
          </span>
          <h2 className="m-0 text-[0.9375rem] font-bold tracking-[-0.01em] text-foreground">
            Modules
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions ?? null}
          <Button type="button" className="h-7 px-2.5 text-xs" onClick={onAdd}>
            <Plus size={13} aria-hidden /> Add module
          </Button>
        </div>
      </header>

      {counts.all > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterTabs
            label="Filter modules by status"
            variant="tags"
            options={(Object.keys(FILTER_LABELS) as (keyof ModuleStatusCounts)[]).map(
              (key) => ({
                value: key,
                label: FILTER_LABELS[key],
                count: counts[key],
                tone:
                  key === "submitted"
                    ? ("green" as const)
                    : key === "pending"
                      ? ("amber" as const)
                      : key === "overdue"
                        ? ("red" as const)
                        : ("neutral" as const),
              }),
            )}
            value={filter}
            onChange={onFilterChange}
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">
        {counts.all === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/80 px-4 py-10 text-center">
            <p className="m-0 text-sm font-semibold text-foreground">No modules released yet</p>
            <p className="m-0 max-w-sm text-xs text-muted-foreground">
              Post the module file or link so your advisees know where to get it, then track
              their submissions here.
            </p>
            <Button type="button" variant="outline" className="h-7 px-2.5 text-xs" onClick={onAdd}>
              <Plus size={13} aria-hidden /> Release a module
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/80 px-4 py-10 text-center">
            <p className="m-0 text-sm font-semibold text-foreground">
              No {FILTER_LABELS[filter].toLowerCase()} modules
            </p>
            <p className="m-0 text-xs text-muted-foreground">
              Switch the status filter to see the rest of this term.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(264px,1fr))]">
            {rows.map((m, index) => (
              <ModuleCard
                key={m.id}
                module={m}
                index={index}
                selected={selectedId === m.id}
                onSelect={() => onSelect(m)}
                onOpen={() => onOpen(m)}
                onEdit={() => onEdit(m)}
                onDelete={() => onDelete(m)}
              />
            ))}
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="pt-1">
          <Pagination currentPage={page} totalItems={total} onPageChange={onPageChange} />
        </div>
      ) : null}
    </section>
  );
}
