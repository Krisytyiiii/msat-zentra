"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { BookOpen, GraduationCap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import type {
  AdvisorySectionItem,
  ClassPick,
  StudentListClassItem,
} from "@/services/teacher/studentList.types";
import styles from "./student-list.module.css";

const cardListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.05 },
  },
};

const cardItemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: (index: number = 0) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.45,
      ease: "easeOut",
      // Cap the per-card delay so large lists still feel snappy.
      delay: Math.min(index * 0.055, 0.35),
    },
  }),
};

function SectionCardButton({
  active,
  kind,
  title,
  grade,
  section,
  count,
  icon,
  onSelect,
  ariaLabel,
  index = 0,
  reduceMotion = false,
}: {
  active: boolean;
  kind: "advisory" | "class";
  title: string;
  grade: string;
  section?: string;
  count: number;
  icon: React.ReactNode;
  onSelect: () => void;
  ariaLabel: string;
  index?: number;
  reduceMotion?: boolean;
}) {
  const gradeValue = grade.replace(/^Grade\s+/i, "");
  return (
    <motion.li
      className="flex min-w-0"
      variants={cardItemVariants}
      custom={index}
      style={{ willChange: "transform, opacity" }}
    >
      {/* No hover tilt/glare: the card should stay still under the cursor. */}
      <GlassCard className="flex w-full min-w-0" disabled>
        <motion.button
          type="button"
          onClick={onSelect}
          aria-pressed={active}
          aria-label={ariaLabel}
          initial={false}
          whileTap={reduceMotion ? undefined : { scale: 0.985 }}
          transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.6 }}
          className={`${styles.sectionCard} ${active ? styles.sectionCardActive : ""}`}
        >
          <span className={styles.sectionCardHead}>
            <span className={styles.sectionCardHeading}>
              <span className={styles.sectionCardName} title={title}>
                {title}
              </span>
            </span>
            <span className={styles.sectionCardIcon} aria-hidden>
              {icon}
            </span>
          </span>

          <span className={styles.sectionCardMetrics}>
            <span className={styles.sectionCardMetric}>
              <span className={styles.sectionCardMetricLabel}>Students</span>
              <span className={`${styles.sectionCardMetricValue} tabular-nums`}>{count}</span>
              <span className={styles.sectionCardMetricHint}>
                {kind === "advisory" ? "advised learners" : "enrolled learners"}
              </span>
            </span>
            <span className={styles.sectionCardMetric}>
              <span className={styles.sectionCardMetricLabel}>Grade level</span>
              <span className={`${styles.sectionCardMetricValue} tabular-nums`}>
                {gradeValue}
              </span>
              <span className={styles.sectionCardMetricHint}>
                {kind === "advisory" ? "advisory section" : "subject class"}
              </span>
            </span>
          </span>

          <span className={styles.sectionCardFacts}>
            <span className={styles.sectionCardFact}>
              <span className={styles.sectionCardFactLabel}>Section</span>
              <span className={styles.sectionCardFactValue} title={section ?? title}>
                {section ?? title}
              </span>
            </span>
            <span className={styles.sectionCardFact}>
              <span className={styles.sectionCardFactLabel}>Type</span>
              <span className={styles.sectionCardFactValue}>
                {kind === "advisory" ? "Advisory" : "Subject"}
              </span>
            </span>
          </span>
        </motion.button>
      </GlassCard>
    </motion.li>
  );
}

export function SectionCards({
  advisorySections,
  classes,
  activePick,
  activeStudentCount,
  onSelect,
}: {
  advisorySections: AdvisorySectionItem[];
  classes: StudentListClassItem[];
  activePick: ClassPick | null;
  activeStudentCount: number;
  onSelect: (pick: ClassPick) => void;
}) {
  const empty = advisorySections.length === 0 && classes.length === 0;

  // Counts come straight from the response's per-section headcount; the
  // selected card keeps following the live list it just loaded.
  const resolveCount = (kind: ClassPick["kind"], id: string, headcount: number): number => {
    if (activePick?.kind === kind && activePick.id === id) return activeStudentCount;
    return headcount;
  };

  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section aria-label="Sections" className="flex min-w-0 flex-col gap-3">
      {empty ? (
        <p className="rounded-xl border border-border px-3 py-8 text-center text-xs text-muted-foreground">
          No sections for this term yet.
        </p>
      ) : (
        // Flat responsive grid — advisory and subject × section cards flow
        // horizontally like the principal academics section board instead of
        // stacking into grade/section kanban columns.
        <motion.ul
          className={styles.sectionCardGrid}
          variants={cardListVariants}
          initial={reduceMotion ? false : "hidden"}
          animate="show"
        >
          {advisorySections.map((s, i) => {
            const active = activePick?.kind === "advisory" && activePick.id === s.id;
            const count = resolveCount("advisory", s.id, s.studentCount);
            return (
              <SectionCardButton
                key={`advisory:${s.id}`}
                index={i}
                reduceMotion={reduceMotion}
                active={active}
                kind="advisory"
                title={s.name}
                grade={s.gradeLevel}
                count={count}
                icon={<GraduationCap size={13} aria-hidden />}
                onSelect={() => onSelect({ kind: "advisory", id: s.id })}
                ariaLabel={`Select advisory ${s.name}`}
              />
            );
          })}
          {classes.map((c, i) => {
            const active = activePick?.kind === "class" && activePick.id === c.id;
            const count = resolveCount("class", c.id, c.studentCount);
            return (
              <SectionCardButton
                key={`class:${c.id}`}
                index={advisorySections.length + i}
                reduceMotion={reduceMotion}
                active={active}
                kind="class"
                title={c.subject}
                grade={c.gradeLevel}
                section={c.section}
                count={count}
                icon={<BookOpen size={13} aria-hidden />}
                onSelect={() => onSelect({ kind: "class", id: c.id })}
                ariaLabel={`Select subject ${c.subject} in section ${c.section}`}
              />
            );
          })}
        </motion.ul>
      )}
    </section>
  );
}
