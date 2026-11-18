"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Search,
  Send,
  X,
} from "lucide-react";
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
  type SectionCardStatus,
} from "@/components/schedule/SectionScheduleCard";
import { scheduleTone } from "@/lib/labels/status-tone";
import type { ScheduleSection } from "@/components/schedule/section-schedule-table";
import { sectionPath } from "./section-path";
import styles from "./schedule-board.module.css";

type StatusFilter = "all" | "submitted" | "approved" | "draft" | "empty";

const GRADES = [7, 8, 9, 10, 11, 12] as const;

/** Bucket order: the desk is a review queue first, an archive second. */
const STATUS_ORDER: Record<SectionCardStatus, number> = {
  submitted: 0,
  returned: 1,
  draft: 2,
  approved: 3,
  empty: 4,
};

function gradeNumber(gradeLevel: string): number {
  return Number(gradeLevel.replace(/\D/g, "")) || 0;
}

/** "draft" also covers a timetable the principal sent back for revision. */
function bucketOf(status: SectionCardStatus): Exclude<StatusFilter, "all"> {
  if (status === "submitted") return "submitted";
  if (status === "approved") return "approved";
  if (status === "empty") return "empty";
  return "draft";
}

function timeAgo(value?: string | null): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function latestSubmission(section: ScheduleSection): string | null {
  let latest: string | null = null;
  for (const entry of section.timetableEntries) {
    if (!entry.submittedAt) continue;
    if (!latest || entry.submittedAt > latest) latest = entry.submittedAt;
  }
  return latest;
}

function reviewNoteOf(section: ScheduleSection): string | null {
  const note = section.timetableEntries.find(
    (entry) => entry.status === "DRAFT" && entry.reviewNote,
  )?.reviewNote;
  return note?.trim() ? note.trim() : null;
}

/**
 * Principal schedule desk: the review queue as a card grid. Sections are
 * sorted action-first (awaiting review, returned, draft, approved, far
 * empties last), each card carries the timetable's real shape — subjects,
 * teachers, slots and submit time — and the one action that matters (review)
 * sits next to the link into the full timetable.
 */
export function ScheduleBoard({
  sections,
  onReview,
}: {
  sections: ScheduleSection[];
  onReview?: (section: ScheduleSection) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [grade, setGrade] = React.useState<number | null>(null);

  const counts = React.useMemo(() => {
    const next = { submitted: 0, approved: 0, draft: 0, empty: 0 };
    for (const section of sections) {
      next[bucketOf(sectionCardStatus(section.timetableEntries))] += 1;
    }
    return next;
  }, [sections]);

  const ordered = React.useMemo(
    () =>
      [...sections].sort((a, b) => {
        const statusDiff =
          STATUS_ORDER[sectionCardStatus(a.timetableEntries)] -
          STATUS_ORDER[sectionCardStatus(b.timetableEntries)];
        if (statusDiff !== 0) return statusDiff;
        const gradeDiff = gradeNumber(a.gradeLevel) - gradeNumber(b.gradeLevel);
        if (gradeDiff !== 0) return gradeDiff;
        return a.name.localeCompare(b.name);
      }),
    [sections],
  );

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ordered.filter((section) => {
      const cardStatus = sectionCardStatus(section.timetableEntries);
      if (grade != null && gradeNumber(section.gradeLevel) !== grade) return false;
      if (status !== "all" && bucketOf(cardStatus) !== status) return false;
      if (!needle) return true;
      return (
        section.name.toLowerCase().includes(needle) ||
        (section.adviser?.fullName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [ordered, grade, status, query]);

  const boardEmpty = sections.length === 0;
  const filtersActive = grade != null || status !== "all" || query.trim() !== "";
  const nextReview = ordered.find(
    (section) => sectionCardStatus(section.timetableEntries) === "submitted",
  );

  return (
    <section className={styles.board} aria-label="Schedule approval">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <CalendarDays size={16} />
            </span>
            <h2 className={styles.title}>Schedule approval</h2>
          </div>
          <p className={styles.subtitle}>
            Timetables sent by the master teacher land here for review. Approve
            one to make its slots official, or send it back with a note.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            size="sm"
            className="h-6 px-2 text-[12px]"
            disabled={!nextReview || !onReview}
            title={
              nextReview
                ? `Review ${nextReview.name}`
                : "Nothing is waiting for review"
            }
            onClick={() => {
              if (nextReview && onReview) onReview(nextReview);
            }}
          >
            <Send size={12} aria-hidden />
            Review next
            {counts.submitted > 0 ? (
              <span className={styles.headerCount}>{counts.submitted}</span>
            ) : null}
          </Button>
        </div>
      </header>

      {!boardEmpty ? (
        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter by timetable status"
            options={[
              { value: "all", label: "All", count: sections.length },
              { value: "submitted", label: "Awaiting review", count: counts.submitted },
              { value: "approved", label: "Approved", count: counts.approved },
              { value: "draft", label: "Draft or returned", count: counts.draft },
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
            const submitted = entries.filter((e) => e.status === "SUBMITTED").length;
            const approved = entries.filter((e) => e.status === "APPROVED").length;
            const subjects = new Set(
              entries.map((entry) => entry.subject?.id).filter(Boolean),
            ).size;
            const teachers = new Set(
              entries.map((entry) => entry.teacherName?.id ?? "unassigned"),
            ).size;
            const draft = entries.filter((e) => e.status === "DRAFT").length;
            const submittedAt =
              cardStatus === "submitted" ? timeAgo(latestSubmission(section)) : null;
            const note = cardStatus === "returned" ? reviewNoteOf(section) : null;
            const filled =
              cardStatus === "approved"
                ? approved
                : cardStatus === "submitted"
                  ? submitted
                  : draft;
            const progress = slots > 0 ? Math.round((filled / slots) * 100) : 0;

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
                    {cardStatus === "submitted" ? (
                      <Clock3 size={11} aria-hidden />
                    ) : cardStatus === "approved" ? (
                      <Check size={11} aria-hidden />
                    ) : null}
                    {meta.label}
                  </Pill>
                  {submittedAt ? (
                    <span className={styles.stamp}>
                      <Clock3 size={10} aria-hidden />
                      {submittedAt}
                    </span>
                  ) : null}
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
                        aria-label={`${filled} of ${slots} slots ${
                          cardStatus === "approved" ? "approved" : "submitted"
                        }`}
                      >
                        <span
                          className={styles.progressFill}
                          style={{ width: `${progress}%` }}
                        />
                      </span>
                      <span className={styles.progressLabel}>
                        {cardStatus === "approved"
                          ? `${approved} of ${slots} approved`
                          : cardStatus === "submitted"
                            ? `${submitted} of ${slots} submitted`
                            : `${draft} of ${slots} in draft`}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className={styles.noSlots}>
                    No slots yet this term — the master teacher has not started
                    this timetable.
                  </p>
                )}

                {note ? (
                  <p className={styles.note} title={note}>
                    <strong>Sent back:</strong> {note}
                  </p>
                ) : null}

                <div className={styles.cardActions}>
                  {onReview && cardStatus === "submitted" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      className="h-6 px-2 text-[12px]"
                      onClick={() => onReview(section)}
                      aria-label={`Review schedule for ${section.name}`}
                    >
                      Review
                    </Button>
                  ) : null}
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
