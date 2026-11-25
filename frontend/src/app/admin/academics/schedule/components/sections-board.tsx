"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Layers,
  Loader2,
  Lock,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import { SearchField } from "@/components/ui/search-field";
import { AdvisoryCodeBadge } from "@/components/shared/advisory-code-badge";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { toast } from "@/components/ui/sonner";
import { EmptyActionCard } from "./schedule-empty-kanban";
import type { ScheduleSection } from "../page";
// One card kit for both desks: the administrator's section board reads exactly
// like the principal's advisory-assignment board.
import styles from "@/app/principal/academics/assign/components/sections-kanban.module.css";

const GRADES = ["G7", "G8", "G9", "G10", "G11", "G12"] as const;

export interface PendingSectionCard {
  id: string;
  name: string;
  gradeLevel: string;
}

type StatusKey = "claimed" | "awaiting" | "unassigned";

function statusOf(section: ScheduleSection): StatusKey {
  if (section.adviserId) return "claimed";
  if (section.adviserLabel || section.adviserCode) return "awaiting";
  return "unassigned";
}

function gradeLabel(grade: string): string {
  return `Grade ${grade.replace("G", "")}`;
}

/** "3 learners, 2 records" — what keeps a section locked from deletion. */
function sectionLinkLabel(links: ScheduleSection["links"]): string {
  if (!links) return "existing records";
  const parts: string[] = [];
  if (links.learners > 0) {
    parts.push(`${links.learners} learner${links.learners === 1 ? "" : "s"}`);
  }
  if (links.records > 0) {
    parts.push(`${links.records} record${links.records === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

/**
 * The administrator's section desk. Same card board as the principal's
 * advisory-assignment workspace (`sections-kanban`), because it answers the
 * same question — "who advises this section, and what is the code that lets
 * them in" — with the timetable grid as the action instead of assign/clear.
 *
 * Every section is created with an advisory code; the administrator hands that
 * code to the adviser, who claims the seat with it.
 */
export function SectionsBoard({
  sections,
  pending,
  onOpenGrid,
  onCreate,
  onDelete,
}: {
  sections: ScheduleSection[];
  pending: PendingSectionCard[];
  onOpenGrid: (id: string) => void;
  onCreate: () => void;
  onDelete: (section: ScheduleSection) => void;
}) {
  const [grade, setGrade] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const copyCode = React.useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1600);
      toast.success({ title: "Code copied", description: `${code} — share it with the adviser.` });
    } catch {
      toast.error({ title: "Copy failed", description: "Select the code and copy it manually." });
    }
  }, []);

  const needle = query.trim().toLowerCase();
  const visibleSections = sections.filter((s) => {
    if (grade != null && s.gradeLevel !== grade) return false;
    if (!needle) return true;
    return (
      s.name.toLowerCase().includes(needle) ||
      (s.adviser?.fullName ?? s.adviserLabel ?? "").toLowerCase().includes(needle) ||
      (s.adviserCode ?? "").toLowerCase().includes(needle)
    );
  });
  const visiblePending = pending.filter((s) => {
    if (grade != null && s.gradeLevel !== grade) return false;
    if (!needle) return true;
    return s.name.toLowerCase().includes(needle);
  });

  const boardEmpty = sections.length === 0 && pending.length === 0;
  const filtersActive = grade != null || needle.length > 0;

  return (
    <section className={styles.board} aria-label="Sections">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <Layers size={16} />
            </span>
            <h2 className={styles.title}>Sections</h2>
          </div>
          <p className={styles.subtitle}>
            Create a section for a grade level and hand its advisory code to the adviser who will
            handle it — the code is what lets them claim the section.
          </p>
        </div>
        <div className={styles.headerActions}>
          {!boardEmpty ? (
            <Button size="sm" className="h-6 px-2 text-[12px]" onClick={onCreate}>
              <Plus size={14} aria-hidden />
              Add section
            </Button>
          ) : null}
        </div>
      </header>

      {!boardEmpty ? (
        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter by grade level"
            variant="tags"
            options={[
              { value: "all", label: "All grades", tone: "neutral" },
              ...GRADES.map((g) => ({ value: g, label: gradeLabel(g), tone: "neutral" as const })),
            ]}
            value={grade ?? "all"}
            onChange={(next) => setGrade(next === "all" ? null : next)}
          />
          <SearchField
            className="w-60"
            placeholder="Find a section, adviser, or code…"
            value={query}
            onChange={setQuery}
            aria-label="Find a section"
          />
        </div>
      ) : null}

      {boardEmpty ? (
        <div className="flex min-h-[calc(100dvh-18rem)] items-center justify-center py-8">
          <EmptyActionCard
            icon={Layers}
            title="No sections yet"
            description="Add the first section for this school year. It gets an advisory code you can hand to the adviser who will claim it."
            actions={[
              {
                title: "Add section",
                description: "Pick a grade level and name the section",
                icon: Plus,
                accent: "text-amber-500",
                onClick: onCreate,
              },
            ]}
          />
        </div>
      ) : visibleSections.length === 0 && visiblePending.length === 0 ? (
        <PageEmptyCallout>
          {filtersActive ? (
            <>
              <strong>No sections match these filters.</strong> Try another grade or search.
            </>
          ) : (
            <>No sections to show.</>
          )}
        </PageEmptyCallout>
      ) : (
        <div className={styles.grid} aria-label="Sections">
          {visiblePending.map((s, index) => (
            <article
              key={s.id}
              className={`${styles.card} ${styles.cardAmber}`}
              aria-busy="true"
              aria-label={`${s.name} section being saved`}
              style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
            >
              <header className={styles.cardHead}>
                <StudentMascot name={s.name} seed={s.id} size={36} />
                <div className={styles.cardId}>
                  <span className={styles.sectionName} title={s.name}>
                    {s.name}
                  </span>
                  <span className={styles.teacher}>
                    <span className={styles.pendingWrap}>
                      <Loader2 className={styles.pendingSpin} aria-hidden />
                      Saving…
                    </span>
                  </span>
                </div>
                <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">
                  {gradeLabel(s.gradeLevel)}
                </span>
              </header>
              <div className={styles.metaRow}>
                <span className="text-[12px] font-medium text-muted-foreground">Saving…</span>
              </div>
            </article>
          ))}

          {visibleSections.map((s, index) => {
            const status = statusOf(s);
            const claimed = status === "claimed";
            const code = s.adviserCode ?? "";
            const adviserName = s.adviser?.fullName ?? s.adviserLabel ?? "";
            const learners = s._count.students;
            const slots = s.timetableEntries?.length ?? 0;
            const approved = (s.timetableEntries ?? []).filter(
              (entry) => entry.status === "APPROVED",
            ).length;
            const locked = Boolean(s.locked);
            const lockLabel = sectionLinkLabel(s.links);

            return (
              <article
                key={s.id}
                className={`${styles.card} ${styles.cardAmber} ${claimed ? styles.cardClaimed : ""}`}
                aria-label={`${s.name} section`}
                style={{ animationDelay: `${Math.min(index + visiblePending.length, 11) * 35}ms` }}
              >
                <header className={styles.cardHead}>
                  <StudentMascot
                    name={adviserName || s.name}
                    seed={s.adviserId ?? s.id}
                    size={36}
                  />
                  <div className={styles.cardId}>
                    <span className={styles.sectionName} title={s.name}>
                      {s.name}
                    </span>
                    <span className={styles.teacher} title={adviserName || undefined}>
                      {adviserName || <span className={styles.teacherNone}>No adviser yet</span>}
                    </span>
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">
                    {gradeLabel(s.gradeLevel)}
                  </span>
                </header>

                <div className={styles.metaRow}>
                  {claimed ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-700 dark:text-green-400">
                      <Check size={11} aria-hidden />
                      Claimed
                    </span>
                  ) : status === "awaiting" ? (
                    <span className="text-[12px] font-medium text-amber-700 dark:text-amber-400">
                      Awaiting claim
                    </span>
                  ) : (
                    <span className="text-[12px] font-medium text-muted-foreground">Unassigned</span>
                  )}

                  {code ? (
                    <div className={`${styles.codeRow} ml-auto`}>
                      <AdvisoryCodeBadge
                        code={code}
                        copied={copiedCode === code}
                        ariaLabel={`Copy advisory code for ${s.name}`}
                        onCopy={() => void copyCode(code)}
                      />
                    </div>
                  ) : (
                    <Pill tone="neutral" label="Advisory code">
                      Not issued
                    </Pill>
                  )}
                </div>

                <div className={styles.linksRow}>
                  <span className={styles.linkStat}>
                    <Users size={11} aria-hidden />
                    {learners} learner{learners === 1 ? "" : "s"}
                  </span>
                  <span className={styles.linkStat}>
                    <Layers size={11} aria-hidden />
                    {slots} slot{slots === 1 ? "" : "s"} this term
                  </span>
                </div>

                {slots > 0 ? (
                  <div
                    className={styles.gridProgress}
                    title={`${approved} of ${slots} slots published`}
                    aria-hidden
                  >
                    <span
                      className={styles.gridProgressFill}
                      style={{ width: `${Math.round((approved / slots) * 100)}%` }}
                    />
                  </div>
                ) : null}

                {claimed ? (
                  <p className={`${styles.notice} ${styles.claimedNotice}`}>
                    <Check size={11} aria-hidden />
                    <span>
                      Claimed by <strong>{adviserName}</strong>.
                    </span>
                  </p>
                ) : code ? (
                  <p className={`${styles.notice} ${styles.claimNotice}`}>
                    <Copy size={11} aria-hidden />
                    <span>
                      Share <strong>{code}</strong> with the adviser so they can claim the seat.
                    </span>
                  </p>
                ) : null}

                <div className={styles.cardActions}>
                  <span
                    className={styles.lockedHint}
                    title={locked ? `Locked — used by ${lockLabel}` : "No records linked"}
                  >
                    {locked ? (
                      <>
                        <Lock size={11} aria-hidden />
                        <span className="min-w-0 truncate">Locked — used by {lockLabel}</span>
                      </>
                    ) : (
                      <>
                        <Check size={11} aria-hidden />
                        <span>Can be deleted</span>
                      </>
                    )}
                  </span>
                  {!locked ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className={styles.dangerGhost}
                      aria-label={`Delete ${s.name}`}
                      title="Delete section"
                      onClick={() => onDelete(s)}
                    >
                      <Trash2 size={12} aria-hidden />
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
                    aria-label={`Open the weekly grid for ${s.name}`}
                    onClick={() => onOpenGrid(s.id)}
                  >
                    <Layers size={12} className="text-amber-500" aria-hidden />
                    Open grid
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
