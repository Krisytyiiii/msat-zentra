"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  ListChecks,
  Lock,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { gradebookSlug } from "@/lib/gradebookSlug";
import type { LockGradesClassRow } from "@/services/teacher/lockGrades.service";
// The lock board reuses the gradebook card design token-for-token (material,
// header, progress rail, facts and action row) so the two desks read the same.
import styles from "@/app/teacher/grading/components/GradebookCards.module.css";

/** Grade rows arrive as "G7" or "Grade 7" — show the bare digit only. */
function gradeDigit(gradeLevel: string): string {
  return gradeLevel.replace(/\D/g, "") || gradeLevel;
}

function ClassCard({ row, index }: { row: LockGradesClassRow; index: number }) {
  const total = row.learners;
  const locked = row.locked + row.approved;
  const complete = total > 0 && locked >= total;
  const pct = total > 0 ? Math.round((locked / total) * 100) : 0;

  return (
    <article
      className={`${styles.card} ${complete ? styles.cardComplete : ""}`}
      aria-label={`${row.subject}, ${row.section}, Grade ${gradeDigit(row.gradeLevel)}`}
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
    >
      <header className={styles.cardHead}>
        <StudentMascot name={row.subject} seed={row.id} size={44} />
        <div className={styles.cardId}>
          <span className={styles.subjectName} title={row.subject}>
            {row.subject}
          </span>
          <span className={styles.section} title={row.section}>
            Section {row.section}
          </span>
        </div>
        <span className={styles.gradeText}>Grade {gradeDigit(row.gradeLevel)}</span>
      </header>

      <div className={styles.metaRow}>
        {complete ? (
          <span className={styles.statusText} data-tone="green">
            <Check size={12} aria-hidden />
            All finals locked
          </span>
        ) : locked > 0 ? (
          <span className={styles.statusText} data-tone="amber">
            Locking in progress
          </span>
        ) : (
          <span className={styles.statusText} data-tone="neutral">
            Not locked yet
          </span>
        )}
      </div>

      <div
        className={styles.progress}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${locked} of ${total} finals locked`}
      >
        <span
          className={`${styles.progressFill} ${complete ? styles.progressDone : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={styles.progressLine}>
        {locked} of {total} finals locked
      </p>

      <div className={styles.linksRow}>
        <span className={styles.linkStat}>
          <Users size={11} aria-hidden />
          {total} learner{total === 1 ? "" : "s"}
        </span>
        <span className={styles.linkStat}>
          <ClipboardCheck size={11} aria-hidden />
          {row.computed} computed
        </span>
        <span className={styles.linkStat}>
          <ListChecks size={11} aria-hidden />
          {row.ready} ready
        </span>
      </div>

      <div className={styles.cardActions}>
        <span className={styles.hint}>
          <Lock size={11} aria-hidden />
          <span>
            {complete
              ? "Every final is locked"
              : row.ready > 0
                ? `${row.ready} ready to lock`
                : "Waiting on computed finals"}
          </span>
        </span>
        <Button
          asChild
          variant="outline"
          className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
        >
          <Link
            href={`/teacher/grading/${gradebookSlug(row)}`}
            aria-label={`Open gradebook for ${row.subject}, ${row.section}`}
          >
            Open gradebook
            <ChevronRight size={12} aria-hidden />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function LockGradesClassCards({ rows }: { rows: LockGradesClassRow[] }) {
  return (
    <div className={styles.grid} role="group" aria-label="Lock grades subjects">
      {rows.map((row, index) => (
        <ClassCard key={row.id} row={row} index={index} />
      ))}
    </div>
  );
}

/** Loading state: the same card anatomy as the live grid, swept by the shared
 *  shimmer group so the swap to real rows causes no layout shift. */
export function LockGradesCardsSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <ShimmerGroup>
      <div className={styles.grid} role="status" aria-label="Loading lock grades" aria-busy="true">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className={styles.card} aria-hidden>
            <header className={styles.cardHead}>
              <Skeleton className={styles.skelAvatar} />
              <div className={styles.cardId}>
                <Skeleton className={styles.skelName} />
                <Skeleton className={styles.skelSection} />
              </div>
              <Skeleton className={styles.skelGrade} />
            </header>

            <div className={styles.metaRow}>
              <Skeleton className={styles.skelStatus} />
            </div>

            <div className={styles.progress}>
              <Skeleton className={styles.skelBarFill} style={{ width: "45%" }} />
            </div>
            <Skeleton className={styles.skelLine} />

            <div className={styles.linksRow}>
              <Skeleton className={styles.skelStat} />
              <Skeleton className={styles.skelStat} />
              <Skeleton className={styles.skelStatShort} />
            </div>

            <div className={styles.cardActions}>
              <Skeleton className={styles.skelHint} />
              <Skeleton className={styles.skelBtn} />
            </div>
          </div>
        ))}
      </div>
    </ShimmerGroup>
  );
}
