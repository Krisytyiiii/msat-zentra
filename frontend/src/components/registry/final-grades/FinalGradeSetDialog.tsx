"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  GraduationCap,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoardHeader } from "@/components/ui/kanban-board";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pill, type PillTone } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { formatGrade, formatSection } from "@/lib/utils";
import type { RegistryDesk } from "@/services/registry/overview.service";
import dialogStyles from "./FinalGradeSetDialog.module.css";

export interface GradeSetSubject {
  id: string;
  subject: string;
  code: string;
  teacher: string;
  computedAverage: number;
  transmutedGrade: number;
  remarks: string;
  status: "approved";
}

export interface GradeSetStudent {
  id: string;
  lrn: string;
  name: string;
  gradeLevel: string;
  section: string;
  term: string;
  overall: number;
  mascot: string | null;
  subjects: GradeSetSubject[];
  status: "approved";
}

const MILESTONES = [25, 50, 75, 100];

/** Amber chip matching the final-grades row's subject/grade/section pills. */
function AmberPill({
  label,
  tooltip,
  title,
  className,
}: {
  label: string;
  /** Field name shown in the shared pill tooltip (e.g. "Section"). */
  tooltip?: string;
  title?: string;
  className?: string;
}) {
  return (
    <Pill
      tone="amber"
      label={tooltip ?? label}
      title={title ?? label}
      className={`max-w-full truncate ${className ?? ""}`}
    >
      {label}
    </Pill>
  );
}

/* Traffic-light tones for risk pills: green safe / amber moderate / red high. */
const RISK_TONE: Record<"Low" | "Moderate" | "High", PillTone> = {
  Low: "green",
  Moderate: "amber",
  High: "red",
};

/** Rectangle status pill (not a "·"-joined badge) for risk segments. */
function RiskPill({
  level,
  icon,
  children,
  title,
}: {
  level: "Low" | "Moderate" | "High";
  icon?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Pill
      tone={RISK_TONE[level]}
      label="Academic risk"
      title={title}
      className="max-w-full truncate"
    >
      {icon}
      {children}
    </Pill>
  );
}

/** Remarks pill — red for Failed, green for Passed. */
function RemarkPill({ remarks }: { remarks: string }) {
  const failed = remarks === "Failed";
  return (
    <Pill
      tone={failed ? "red" : "green"}
      label="Remarks"
      title={`Remarks: ${remarks}`}
      className="shrink-0"
    >
      {remarks}
    </Pill>
  );
}

/** Passing margin for a subject (DepEd pass mark is 75). */
function marginText(grade: number): string {
  const delta = Math.round(Math.abs(grade - 75) * 100) / 100;
  return grade >= 75 ? `${delta} above passing (75)` : `${delta} below passing (75)`;
}

/**
 * Read-only grade set sheet — identity header, then the overall picture with
 * the completion milestones beside the per-subject cards (subject name, its
 * teacher and the final grade lead each card). Opened from the registry
 * final-grades workspace on both desks (record keeper / registrar).
 */
export function FinalGradeSetDialog({
  desk,
  student,
  onClose,
}: {
  desk: RegistryDesk;
  student: GradeSetStudent | null;
  onClose: () => void;
}) {
  const deskLabel = desk === "registrar" ? "Registrar" : "Record keeper";
  const open = student !== null;
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [showFullAbout, setShowFullAbout] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted || !student) return null;

  const codes = [...new Set(student.subjects.map((sub) => sub.code))];
  const failedCount = student.subjects.filter((sub) => sub.remarks === "Failed").length;
  const riskLevel = student.overall < 75 ? "High" : failedCount > 0 ? "Moderate" : "Low";
  const hasSection = !!student.section && student.section !== "—";

  const copyLrn = async () => {
    try {
      await navigator.clipboard.writeText(student.lrn);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context / permission) — the pill still
      // shows the LRN, so nothing else to do.
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[2px] animate-in fade-in-0 duration-150 dark:bg-black/70"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="final-grade-set-title"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-muted shadow-xl [font-family:var(--font-inter)] animate-in fade-in-0 zoom-in-95 duration-150 dark:bg-background"
      >
        {/* Identity header — who the set belongs to, one glance. */}
        <header className="flex min-w-0 items-start gap-2.5 border-b border-border bg-card/60 px-3.5 py-2.5">
          <StudentMascot
            name={student.name}
            seed={student.lrn}
            character={student.mascot ?? undefined}
            size={42}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h2
                id="final-grade-set-title"
                className="min-w-0 truncate text-sm font-bold tracking-tight"
                title={student.name}
              >
                {student.name}
              </h2>
              <Pill label="LRN" title={student.lrn} className="tabular-nums">
                {student.lrn}
              </Pill>
              <button
                type="button"
                onClick={() => void copyLrn()}
                className="inline-flex size-5 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={copied ? "LRN copied" : "Copy LRN"}
                title={copied ? "Copied" : "Copy LRN"}
              >
                {copied ? (
                  <Check size={11} strokeWidth={2.4} aria-hidden />
                ) : (
                  <Copy size={11} strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Pill tone="green" label="Grade set status">
                Complete
              </Pill>
              {codes.map((code) => (
                <AmberPill
                  key={code}
                  label={code}
                  tooltip="Subject code"
                  title={`Subject code: ${code}`}
                />
              ))}
              <AmberPill label={formatGrade(student.gradeLevel)} tooltip="Grade level" />
              {hasSection ? (
                <AmberPill label={formatSection(student.section)} tooltip="Section" />
              ) : null}
              <AmberPill label={student.term} tooltip="Term" title={`Term: ${student.term}`} />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="h-6 w-6 shrink-0 px-0"
            onClick={onClose}
            aria-label="Close grade set"
          >
            <X size={14} strokeWidth={1.8} aria-hidden />
          </Button>
        </header>

        <div className="grid min-w-0 items-start gap-2.5 overflow-y-auto p-2.5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          {/* Overall + completion + context */}
          <div className="flex min-w-0 flex-col gap-2">
            <section
              aria-label="Overall"
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background p-2.5 dark:bg-card/40"
            >
              <KanbanBoardHeader
                icon={
                  <GraduationCap
                    size={14}
                    className="text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                }
                title="Overall"
              />
              <div className="flex min-w-0 flex-col items-center gap-2.5 rounded-lg border border-border bg-card py-5 text-center shadow-sm">
                <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
                  {student.overall}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  Overall Average
                </span>
                <Pill tone="green" label="Grade set status" className="px-2.5">
                  Complete
                </Pill>
              </div>
              <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                {/* Bar + milestone nodes share one track, so each number sits
                    exactly where its percentage lands on the line. The track is
                    inset by half a node (mx-3.5 = half of size-7) so the 100%
                    node stays inside the card. */}
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="relative mx-3.5 h-7"
                        tabIndex={0}
                        aria-label={`Overall average ${student.overall} of 100`}
                      >
                        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-primary/20">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(student.overall, 100)}%` }}
                          />
                        </div>
                        {MILESTONES.map((m) => (
                          <span
                            key={m}
                            style={{ left: `${m}%` }}
                            className={`absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border text-[12px] font-bold ${
                              student.overall >= m
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      <span className="font-medium">Overall average</span>
                      <span className="opacity-60">{student.overall} / 100</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <p className="rounded-lg border border-border bg-muted/50 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  {failedCount === 0
                    ? `Great job! ${student.name}'s final grades are complete and all subjects are passing.`
                    : `${student.name} has ${failedCount} subject(s) below 75. Adviser follow-up may be needed.`}
                </p>
              </div>
            </section>

            <section
              aria-label="Student"
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background p-2.5 dark:bg-card/40"
            >
              <KanbanBoardHeader
                icon={<UserRound size={14} className="text-blue-500" aria-hidden />}
                title="Learner"
              />
              <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-2.5 shadow-sm">
                {riskLevel === "Low" ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <RiskPill level="Low" icon={<Check size={11} strokeWidth={2.4} aria-hidden />}>
                      Not at risk
                    </RiskPill>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <RiskPill
                      level={riskLevel}
                      icon={<AlertTriangle size={11} aria-hidden />}
                      title={`Academic risk: ${riskLevel}`}
                    >
                      At risk
                    </RiskPill>
                    <RiskPill level={riskLevel} title={`Academic risk: ${riskLevel}`}>
                      {riskLevel}
                    </RiskPill>
                    <RiskPill
                      level={riskLevel}
                      title={`${failedCount} subject(s) below the passing grade of 75`}
                    >
                      {failedCount} below 75
                    </RiskPill>
                  </div>
                )}
                <p className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                  About this grade set
                </p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {showFullAbout
                    ? `This is the complete final grade set for ${student.name} (${student.term}). All ${student.subjects.length} subject(s) have been locked by the subject teacher and approved by the class adviser. ${deskLabel} access is view-only — no further approval is required.`
                    : `This is the complete final grade set for ${student.name} (${student.term}). All ${student.subjects.length} subject(s) have been locked by the subject teacher and approved by the class adviser.`}
                </p>
                <button
                  type="button"
                  onClick={() => setShowFullAbout((v) => !v)}
                  className="inline-flex w-fit items-center gap-1 text-[12px] font-medium text-foreground transition-colors hover:text-primary"
                >
                  {showFullAbout ? "Show less" : "Show more"}
                  <ChevronDown
                    className={`size-3.5 transition-transform ${showFullAbout ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
              </div>
            </section>
          </div>

          {/* Subjects in the set */}
          <section
            aria-label="Subjects"
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background p-2.5 dark:bg-card/40"
          >
            <KanbanBoardHeader
              icon={<BookOpen size={14} className="text-amber-600 dark:text-amber-400" aria-hidden />}
              title="Subjects"
              count={student.subjects.length}
            />
            <div className={`${dialogStyles.subjectsScroll} flex min-w-0 flex-col gap-2`}>
              {student.subjects.map((sub) => {
                const failed = sub.remarks === "Failed";
                const hasTeacher = !!sub.teacher && sub.teacher !== "—";
                return (
                  <article
                    key={sub.id}
                    className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-foreground/20"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span
                          className="truncate text-sm font-semibold text-foreground"
                          title={sub.subject}
                        >
                          {sub.subject}
                        </span>
                        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                          {sub.code}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          Final
                        </span>
                        <span
                          className={`text-lg font-bold leading-none tabular-nums ${
                            failed
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {sub.transmutedGrade}
                        </span>
                      </div>
                    </div>

                    <p className="flex min-w-0 items-center gap-1.5 text-xs">
                      <UserRound size={12} className="shrink-0 text-muted-foreground" aria-hidden />
                      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Teacher
                      </span>
                      <span
                        className={`truncate font-semibold ${
                          hasTeacher ? "text-foreground" : "italic text-muted-foreground"
                        }`}
                        title={hasTeacher ? sub.teacher : "No teacher assigned"}
                      >
                        {hasTeacher ? sub.teacher : "Not assigned"}
                      </span>
                    </p>

                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(sub.transmutedGrade, 100)}%`,
                          backgroundColor: failed ? "#ef4444" : "#10b981",
                        }}
                      />
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                      <span className="text-[12px] text-muted-foreground">
                        Computed{" "}
                        <span className="font-medium tabular-nums text-foreground">
                          {sub.computedAverage}
                        </span>
                        <span className="px-1 text-border">·</span>
                        Transmuted{" "}
                        <span className="font-semibold tabular-nums text-foreground">
                          {sub.transmutedGrade}
                        </span>
                      </span>
                      <RemarkPill remarks={sub.remarks} />
                    </div>

                    <span className="text-[12px] text-muted-foreground">
                      {marginText(sub.transmutedGrade)}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <div className="border-t border-border bg-background px-3.5 py-2.5 dark:bg-card/40">
          <InsightCallout role="status">
            All <strong>{student.subjects.length}</strong> subject(s) are locked (final)
            for {student.term}. {deskLabel} access is read-only — no further
            approval is required.{" "}
            {failedCount === 0 ? (
              <>The student passed all subjects with a transmuted grade of 75 or above.</>
            ) : (
              <>
                <strong>{failedCount}</strong> subject(s) are below the passing grade of 75.
              </>
            )}
          </InsightCallout>
        </div>
      </div>
    </div>,
    document.body
  );
}
