"use client";

import { CalendarDays, CalendarRange, Check, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import type { SchoolYearOption } from "@/lib/term/TermContext";
import { EmptyActionCard } from "./schedule-empty-kanban";
import { PENDING_SCHOOL_YEAR_PREFIX, localTodayKey } from "./add-school-year-kanban";
import styles from "./schedule-school-years.module.css";

/** One school year's delete lock, from `/api/admin/schedule/school-years`. */
export interface SchoolYearLockRow {
  id: string;
  locked: boolean;
  lockedReason: string | null;
  links: { sections: number; learners: number; records: number };
}

/** The term this desk is steering (hand-picked or auto), for the footer line. */
export interface SteeringTermLabel {
  schoolYearId: string;
  schoolYearName: string;
  termNumber: number;
}

/** Stored ISO date → "Jun 8, 2026" for the school-year cards. */
function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : format(date, "MMM d, yyyy");
}

/**
 * The School year desk — the same shape as the School-day configuration desk
 * (`schedule-config-presets`): one header with the add action, then a
 * three-per-row grid of year cards. Each card carries its date window, a
 * term-date progress strip, its three terms (click one to work on it) and its
 * own details, so a year can be read and steered without leaving the board.
 */
export function ScheduleSchoolYears({
  years,
  yearLocks,
  loading,
  error,
  steeringYearId,
  steeringTermId,
  activeTerm,
  autoTerm,
  activeSchoolYearName,
  onAdd,
  onSetDates,
  onRequestDelete,
  onApplyScope,
  onFollowToday,
}: {
  years: SchoolYearOption[];
  yearLocks: Map<string, SchoolYearLockRow>;
  loading: boolean;
  error: boolean;
  steeringYearId: string | null;
  steeringTermId: string | null;
  activeTerm: SteeringTermLabel | null;
  autoTerm: SteeringTermLabel | null;
  activeSchoolYearName: string | null;
  onAdd: () => void;
  onSetDates: (yearId: string) => void;
  onRequestDelete: (year: { id: string; name: string }) => void;
  onApplyScope: (yearId: string, termId: string) => void;
  onFollowToday: () => void;
}) {
  // Only the term whose date window contains today may be worked on from this
  // desk; the others are shown (with their dates) but stay locked.
  const todayKey = localTodayKey();
  const datePart = (value: string | null | undefined) => value?.slice(0, 10) ?? "";
  const termCoversToday = (startDate: string | null, endDate: string | null) => {
    const start = datePart(startDate);
    const end = datePart(endDate);
    return Boolean(start && end && start <= todayKey && todayKey <= end);
  };

  return (
    <section className={styles.board} aria-label="School years">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <CalendarRange size={16} />
            </span>
            <h2 className={styles.title}>School years</h2>
          </div>
          <p className={styles.subtitle}>
            Three terms per school year. Set each term&apos;s dates, then click a term to
            work on it — only the term whose dates cover today can be selected; the others
            stay locked until their window opens.
          </p>
        </div>
        {/* With nothing on file the empty card carries the action, so the
            header button would only duplicate it. */}
        {years.length > 0 ? (
          <div className={styles.headerActions}>
            <Button
              size="sm"
              onClick={onAdd}
              className="h-7 gap-1 px-2.5 text-[12px]"
            >
              <Plus size={13} aria-hidden />
              Add school year
            </Button>
          </div>
        ) : null}
      </header>

      {loading && years.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading school years…</p>
      ) : years.length === 0 ? (
        <div className="flex min-h-[calc(100dvh-16rem)] items-center justify-center py-8">
          <EmptyActionCard
            icon={CalendarRange}
            title="No school year yet"
            description={
              error
                ? "Could not load the school years. Check the connection and try again."
                : "Add the first school year here — its three terms come with it, and you can set their start and end dates next."
            }
            actions={[
              {
                onClick: onAdd,
                title: "Add school year",
                description: "Creates the year and its three trimesters",
                icon: Plus,
                accent: "text-amber-500",
              },
            ]}
          />
        </div>
      ) : (
        <>
          <div className={styles.grid} aria-label="School years and their terms">
            {years.map((year, index) => {
              const terms = [...year.terms].sort((a, b) => a.termNumber - b.termNumber);
              const steeringYear = steeringYearId === year.id;
              const yearLock = yearLocks.get(year.id);
              const pending = year.id.startsWith(PENDING_SCHOOL_YEAR_PREFIX);
              const datedTerms = terms.filter((t) => t.startDate && t.endDate).length;
              const totalTerms = terms.length || 3;
              const termsConfigured = terms.length > 0 && datedTerms === terms.length;
              return (
                <article
                  key={year.id}
                  className={`${styles.card} ${steeringYear ? styles.cardActive : ""} ${
                    pending ? styles.cardPending : ""
                  }`}
                  aria-label={`${year.name}${steeringYear ? " — in use" : ""}`}
                  aria-busy={pending || undefined}
                  style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
                >
                  <header className={styles.cardHead}>
                    <div className={styles.cardId}>
                      <span className={styles.name} title={year.name}>
                        {year.name}
                      </span>
                      <span className={styles.cardSub}>
                        <CalendarRange size={11} aria-hidden />
                        {fmtDate(year.startDate)} – {fmtDate(year.endDate)}
                      </span>
                    </div>
                    {steeringYear && !pending ? (
                      <span className={styles.activeBadge}>
                        <Check size={11} aria-hidden />
                        In use
                      </span>
                    ) : null}
                    {pending ? (
                      <span className={styles.activeBadge}>
                        <CalendarDays size={11} aria-hidden />
                        Creating…
                      </span>
                    ) : null}
                  </header>

                  {year.isActive || year.isCurrent || yearLock ? (
                    <div className={styles.chips}>
                      {year.isActive && !pending ? (
                        <span className={`${styles.chip} ${styles.chipGreen}`}>Year in use</span>
                      ) : null}
                      {year.isCurrent && !pending ? (
                        <span className={`${styles.chip} ${styles.chipSky}`}>Current</span>
                      ) : null}
                      {yearLock && !pending ? (
                        <span
                          className={`${styles.chip} ${
                            yearLock.locked ? styles.chipAmber : styles.chipMuted
                          }`}
                          title={
                            yearLock.lockedReason ??
                            "No sections, learners, or term records are linked"
                          }
                        >
                          {yearLock.locked ? "Locked" : "Can be deleted"}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={styles.shape}>
                    <div className={styles.shapeBar} aria-hidden>
                      {Array.from({ length: totalTerms }).map((_, i) => (
                        <span
                          key={i}
                          className={`${styles.segment} ${
                            i < datedTerms ? styles.segmentOn : styles.segmentOff
                          }`}
                        />
                      ))}
                    </div>
                    <div className={styles.shapeCaption}>
                      <span className={styles.shapeClock}>
                        {datedTerms} of {totalTerms} dates set
                      </span>
                      <span className={styles.shapeClock}>
                        {terms.length} term{terms.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.termList}>
                    {pending ? (
                      <span className={styles.termNote}>
                        The three terms will appear here once the school year is saved.
                      </span>
                    ) : terms.length === 0 ? (
                      <span className={styles.termNote}>This school year has no terms yet.</span>
                    ) : (
                      terms.map((term) => {
                        const selected = steeringTermId === term.id;
                        const auto =
                          !activeTerm &&
                          autoTerm?.schoolYearId === year.id &&
                          autoTerm?.termNumber === term.termNumber;
                        const dated = Boolean(term.startDate && term.endDate);
                        const coversToday = termCoversToday(term.startDate, term.endDate);
                        const selectable = dated && coversToday;
                        const lockReason = !dated
                          ? "Set this term's dates first — an undated term cannot be worked on"
                          : `Locked: today is not inside this term. Only the term that covers today (${fmtDate(todayKey)}) can be selected.`;
                        return (
                          <button
                            key={term.id}
                            type="button"
                            onClick={() => onApplyScope(year.id, term.id)}
                            disabled={!selectable}
                            aria-pressed={selected}
                            aria-disabled={!selectable}
                            title={
                              selectable
                                ? `Work on ${year.name} · Term ${term.termNumber}`
                                : lockReason
                            }
                            className={`${styles.termRow} ${
                              selected ? styles.termRowSelected : ""
                            } ${selectable ? "" : styles.termRowLocked}`}
                          >
                            <span
                              aria-hidden
                              className={`${styles.termNum} ${
                                selected ? styles.termNumSelected : ""
                              }`}
                            >
                              {term.termNumber}
                            </span>
                            <span className={styles.termBody}>
                              <span className={styles.termTitleRow}>
                                <span
                                  className={`${styles.termTitle} ${
                                    selected ? styles.termTitleSelected : ""
                                  }`}
                                >
                                  Term {term.termNumber}
                                </span>
                                {auto ? (
                                  <span
                                    className={styles.autoTag}
                                    title="Picked automatically because today falls in this term"
                                  >
                                    Auto
                                  </span>
                                ) : null}
                              </span>
                              <span className={styles.termDates}>
                                {dated
                                  ? `${fmtDate(term.startDate)} – ${fmtDate(term.endDate)}`
                                  : "Dates not set"}
                              </span>
                            </span>
                            {selected ? (
                              <Check size={12} aria-hidden className={styles.termCheck} />
                            ) : !selectable && dated ? (
                              <Lock size={12} aria-hidden className={styles.termLock} />
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <dl className={styles.details}>
                    <div className={styles.detail}>
                      <dt className={styles.detailLabel}>Year starts</dt>
                      <dd className={styles.detailValue}>{fmtDate(year.startDate)}</dd>
                    </div>
                    <div className={styles.detail}>
                      <dt className={styles.detailLabel}>Year ends</dt>
                      <dd className={styles.detailValue}>{fmtDate(year.endDate)}</dd>
                    </div>
                    <div className={styles.detail}>
                      <dt className={styles.detailLabel}>Term dates set</dt>
                      <dd className={styles.detailValue}>
                        {datedTerms} of {totalTerms}
                      </dd>
                    </div>
                    <div className={styles.detail}>
                      <dt className={styles.detailLabel}>Delete status</dt>
                      <dd className={styles.detailValue}>
                        {pending
                          ? "Saving…"
                          : yearLock
                            ? yearLock.locked
                              ? "Locked"
                              : "Allowed"
                            : "—"}
                      </dd>
                    </div>
                  </dl>

                  {!pending ? (
                    <div className={styles.cardActions}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetDates(year.id)}
                        className={`h-6 gap-1 px-2 text-[12px] ${styles.useBtn} ${
                          termsConfigured
                            ? "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                            : "border-amber-500/50 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        <Pencil size={11} aria-hidden />
                        {termsConfigured ? "Edit dates" : "Set dates"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!yearLock || yearLock.locked}
                        onClick={() => onRequestDelete({ id: year.id, name: year.name })}
                        aria-label={`Delete ${year.name}`}
                        title={
                          yearLock?.locked
                            ? (yearLock.lockedReason ?? "This school year cannot be deleted")
                            : "Delete school year"
                        }
                        className={`${styles.rowBtn} ${styles.dangerGhost}`}
                      >
                        <Trash2 size={12} aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className={styles.footRow}>
            <p className={styles.footNote}>
              <span
                className={`${styles.footDot} ${
                  activeTerm ? styles.footDotManual : autoTerm ? styles.footDotAuto : ""
                }`}
                aria-hidden
              />
              {activeTerm ? (
                <>
                  Working on{" "}
                  <span className={styles.footStrong}>
                    {activeTerm.schoolYearName} · Term {activeTerm.termNumber}
                  </span>
                </>
              ) : autoTerm ? (
                <>
                  Following today&apos;s term{" "}
                  <span className={styles.footStrong}>
                    {autoTerm.schoolYearName} · Term {autoTerm.termNumber}
                  </span>{" "}
                  — picked automatically because today falls in it.
                </>
              ) : (
                <>
                  Using the school&apos;s current term
                  {activeSchoolYearName ? ` (${activeSchoolYearName})` : ""}
                </>
              )}
            </p>
            {activeTerm ? (
              <Button
                variant="outline"
                className="h-6 px-2 text-[12px]"
                onClick={onFollowToday}
              >
                Follow today&apos;s term
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
