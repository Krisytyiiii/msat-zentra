"use client";

import * as React from "react";
import { ArrowUpRight, CircleDashed, ClipboardCheck, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClassDetail } from "@/services/teacher/grading.service";
import type { LockGradesClassRow } from "@/services/teacher/lockGrades.service";
import styles from "./lock-grades.module.css";

const statusLabel: Record<string, string> = {
  unlocked: "Unlocked",
  locked: "Locked",
  adviser_approved: "Adviser approved",
};

function statusTone(status: string | null | undefined): PillTone {
  if (status === "adviser_approved") return "green";
  if (status === "locked") return "amber";
  if (status === "unlocked") return "sky";
  return "neutral";
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function LearnerRows({ assignmentId }: { assignmentId: string }) {
  const detail = useClassDetail(assignmentId);

  if (detail.isPending) {
    return (
      <div className={styles.learners} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.learnerRow}>
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="ml-auto h-3.5 w-8" />
            <Skeleton className="ml-auto h-3.5 w-8" />
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return <p className={styles.error}>Could not load this class&apos;s learners.</p>;
  }

  if (detail.data.students.length === 0) {
    return <p className={`${styles.muted} ${styles.center}`}>No learners in this section yet.</p>;
  }

  return (
    <div className={styles.learners} role="table" aria-label="Class learners">
      <div className={styles.learnersHead} role="row">
        <span role="columnheader">Learner</span>
        <span className={styles.num} role="columnheader">Computed</span>
        <span className={styles.num} role="columnheader">Grade</span>
        <span role="columnheader">Status</span>
      </div>
      {detail.data.students.map((student) => {
        const final = student.final;
        const status = final?.lockStatus ?? null;
        return (
          <div key={student.id} className={styles.learnerRow} role="row">
            <span className={styles.learnerName} title={student.name} role="cell">
              {student.name}
            </span>
            <span className={`${styles.num} ${styles.muted}`} role="cell">
              {final?.computedAverage != null ? final.computedAverage.toFixed(2) : "—"}
            </span>
            <span className={styles.num} role="cell">
              {final?.transmutedGrade != null ? final.transmutedGrade : "—"}
            </span>
            <span className={styles.pills} role="cell">
              <Pill tone={statusTone(status)} label="Lock status">
                {status ? statusLabel[status] ?? status : "No grade"}
              </Pill>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function LockGradesClassCard({
  row,
}: {
  row: LockGradesClassRow;
}) {
  const [open, setOpen] = React.useState(false);
  const total = row.learners;
  const nothingReady = row.ready === 0 && row.locked === 0 && row.approved === 0;

  return (
    <article className={styles.card} aria-label={`${row.subject}, ${row.section}`}>
      <header className={styles.cardHead}>
        <StudentMascot name={row.subject} seed={row.id} size={36} />
        <div className={styles.cardId}>
          <span className={styles.cardTitle} title={row.subject}>
            {row.subject}
          </span>
          <span className={styles.cardMeta} title={`${row.section} · ${row.subjectCode}`}>
            {row.section} · {total} learner{total === 1 ? "" : "s"}
          </span>
        </div>
        <Pill field="grade" className={styles.gradePill}>
          {row.gradeLevel}
        </Pill>
      </header>

      <div className={styles.metaRow}>
        <Pill tone="neutral" label="Subject code">
          {row.subjectCode}
        </Pill>
        <Pill tone="sky" label="Ready to lock">
          {row.ready} ready
        </Pill>
        <Pill tone="amber" label="Locked, awaiting approval">
          {row.locked} locked
        </Pill>
        {row.approved > 0 ? (
          <Pill tone="green" label="Approved by the adviser">
            {row.approved} approved
          </Pill>
        ) : null}
      </div>

      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={styles.progress}
              tabIndex={0}
              role="img"
              aria-label={`${row.ready} ready, ${row.locked} locked, ${row.approved} approved`}
            >
              <span className={styles.segReady} style={{ width: `${pct(row.ready, total)}%` }} />
              <span className={styles.segLocked} style={{ width: `${pct(row.locked, total)}%` }} />
              <span className={styles.segApproved} style={{ width: `${pct(row.approved, total)}%` }} />
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            sideOffset={6}
            className="border-0 bg-transparent p-0 text-inherit shadow-none [&>svg]:hidden"
          >
            <ChartTooltip
              active
              label="Grade lock progress"
              payload={[
                { name: "Ready", value: row.ready, payload: { fill: "#0ea5e9" } },
                { name: "Locked", value: row.locked, payload: { fill: "#f59e0b" } },
                { name: "Approved", value: row.approved, payload: { fill: "#22c55e" } },
              ]}
            />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <p className={styles.progressLine}>
        {row.computed} of {total} learner{total === 1 ? "" : "s"} with a computed grade
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
          <Lock size={11} aria-hidden />
          {row.locked + row.approved} locked
        </span>
      </div>

      {nothingReady ? (
        <p className={`${styles.notice} ${styles.noticeNeutral}`}>
          <CircleDashed size={12} aria-hidden />
          Nothing ready to lock yet — no computed final grades in this class.
        </p>
      ) : null}

      <div className={styles.cardActions}>
        <span className={styles.lockedHint}>
          <Lock size={11} aria-hidden />
          Read-only desk
        </span>
        <Button
          variant="outline"
          className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
          onClick={() => setOpen(true)}
        >
          View learners
          <ArrowUpRight size={12} aria-hidden />
        </Button>
      </div>

      <KanbanOverlay
        open={open}
        onClose={() => setOpen(false)}
        title={`${row.subject} — ${row.section}`}
        ariaLabel={`${row.subject} learners`}
        icon={
          <span className="text-amber-600 dark:text-amber-400" aria-hidden>
            <Users size={14} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Pill field="grade" label="Grade level">
              {row.gradeLevel}
            </Pill>
            <Pill tone="neutral" label="Learners">
              {row.learners} learner{row.learners === 1 ? "" : "s"}
            </Pill>
            <Pill tone="sky" label="Ready to lock">
              {row.ready} ready to lock
            </Pill>
          </span>
        }
        width="xl"
      >
        {open ? <LearnerRows assignmentId={row.id} /> : null}
      </KanbanOverlay>
    </article>
  );
}
