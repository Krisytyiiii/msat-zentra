"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Pill } from "@/components/ui/pill";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  SECTION_CARD_STATUS_META,
  sectionCardStatus,
} from "@/components/schedule/SectionScheduleCard";
import { scheduleTone } from "@/lib/labels/status-tone";
import type { ScheduleSection } from "@/components/schedule/section-schedule-table";
import { sectionPath } from "./section-path";
import styles from "./schedule-board.module.css";

type StatusFilter = "all" | "published" | "empty";

const GRADES = [7, 8, 9, 10, 11, 12] as const;

function gradeNumber(gradeLevel: string): number {
  return Number(gradeLevel.replace(/\D/g, "")) || 0;
}

function bucketOf(entries: ScheduleSection["timetableEntries"]): Exclude<StatusFilter, "all"> {
  return sectionCardStatus(entries) === "empty" ? "empty" : "published";
}

/**
 * Principal timetable desk: a read-only card grid over the sections' published
 * grids. The administrator publishes the schedules; nothing here is reviewed,
 * approved or sent back.
 */
export function ScheduleBoard({ sections }: { sections: ScheduleSection[] }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [grade, setGrade] = React.useState<number | null>(null);

  const counts = React.useMemo(() => {
    const next = { published: 0, empty: 0 };
    for (const section of sections) {
      next[bucketOf(section.timetableEntries)] += 1;
    }
    return next;
  }, [sections]);

  const ordered = React.useMemo(
    () =>
      [...sections].sort((a, b) => {
        const gradeDiff = gradeNumber(a.gradeLevel) - gradeNumber(b.gradeLevel);
        if (gradeDiff !== 0) return gradeDiff;
        return a.name.localeCompare(b.name);
      }),
    [sections],
  );

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ordered.filter((section) => {
      if (grade != null && gradeNumber(section.gradeLevel) !== grade) return false;
      if (status !== "all" && bucketOf(section.timetableEntries) !== status) return false;
      if (!needle) return true;
      return (
        section.name.toLowerCase().includes(needle) ||
        (section.adviser?.fullName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [ordered, grade, status, query]);

  const boardEmpty = sections.length === 0;
  const filtersActive = grade != null || status !== "all" || query.trim() !== "";

  return (
    <section className={styles.board} aria-label="Section timetables">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <CalendarDays size={16} />
            </span>
            <h2 className={styles.title}>Section timetables</h2>
          </div>
          <p className={styles.subtitle}>
            Published weekly timetables. The administrator desk prepares and
            publishes these grids — this desk is read-only.
          </p>
        </div>
      </header>

      {!boardEmpty ? (
        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter by timetable status"
            options={[
              { value: "all", label: "All", count: sections.length },
              { value: "published", label: "Published", count: counts.published },
              { value: "empty", label: "No schedule", count: counts.empty },
            ]}
            value={status}
            onChange={(next) => setStatus(next as StatusFilter)}
          />
          <div className={styles.toolbarEnd}>
            <FilterTabs
              label="Filter by grade level"
              options={[
                { value: "all", label: "All grades" },
                ...GRADES.map((g) => ({ value: String(g), label: `Grade ${g}` })),
              ]}
              value={grade == null ? "all" : String(grade)}
              onChange={(next) =>
                setGrade(next === "all" ? null : Number(next))
              }
            />
            <InputGroup className="w-56 max-w-full shrink-0 rounded-[16px]">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Find a section or adviser…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Find a section"
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear search"
                    title="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X aria-hidden />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <PageEmptyCallout>
          {boardEmpty ? (
            <>
              No sections yet for this school year. Sections for grades 7–12
              will appear here once created.
            </>
          ) : filtersActive ? (
            <>
              <strong>No sections match these filters.</strong> Try another
              grade, status, or search.
            </>
          ) : (
            <>No sections to show.</>
          )}
        </PageEmptyCallout>
      ) : (
        <div className={styles.grid} aria-label="Sections">
          {visible.map((section, index) => {
            const entries = section.timetableEntries;
            const cardStatus = sectionCardStatus(entries);
            const meta = SECTION_CARD_STATUS_META[cardStatus];
            const slots = entries.length;
            const subjects = new Set(
              entries.map((entry) => entry.subject?.id).filter(Boolean),
            ).size;
            const teachers = new Set(
              entries.map((entry) => entry.teacherName?.id ?? "unassigned"),
            ).size;

            return (
              <article
                key={section.id}
                className={styles.card}
                data-status={cardStatus}
                aria-label={`${section.name} timetable`}
                style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
              >
                <header className={styles.cardHead}>
                  <StudentMascot
                    name={section.name}
                    seed={`${section.name}:${section.gradeLevel}`}
                    size={34}
                  />
                  <div className={styles.cardId}>
                    <span className={styles.sectionName} title={section.name}>
                      {section.name}
                    </span>
                    <span
                      className={styles.adviser}
                      title={section.adviser?.fullName ?? undefined}
                    >
                      {section.adviser?.fullName ?? (
                        <span className={styles.adviserNone}>No adviser</span>
                      )}
                    </span>
                  </div>
                  <Pill field="grade" className={styles.gradePill}>
                    {`Grade ${gradeNumber(section.gradeLevel)}`}
                  </Pill>
                </header>

                <div className={styles.statusRow}>
                  <Pill tone={scheduleTone(cardStatus)} label="Timetable status">
                    {cardStatus === "approved" ? <Check size={11} aria-hidden /> : null}
                    {meta.label}
                  </Pill>
                </div>

                {slots > 0 ? (
                  <>
                    <dl className={styles.metrics}>
                      <div>
                        <dt>Subjects</dt>
                        <dd>{subjects}</dd>
                      </div>
                      <div>
                        <dt>Teachers</dt>
                        <dd>{teachers}</dd>
                      </div>
                      <div>
                        <dt>Slots</dt>
                        <dd>{slots}</dd>
                      </div>
                    </dl>
                    <div className={styles.progressWrap}>
                      <span
                        className={styles.progressTrack}
                        role="img"
                        aria-label={`${slots} published slots`}
                      >
                        <span className={styles.progressFill} style={{ width: "100%" }} />
                      </span>
                      <span className={styles.progressLabel}>
                        {slots} published slot{slots === 1 ? "" : "s"}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className={styles.noSlots}>
                    No published slots this term — the administrator has not
                    published this timetable yet.
                  </p>
                )}

                <div className={styles.cardActions}>
                  <Button
                    asChild
                    variant="default"
                    size="xs"
                    className="h-6 px-2 text-[12px]"
                  >
                    <Link
                      href={sectionPath(section)}
                      aria-label={`Open timetable for ${section.name}`}
                    >
                      {cardStatus === "empty" ? "Open section" : "Open timetable"}
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
