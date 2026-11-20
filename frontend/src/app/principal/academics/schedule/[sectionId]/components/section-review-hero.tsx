"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { scheduleTone } from "@/lib/labels/status-tone";
import type { Submission } from "./use-principal-schedule-section";
import styles from "./section-review-hero.module.css";

interface StatusMeta {
  title: string;
  message: string;
  Icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

/**
 * Section identity strip for the principal's read-only timetable view. The
 * administrator desk publishes the grid; the principal only inspects it.
 */
export function SectionReviewHero({
  submission,
  statusMeta,
  counts,
  emptyCount,
}: {
  submission: Submission;
  statusMeta: StatusMeta;
  counts: { total: number; published: number };
  emptyCount: number;
}) {
  const StatusIcon = statusMeta.Icon;
  const statusKey = statusMeta.title.toLowerCase();
  const teacher = submission.adviser?.fullName ?? null;
  const gradeNumber = submission.gradeLevel.replace("G", "");

  return (
    <section className={styles.hero} aria-label={`${submission.name} timetable`}>
      <header className={styles.head}>
        <span className={styles.headTitle}>
          <span className={styles.iconChip} aria-hidden>
            <CalendarDays size={13} />
          </span>
          Section timetable
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
                  label="Adviser"
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
        </div>

        <div className={styles.sep} aria-hidden />

        <div className={styles.right}>
          <div className={styles.blockHead}>
            <span>Coverage</span>
            <span className={styles.blockHint}>Published slots for the selected term</span>
          </div>
          <p className={styles.emptyLine}>
            <strong>{counts.total}</strong> published slot
            {counts.total === 1 ? "" : "s"} ·{" "}
            <strong>{emptyCount}</strong> weekly slot{emptyCount === 1 ? "" : "s"} empty
          </p>
        </div>
      </div>
    </section>
  );
}
