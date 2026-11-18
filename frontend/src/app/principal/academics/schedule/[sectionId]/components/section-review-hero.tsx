"use client";

import * as React from "react";
import {
  CalendarDays,
  Check,
  ClipboardCheck,
  Pencil,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { cn } from "@/lib/utils";
import { scheduleTone } from "@/lib/labels/status-tone";
import type {
  SlotFilter,
  Submission,
} from "./use-principal-schedule-section";
import styles from "./section-review-hero.module.css";

const SLOT_FILL: Record<Exclude<SlotFilter, "all">, string> = {
  submitted: "#3b82f6",
  approved: "#22c55e",
  draft: "#ef4444",
};

const SLOT_TILES: {
  key: Exclude<SlotFilter, "all">;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ size?: number | string; className?: string }>;
}[] = [
  { key: "submitted", label: "Submitted", hint: "Awaiting your review", Icon: ClipboardCheck },
  { key: "approved", label: "Approved", hint: "Official slots", Icon: Check },
  { key: "draft", label: "Draft", hint: "Not yet submitted", Icon: Pencil },
];

const FILTER_LABEL: Record<SlotFilter, string> = {
  all: "All slots",
  submitted: "Submitted",
  approved: "Approved",
  draft: "Draft",
};

interface StatusMeta {
  title: string;
  message: string;
  Icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

/**
 * Section review deck — the page's command strip. It carries the section
 * identity, the live review state, a clickable slot breakdown that filters the
 * timetable below, and the one action this desk exists for (open the decision
 * dialog). The grid below stays purely a timetable.
 */
export function SectionReviewHero({
  submission,
  statusMeta,
  counts,
  emptyCount,
  returnedNote,
  filter,
  onFilterChange,
  onOpenReview,
}: {
  submission: Submission;
  statusMeta: StatusMeta;
  counts: { total: number; submitted: number; approved: number; draft: number };
  emptyCount: number;
  returnedNote: string | null;
  filter: SlotFilter;
  onFilterChange: (next: SlotFilter) => void;
  onOpenReview: () => void;
}) {
  const StatusIcon = statusMeta.Icon;
  const statusKey = statusMeta.title.toLowerCase();
  const teacher = submission.adviser?.fullName ?? null;
  const gradeNumber = submission.gradeLevel.replace("G", "");
  const share = (count: number) =>
    counts.total === 0 ? 0 : Math.round((count / counts.total) * 100);

  const toggle = (key: Exclude<SlotFilter, "all">) =>
    onFilterChange(filter === key ? "all" : key);

  return (
    <section className={styles.hero} aria-label={`${submission.name} schedule review`}>
      <header className={styles.head}>
        <span className={styles.headTitle}>
          <span className={styles.iconChip} aria-hidden>
            <CalendarDays size={13} />
          </span>
          Schedule review
          <span className={styles.headDivider} aria-hidden />
          <span className={styles.headSection}>{submission.name}</span>
        </span>
        <span className={styles.headMeta}>
          <Pill tone={scheduleTone(statusKey)}>{statusMeta.title}</Pill>
        </span>
      </header>

      <div className={styles.body}>
        <div className={styles.lead}>
          <div className={styles.identity}>
            <span className={styles.mascot}>
              <StudentMascot
                name={teacher ?? submission.name}
                seed={submission.name}
                size={52}
              />
            </span>
            <div className={styles.identityText}>
              <h1 className={styles.sectionName} title={submission.name}>
                {submission.name}
              </h1>
              <div className={styles.identityMeta}>
                <Pill tone="neutral" label="Grade level">
                  Grade {gradeNumber}
                </Pill>
                <Pill
                  tone={teacher ? "amber" : "neutral"}
                  label="Teacher"
                  className="max-w-full overflow-hidden"
                >
                  <span className="truncate">{teacher ?? "No adviser assigned"}</span>
                </Pill>
              </div>
            </div>
          </div>

          <p className={styles.statusLine}>
            <span className={styles.statusIcon} data-tone={statusKey} aria-hidden>
              <StatusIcon size={13} />
            </span>
            <span className={styles.statusText}>
              <strong>{statusMeta.title}</strong>
              <span className={styles.statusMessage}>{statusMeta.message}</span>
            </span>
          </p>

          {returnedNote ? (
            <p className={styles.returnedNote} title={returnedNote}>
              <Undo2 size={12} aria-hidden />
              <span className={styles.returnedLabel}>Your note</span>
              <span className={styles.returnedText}>{returnedNote}</span>
            </p>
          ) : null}
        </div>

        <div className={styles.sep} aria-hidden />

        <div className={styles.right}>
          <div className={styles.blockHead}>
            <span>Slot breakdown</span>
            <span className={styles.blockHint}>Click a status to filter the timetable</span>
          </div>

          <div className={styles.tiles} role="group" aria-label="Filter timetable by slot status">
            {SLOT_TILES.map((tile) => {
              const count = counts[tile.key];
              const active = filter === tile.key;
              const Icon = tile.Icon;
              return (
                <button
                  key={tile.key}
                  type="button"
                  className={cn(styles.tile, active && styles.tileActive)}
                  style={{ "--slot-color": SLOT_FILL[tile.key] } as React.CSSProperties}
                  aria-pressed={active}
                  onClick={() => toggle(tile.key)}
                >
                  <span className={styles.tileTop}>
                    <span
                      className={styles.dot}
                      style={{ background: SLOT_FILL[tile.key] }}
                      aria-hidden
                    />
                    <span className={styles.tileLabel}>{tile.label}</span>
                    <span className={styles.tileCount}>{count}</span>
                  </span>
                  <span className={styles.tileTrack} aria-hidden>
                    <span
                      className={styles.tileFill}
                      style={{ width: `${share(count)}%`, background: SLOT_FILL[tile.key] }}
                    />
                  </span>
                  <span className={styles.tileFoot}>
                    <span>{share(count)}% of slots</span>
                    <span className={styles.tileHint}>
                      {active ? (
                        <span className={styles.tileFocus}>
                          <Icon size={10} aria-hidden /> Focused
                        </span>
                      ) : (
                        tile.hint
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <p className={styles.emptyLine}>
            <strong>{emptyCount}</strong> of{" "}
            <strong>{emptyCount + counts.total}</strong> weekly slots still empty
          </p>

          <div className={styles.actions}>
            <Button
              type="button"
              size="sm"
              className="h-7 px-2.5 text-[12px]"
              onClick={onOpenReview}
              disabled={counts.submitted === 0}
              title={
                counts.submitted === 0
                  ? "Nothing is submitted for review yet"
                  : "Review and decide on this timetable"
              }
            >
              <ClipboardCheck size={13} aria-hidden />
              Review decision
              {counts.submitted > 0 ? (
                <span className={styles.ctaCount}>{counts.submitted}</span>
              ) : null}
            </Button>
          </div>
        </div>
      </div>

      <footer className={styles.foot}>
        <span className={styles.footLabel}>Showing</span>
        {filter === "all" ? (
          <span className={styles.footValue}>
            all {counts.total} filled slot{counts.total === 1 ? "" : "s"}
          </span>
        ) : (
          <>
            <span className={styles.footValue}>
              {FILTER_LABEL[filter]} · {counts[filter]} of {counts.total}
            </span>
            <button
              type="button"
              className={styles.chip}
              onClick={() => onFilterChange("all")}
            >
              Clear filter
              <X size={11} aria-hidden />
            </button>
          </>
        )}
        <span className={styles.legend} aria-label="Slot status legend">
          {SLOT_TILES.map((tile) => (
            <span key={tile.key} className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: SLOT_FILL[tile.key] }}
                aria-hidden
              />
              {tile.label}
            </span>
          ))}
        </span>
      </footer>
    </section>
  );
}
