"use client";

import type { KeyboardEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { formatStatus } from "@/lib/labels/text";
import { riskTone } from "@/lib/labels/status-tone";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import type {
  AdvisoryInterventionRow,
  AdvisoryInterventionSession,
} from "@/services/teacher/interventions.service";
import styles from "./interventions.module.css";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Active risk factors shown on the row — compact codes only, full names in
 *  the tooltip, so the factors column never wraps into a second line. */
const FACTORS = [
  { key: "academic", label: "Academic", code: "ACA", tone: "amber" },
  { key: "attendance", label: "Attendance", code: "ATT", tone: "sky" },
  { key: "behavioral", label: "Anecdotal", code: "ANE", tone: "rose" },
] as const;

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? dateFmt.format(date) : "—";
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Next booked session (falling back to the most recent one). */
export function focusSession(
  sessions: AdvisoryInterventionSession[],
): AdvisoryInterventionSession | null {
  if (sessions.length === 0) return null;
  const now = Date.now();
  return (
    sessions.find(
      (session) =>
        session.status === "scheduled" &&
        new Date(session.scheduledAt).getTime() >= now,
    ) ??
    sessions[sessions.length - 1] ??
    null
  );
}

/**
 * Guidance-desk pipeline label, read-only. Same vocabulary as the guidance
 * board so an adviser sees the exact state the counselling desk sees.
 */
export function advisoryPipelineStatus(row: AdvisoryInterventionRow): {
  label: string;
  tone: PillTone;
} {
  const intervention = row.intervention;
  const doneCount =
    intervention?.sessions.filter((session) => session.status === "completed").length ?? 0;
  const scheduledCount =
    intervention?.sessions.filter((session) => session.status === "scheduled").length ?? 0;

  if (!intervention) return { label: "No plan yet", tone: "neutral" };
  if (intervention.outcomeStatus === "resolved") return { label: "Done", tone: "green" };
  if (intervention.outcomeStatus === "unresolved")
    return { label: "Discontinued", tone: "neutral" };
  if (row.riskLevel === "Low") return { label: "No longer at risk", tone: "neutral" };
  if (intervention.sessions.length === 0)
    return { label: "No action yet", tone: "neutral" };
  if (scheduledCount > 0 && doneCount > 0)
    return { label: "Follow-up session", tone: "blue" };
  if (scheduledCount > 0) return { label: "Booked session", tone: "blue" };
  if (doneCount > 0) return { label: "Session done", tone: "green" };
  return { label: "No action yet", tone: "neutral" };
}

export function InterventionRowCard({
  row,
  index = 0,
  now,
  onOpen,
}: {
  row: AdvisoryInterventionRow;
  index?: number;
  now: number;
  onOpen: (row: AdvisoryInterventionRow) => void;
}) {
  const status = advisoryPipelineStatus(row);
  const activeFactors = FACTORS.filter((factor) => row.factors[factor.key]);
  const sessions = row.intervention?.sessions ?? [];
  const doneCount = sessions.filter((session) => session.status === "completed").length;
  const bookedCount = sessions.filter((session) => session.status === "scheduled").length;
  const detectedMs = row.detectedAt ? msSinceDate(row.detectedAt, now) : null;
  const detectedElapsed =
    detectedMs === null
      ? "—"
      : detectedMs < 60_000
        ? "just now"
        : `${formatElapsedShort(detectedMs)} ago`;

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(row);
    }
  };

  return (
    <li
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
      className={`${styles.row} ${styles[riskAccentClass(row.riskLevel)]}`}
      onClick={() => onOpen(row)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${row.name}'s intervention case`}
    >
      <div className={`${styles.cell} ${styles.cellPerson}`}>
        <StudentMascot
          name={row.name}
          seed={row.lrn}
          character={row.mascot ?? undefined}
          size={30}
        />
        <div className={styles.personText}>
          <p className={styles.personName} title={row.name}>
            {row.name}
          </p>
          <span className={styles.personLrn}>{row.lrn || "—"}</span>
        </div>
      </div>

      <div className={`${styles.cell} ${styles.cellRisk}`}>
        <Pill tone={riskTone(row.riskLevel)} label="Risk level">
          {row.riskLevel}
        </Pill>
      </div>

      <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellSection}`}>
        <span className={styles.cellValue}>{row.gradeLevel}</span>
        <span className={styles.cellMuted}>{row.section}</span>
      </div>

      <div className={`${styles.cell} ${styles.cellFactors}`}>
        {activeFactors.length > 0 ? (
          activeFactors.map((factor) => (
            <Pill
              key={factor.key}
              tone={factor.tone}
              label={`${factor.label} risk factor`}
              className={styles.factorPill}
            >
              {factor.code}
            </Pill>
          ))
        ) : (
          <span className={styles.cellMuted} title="No active risk factor">
            None
          </span>
        )}
      </div>

      <div className={`${styles.cell} ${styles.cellStatus}`}>
        <Pill tone={status.tone} label="Pipeline status">
          {status.label}
        </Pill>
      </div>

      <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellSessions}`}>
        <span className={styles.cellValue}>{doneCount} done</span>
        <span className={styles.cellMuted}>{bookedCount} booked</span>
      </div>

      <div className={`${styles.cell} ${styles.cellMetaRow} ${styles.cellFlagged}`}>
        <span className={styles.cellLabel}>Flagged</span>
        <span className={styles.cellValue}>{detectedElapsed}</span>
      </div>

      <div className={`${styles.cell} ${styles.cellAction}`}>
        <Button
          variant="outline"
          className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
          aria-label={`View ${row.name}'s case`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(row);
          }}
        >
          <ArrowUpRight size={12} className="text-amber-500" aria-hidden />
          View case
        </Button>
      </div>
    </li>
  );
}

/** Left risk accent painted on the row — High red, Moderate amber, Low neutral. */
function riskAccentClass(level: string): "rowHigh" | "rowModerate" | "rowLow" {
  if (level === "High") return "rowHigh";
  if (level === "Moderate") return "rowModerate";
  return "rowLow";
}

export function approvalTone(status: string) {
  if (status === "approved") return "green" as const;
  if (status === "rejected") return "red" as const;
  if (status === "modified") return "blue" as const;
  return "amber" as const;
}

export function sessionStatusTone(status: string) {
  if (status === "completed") return "green" as const;
  if (status === "cancelled") return "red" as const;
  return "blue" as const;
}

export { formatStatus, formatDateTime, sessionTypeLabel };
