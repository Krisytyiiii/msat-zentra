"use client";

import Link from "next/link";
import { BookOpen, Check, ChevronRight, ClipboardList, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { gradebookSlug } from "@/lib/gradebookSlug";
import type {
  ClassAverageRow,
  SubjectAssessmentRow,
  TeacherClassRow,
} from "@/services/teacher/overview.types";
import styles from "./GradebookCards.module.css";

type Props = {
  classes: TeacherClassRow[];
  assessments: SubjectAssessmentRow[];
  standings: ClassAverageRow[];
};

/** "G7" → "Grade 7"; leaves already-spelled labels alone. */
function gradeLabel(grade: string): string {
  return /^G\d/i.test(grade) ? `Grade ${grade.slice(1)}` : grade;
}

export function GradebookCards({ classes, assessments, standings }: Props) {
  if (classes.length === 0) {
    return (
      <p className={styles.empty}>
        No classes assigned yet — ask your registrar to assign your subjects and sections first.
      </p>
    );
  }

  return (
    <div className={styles.grid} role="group" aria-label="Gradebook subjects">
      {classes.map((c, i) => {
        // Class ids are `${subjectId}|${sectionId}` in gradebook scope —
        // match added assessments by IDs when present so shared-subject
        // sections never collapse to 0. Fall back to names for legacy rows.
        const [classSubjectId, classSectionId] = c.id.includes("|")
          ? c.id.split("|")
          : [];
        const classAssessments = assessments.filter((a) => {
          if (a.subjectId && a.sectionId && classSubjectId && classSectionId) {
            return a.subjectId === classSubjectId && a.sectionId === classSectionId;
          }
          return a.subject === c.subject && a.section === c.section;
        });
        const assessmentCount = classAssessments.length;
        // Progress = students graded per added assessment:
        // scored entries across added assessments over
        // (added assessments × students). Falls back to final-standings
        // only for legacy rows without scored counts.
        const hasScoredData = classAssessments.some((a) => typeof a.scored === "number");
        const totalScored = classAssessments.reduce(
          (n, a) => n + (typeof a.scored === "number" ? a.scored : 0),
          0,
        );
        const totalPossible = assessmentCount * c.studentCount;
        const standing =
          standings.find((s) => s.subject === c.subject && s.section === c.section) ?? null;
        const pct = hasScoredData
          ? totalPossible > 0
            ? Math.round((totalScored / totalPossible) * 100)
            : 0
          : standing && standing.students > 0
            ? Math.round((standing.assessed / standing.students) * 100)
            : 0;
        const progressLabel = hasScoredData
          ? `${totalScored} of ${totalPossible} graded`
          : `${standing?.assessed ?? 0} of ${standing?.students ?? c.studentCount} assessed`;
        const complete = assessmentCount > 0 && pct >= 100;
        return (
          <article
            key={c.id}
            className={`${styles.card} ${complete ? styles.cardComplete : ""}`}
            aria-label={`${c.subject}, ${c.section}, ${c.gradeLevel}`}
            style={{ animationDelay: `${Math.min(i, 11) * 35}ms` }}
          >
            <header className={styles.cardHead}>
              <StudentMascot name={c.subject} seed={c.id} size={44} />
              <div className={styles.cardId}>
                <span className={styles.subjectName} title={c.subject}>
                  {c.subject}
                </span>
                <span className={styles.section} title={c.section}>
                  Section {c.section}
                </span>
              </div>
              <span className={styles.gradeText}>{gradeLabel(c.gradeLevel)}</span>
            </header>

            <div className={styles.metaRow}>
              {complete ? (
                <span className={styles.statusText} data-tone="green">
                  <Check size={12} aria-hidden />
                  Fully graded
                </span>
              ) : pct > 0 ? (
                <span className={styles.statusText} data-tone="amber">
                  In progress
                </span>
              ) : (
                <span className={styles.statusText} data-tone="neutral">
                  Not started
                </span>
              )}
            </div>

            <div
              className={styles.progress}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={progressLabel}
            >
              <span
                className={`${styles.progressFill} ${complete ? styles.progressDone : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className={styles.progressLine}>{progressLabel}</p>

            <div className={styles.linksRow}>
              <span className={styles.linkStat}>
                <BookOpen size={11} aria-hidden />
                {assessmentCount} assessment{assessmentCount === 1 ? "" : "s"}
              </span>
              <span className={styles.linkStat}>
                <Users size={11} aria-hidden />
                {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
              </span>
              <span className={styles.linkStat}>
                <ClipboardList size={11} aria-hidden />
                {pct}% graded
              </span>
            </div>

            <div className={styles.cardActions}>
              <span className={styles.hint}>
                <ClipboardList size={11} aria-hidden />
                <span>
                  {assessmentCount === 0
                    ? "No assessments yet"
                    : complete
                      ? "All scores encoded"
                      : "Encoding in progress"}
                </span>
              </span>
              <Button
                asChild
                variant="outline"
                className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
              >
                <Link
                  href={`/teacher/grading/${gradebookSlug(c)}`}
                  aria-label={`Open gradebook for ${c.subject}, ${c.section}`}
                >
                  Open gradebook
                  <ChevronRight size={12} aria-hidden />
                </Link>
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Loading state for the gradebook grid: the same elevated card anatomy as
 *  `GradebookCards` (mascot, subject + section, grade, status line, progress
 *  rail, facts row, action row) so the swap to live data causes no shift. */
export function GradebookCardsSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <ShimmerGroup>
      <div className={styles.grid} role="status" aria-label="Loading gradebook" aria-busy="true">
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
