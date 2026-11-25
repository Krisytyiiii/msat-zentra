"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  Download,
  Layers,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchField } from "@/components/ui/search-field";
import { StatDeck } from "@/components/ui/stat-deck";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { sectionSlug } from "@/lib/sectionSlug";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import styles from "./schedule-overview-board.module.css";
import type { ScheduleSectionSummary } from "../page";

const GRADES = [7, 8, 9, 10, 11, 12] as const;
type StatusKey = "all" | "published" | "draft" | "empty";

function gradeNumber(grade: string): number {
  return Number(grade.replace("G", "")) || 0;
}

function statusOf(section: ScheduleSectionSummary): Exclude<StatusKey, "all"> {
  const total = section.timetableEntries.length;
  if (total === 0) return "empty";
  return section.timetableEntries.every((entry) => entry.status === "APPROVED")
    ? "published"
    : "draft";
}

/** Interactive overview of every section's timetable: stat tiles double as
 *  status filters, grade tabs narrow the grid, and each card opens the grid. */
export function ScheduleOverviewBoard({ sections }: { sections: ScheduleSectionSummary[] }) {
  const [grade, setGrade] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusKey>("all");
  const [query, setQuery] = React.useState("");
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((current) => (current === code ? null : current));
      }, 1600);
    } catch {
      // Clipboard blocked (insecure context / permissions): leave the icon as is.
    }
  };

  const ordered = React.useMemo(
    () =>
      [...sections].sort(
        (a, b) =>
          gradeNumber(a.gradeLevel) - gradeNumber(b.gradeLevel) || a.name.localeCompare(b.name),
      ),
    [sections],
  );

  const counts = React.useMemo(() => {
    const published = ordered.filter((s) => statusOf(s) === "published").length;
    const draft = ordered.filter((s) => statusOf(s) === "draft").length;
    const empty = ordered.filter((s) => statusOf(s) === "empty").length;
    return { all: ordered.length, published, draft, empty };
  }, [ordered]);

  const needle = query.trim().toLowerCase();
  const visible = ordered.filter((section) => {
    if (grade != null && section.gradeLevel !== grade) return false;
    if (status !== "all" && statusOf(section) !== status) return false;
    if (!needle) return true;
    const adviser = section.adviser?.fullName ?? section.adviserLabel ?? "";
    return (
      section.name.toLowerCase().includes(needle) ||
      adviser.toLowerCase().includes(needle) ||
      (section.adviserCode ?? "").toLowerCase().includes(needle)
    );
  });

  const tiles: Array<{
    key: StatusKey;
    label: string;
    unit: string;
    hint: string;
    value: number;
    icon: LucideIcon;
    tone?: "amber" | "red";
  }> = [
    {
      key: "all",
      label: "Sections",
      unit: "sections",
      hint: "Every grade level",
      value: counts.all,
      icon: Layers,
    },
    {
      key: "published",
      label: "Published",
      unit: "published",
      hint: "Live for teachers",
      value: counts.published,
      icon: Check,
    },
    {
      key: "draft",
      label: "In draft",
      unit: "drafts",
      hint: "Not live yet",
      value: counts.draft,
      icon: Download,
      tone: "amber",
    },
    {
      key: "empty",
      label: "No slots",
      unit: "sections",
      hint: "Grid not built",
      value: counts.empty,
      icon: CalendarDays,
    },
  ];

  return (
    <section className={cardStyles.board} aria-label="School schedule">
      <StatDeck
        ariaLabel="Schedule at a glance"
        items={tiles.map((tile) => ({
          key: tile.key,
          icon: tile.icon,
          label: tile.label,
          unit: tile.unit,
          value: tile.value,
          hint: tile.hint,
          tone: tile.tone,
          active: status === tile.key,
          onClick: () => setStatus(tile.key),
          indicator: "none",
          ariaLabel: `${tile.label}: ${tile.value} ${tile.unit} — filter the sections`,
        }))}
      />

      <div className={cardStyles.toolbar}>
        <FilterTabs
          label="Filter by grade level"
          variant="tags"
          options={[
            { value: "all", label: "All grades", tone: "neutral" },
            ...GRADES.map((g) => ({
              value: `G${g}`,
              label: `Grade ${g}`,
              tone: "neutral" as const,
            })),
          ]}
          value={grade ?? "all"}
          onChange={(next) => setGrade(next === "all" ? null : next)}
        />
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Find a section, adviser, or code…"
          aria-label="Find a section"
        />
      </div>

      {visible.length === 0 ? (
        <PageEmptyCallout>
          <strong>No sections match these filters.</strong> Try another grade, status, or search.
        </PageEmptyCallout>
      ) : (
        <div className={cardStyles.grid} aria-label="Sections">
          {visible.map((section, index) => {
            const sectionStatus = statusOf(section);
            const published = sectionStatus === "published";
            const total = section.timetableEntries.length;
            const approved = section.timetableEntries.filter(
              (entry) => entry.status === "APPROVED",
            ).length;
            const pct = total === 0 ? 0 : Math.round((approved / total) * 100);
            const adviserName = section.adviser?.fullName ?? section.adviserLabel ?? "";
            const href = `/admin/academics/schedule/template/${encodeURIComponent(
              sectionSlug(section.name, section.gradeLevel, ordered),
            )}`;
            return (
              <article
                key={section.id}
                className={`${styles.card} ${published ? styles.cardPublished : ""}`}
                aria-label={`${section.name} timetable`}
                style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
              >
                <header className={cardStyles.cardHead}>
                  <StudentMascot
                    name={adviserName || section.name}
                    seed={section.adviserId ?? section.id}
                    size={36}
                  />
                  <div className={cardStyles.cardId}>
                    <span className={cardStyles.sectionName} title={section.name}>
                      {section.name}
                    </span>
                    <span className={cardStyles.teacher} title={adviserName || undefined}>
                      {adviserName || <span className={cardStyles.teacherNone}>No adviser yet</span>}
                    </span>
                  </div>
                  <span className={styles.gradeText}>
                    Grade {section.gradeLevel.replace("G", "")}
                  </span>
                </header>

                <div className={cardStyles.metaRow}>
                  {published ? (
                    <span className={styles.statusText} data-tone="green">
                      <Check size={12} aria-hidden />
                      Published
                    </span>
                  ) : sectionStatus === "draft" ? (
                    <span className={styles.statusText} data-tone="amber">
                      In draft
                    </span>
                  ) : (
                    <span className={styles.statusText} data-tone="neutral">
                      No slots yet
                    </span>
                  )}
                  {section.adviserCode ? (
                    <span className={styles.codeBadgeWrap}>
                      <span className={styles.codeBadge} title="Advisory code">
                        {section.adviserCode}
                        <button
                          type="button"
                          className={styles.codeCopy}
                          aria-label={`Copy advisory code for ${section.name}`}
                          title="Copy advisory code"
                          onClick={() => void copyCode(section.adviserCode ?? "")}
                        >
                          {copiedCode === section.adviserCode ? (
                            <Check size={12} aria-hidden />
                          ) : (
                            <Copy size={12} aria-hidden />
                          )}
                        </button>
                      </span>
                    </span>
                  ) : null}
                </div>

                <div
                  className={styles.progress}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={`${approved} of ${total} slots published`}
                >
                  <span
                    className={`${styles.progressFill} ${published ? styles.progressDone : ""}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={styles.progressLine}>
                  {total === 0
                    ? "No slots placed yet"
                    : `${approved}/${total} slot${total === 1 ? "" : "s"} published`}
                </p>

                <div className={cardStyles.linksRow}>
                  <span className={cardStyles.linkStat}>
                    <Layers size={11} aria-hidden />
                    {total} slot{total === 1 ? "" : "s"}
                  </span>
                  <span className={cardStyles.linkStat}>
                    <Users size={11} aria-hidden />
                    {section._count.students} learner{section._count.students === 1 ? "" : "s"}
                  </span>
                  <span className={cardStyles.linkStat}>
                    <BookOpen size={11} aria-hidden />
                    {section._count.teacherAssignments ?? 0} subject
                    {(section._count.teacherAssignments ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>

                <div className={cardStyles.cardActions}>
                  <span className={cardStyles.lockedHint}>
                    <CalendarDays size={11} aria-hidden />
                    <span>
                      {published
                        ? "Live for teachers"
                        : sectionStatus === "draft"
                          ? "Not published yet"
                          : "Not built yet"}
                    </span>
                  </span>
                  <Button
                    asChild
                    variant="outline"
                    className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
                  >
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open timetable for ${section.name}`}
                    >
                      Open timetable
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
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
