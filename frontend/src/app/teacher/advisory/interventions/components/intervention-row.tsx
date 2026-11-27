"use client";

import type { KeyboardEvent } from "react";
import { Eye } from "lucide-react";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatStatus } from "@/lib/labels/text";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import { formatSurnameFirst } from "@/lib/names";
import type {
  AdvisoryInterventionRow,
  AdvisoryInterventionSession,
} from "@/services/teacher/interventions.service";
import listStyles from "../../list/components/advisory-list.module.css";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Active risk factors shown on the row — full label, one accent per factor. */
const FACTORS = [
  {
    key: "academic",
    label: "Academic",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "attendance",
    label: "Attendance",
    text: "text-sky-600 dark:text-sky-400",
  },
  {
    key: "behavioral",
    label: "Anecdotal",
    text: "text-rose-600 dark:text-rose-400",
  },
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

export function InterventionTableRow({
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(row);
    }
  };

  return (
    <TableRow
      style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
      onClick={() => onOpen(row)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`${row.name}'s intervention case`}
      className={listStyles.row}
    >
      <TableCell>
        <div className="flex min-w-0 items-center gap-2">
          <StudentMascot
            name={row.name}
            seed={row.lrn}
            character={row.mascot ?? undefined}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <span
              className="block truncate text-[13px] font-semibold text-primary"
              title={row.name}
            >
              {formatSurnameFirst(row.name)}
            </span>
            <span
              className="mt-0.5 block max-w-full truncate font-mono text-[12px] tabular-nums text-muted-foreground"
              title={`LRN ${row.lrn}`}
            >
              {row.lrn || "—"}
            </span>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <span
          className={`text-[12px] font-semibold ${
            row.riskLevel === "High"
              ? "text-red-600 dark:text-red-400"
              : row.riskLevel === "Moderate"
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
          }`}
          title={`Risk level: ${row.riskLevel}`}
        >
          {row.riskLevel}
        </span>
      </TableCell>

      <TableCell>
        {activeFactors.length > 0 ? (
          <span className="flex flex-wrap items-center gap-x-1 text-[12px] font-medium">
            {activeFactors.map((factor, index) => (
              <span key={factor.key} className="inline-flex items-center gap-x-1">
                {index > 0 ? (
                  <span aria-hidden className="text-border">
                    |
                  </span>
                ) : null}
                <span className={factor.text}>{factor.label}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground" title="No active risk factor">
            None
          </span>
        )}
      </TableCell>

      <TableCell>
        <Pill tone={status.tone} label="Pipeline status">
          {status.label}
        </Pill>
      </TableCell>

      <TableCell>
        <span className="block text-[12px] text-foreground tabular-nums">
          {doneCount} done
        </span>
        <span className="block text-[12px] text-muted-foreground tabular-nums">
          {bookedCount} booked
        </span>
      </TableCell>

      <TableCell>
        <span className="text-[12px] text-foreground tabular-nums">{detectedElapsed}</span>
      </TableCell>

      <TableCell>
        <div className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`View ${row.name}'s case`}
            title="View case"
            onClick={() => onOpen(row)}
          >
            <Eye size={13} aria-hidden />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
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
