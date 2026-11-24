"use client";

import * as React from "react";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Pagination } from "@/components/shared/pagination";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { toSlug } from "@/lib/slug";
import motion from "./modules-motion.module.css";
import glass from "./modules-glass.module.css";
import type {
  AdvisoryModuleStatus,
  AdvisorySubmissionKind,
  AdvisorySubmissionRow,
} from "@/services/teacher/advisoryModules.service";

const dateLabel = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const STATUS: Record<
  AdvisoryModuleStatus,
  { label: string; tone: PillTone; icon: typeof CheckCircle2 }
> = {
  submitted: { label: "Submitted", tone: "green", icon: CheckCircle2 },
  pending: { label: "Not yet submitted", tone: "red", icon: Clock3 },
  overdue: { label: "Overdue", tone: "red", icon: TriangleAlert },
  posted: { label: "Posted", tone: "blue", icon: CheckCircle2 },
};

const KIND: Record<AdvisorySubmissionKind, { label: string; tone: PillTone; icon: typeof Link2 }> = {
  link: { label: "Link", tone: "blue", icon: Link2 },
  file: { label: "File", tone: "violet", icon: FileText },
  physical: { label: "In person", tone: "teal", icon: CheckCircle2 },
};

/** The learner's answer, as a link / file / plain note. */
function AnswerLink({ row }: { row: AdvisorySubmissionRow }) {
  if (row.submissionKind === "link" && row.submissionUrl) {
    return (
      <a
        href={row.submissionUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        title={row.submissionUrl}
      >
        <ExternalLink size={12} className="shrink-0" aria-hidden />
        <span className="truncate">Open submitted link</span>
      </a>
    );
  }
  if (row.submissionKind === "file" && row.fileUrl) {
    return (
      <a
        href={row.fileUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        title={row.fileUrl}
      >
        <FileText size={12} className="shrink-0" aria-hidden />
        <span className="truncate">{row.fileName ?? "Open file"}</span>
      </a>
    );
  }
  if (row.submitted && row.submissionKind === "physical") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
        Passed in person
        {row.fileUrl ? (
          <a
            href={row.fileUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-primary hover:underline"
          >
            · View proof
          </a>
        ) : null}
      </span>
    );
  }
  return <span className="text-[12px] text-muted-foreground">No answer yet</span>;
}

/** One learner's answer as a glass card — the drawer never turns into a table. */
function SubmissionCard({ row, index }: { row: AdvisorySubmissionRow; index: number }) {
  const status = STATUS[row.status];
  const StatusIcon = status.icon;
  const kind = KIND[row.submissionKind];
  const KindIcon = kind.icon;
  const monitorHref = `/teacher/advisory/adm-cases/${toSlug(row.name)}`;

  return (
    <article
      style={
        {
          "--card-index": Math.min(index, 9),
          cursor: "default",
        } as React.CSSProperties
      }
      className={`${motion.card} ${glass.card} gap-3 p-3`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <StudentMascot
          name={row.name}
          seed={row.lrn}
          character={row.mascot ?? undefined}
          size={32}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-foreground" title={row.name}>
            {row.name}
          </span>
          <span className="truncate text-[12px] tabular-nums text-muted-foreground">
            LRN {row.lrn}
          </span>
        </div>
        <Pill tone={status.tone} label="Submission status" className="shrink-0">
          <StatusIcon size={11} aria-hidden /> {status.label}
        </Pill>
      </div>

      <div className="grid gap-2 border-t border-border/60 pt-2 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-medium text-muted-foreground">Submitted</span>
          <span className="text-[12px] tabular-nums text-foreground">
            {row.submittedAt ? dateLabel(row.submittedAt) : "Not yet"}
          </span>
          {row.submitted ? (
            <Pill tone={kind.tone} label="Submission type" className="self-start">
              <KindIcon size={11} aria-hidden /> {kind.label}
            </Pill>
          ) : (
            <Pill tone="neutral" label="Submission type" className="self-start">
              No submission
            </Pill>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-medium text-muted-foreground">Answer</span>
          <AnswerLink row={row} />
        </div>
      </div>

      {row.remarks ? (
        <p
          className="m-0 line-clamp-2 border-t border-border/60 pt-2 text-[12px] text-muted-foreground"
          title={row.remarks}
        >
          {row.remarks}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button asChild variant="ghost" className="h-7 gap-1 px-2 text-[12px] text-muted-foreground">
          <a
            href={monitorHref}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Monitor ${row.name} in a new tab`}
          >
            <ClipboardList size={12} aria-hidden /> Monitor
          </a>
        </Button>
      </div>
    </article>
  );
}

/**
 * One module's submissions as glass cards. Sized for the right-hand drawer, so
 * a learner's answer never has to be read through a clipped data table.
 */
export function SubmissionCards({
  rows,
  total,
  page,
  onPageChange,
}: {
  rows: AdvisorySubmissionRow[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 px-4 py-10 text-center">
          <p className="m-0 text-sm font-semibold text-foreground">No submissions yet</p>
          <p className="m-0 mt-1 text-[12px] text-muted-foreground">
            Advisees in this section will appear here once enrolled.
          </p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2.5">
          {rows.map((row, index) => (
            <SubmissionCard key={row.key} row={row} index={index} />
          ))}
        </div>
      )}

      {total > 0 ? (
        <div className="border-t border-border/70 pt-2">
          <Pagination currentPage={page} totalItems={total} onPageChange={onPageChange} />
        </div>
      ) : null}
    </div>
  );
}
