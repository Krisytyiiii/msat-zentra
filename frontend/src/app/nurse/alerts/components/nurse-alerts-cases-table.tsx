"use client";
import * as React from "react";
import {
  AlertsCasesTable,
  type AlertsTypeOption,
  type AlertsTableRow,
} from "@/components/desk-alerts/alerts-table";
import type { NurseAlertItem, NurseRiskLevel } from "@/services/nurse/nurse.types";
import { deriveActionStatus } from "@/services/nurse/labels";
import { msSinceDate, useNowTick } from "@/lib/clock";
import { NurseCaseDetailDialog } from "./NurseCaseDetailDialog";

/** Case-type filter — matches the guidance alerts tabs (All / ADM / Clinic). */
export type TypeTrack = "" | "ADM" | "Clinic";

const TYPE_OPTIONS: AlertsTypeOption[] = [
  { value: "", label: "All", tone: "neutral" },
  { value: "ADM", label: "ADM", tone: "blue" },
  { value: "Clinic", label: "Clinic", tone: "amber" },
];

/** Status key → plain text colour (same semantics as the status pill). */
const STATUS_TEXT: Record<string, string> = {
  needs_review: "text-amber-600 dark:text-amber-400",
  booked: "text-blue-600 dark:text-blue-400",
  followup: "text-blue-600 dark:text-blue-400",
  endorsed: "text-emerald-600 dark:text-emerald-400",
  done: "text-emerald-600 dark:text-emerald-400",
  done_session: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-red-600 dark:text-red-400",
  cancelled: "text-red-600 dark:text-red-400",
  escalated: "text-red-600 dark:text-red-400",
};

/** Search + type-tab predicate, shared with the page so `pageFit` flips on
    the same keystroke the empty callout appears. */
export function matchesAlertFilters(
  alert: NurseAlertItem,
  query: string,
  type: TypeTrack,
) {
  if (type !== "" && alert.row.type !== type) return false;
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return `${alert.row.student} ${alert.row.lrn} ${alert.row.section} ${alert.row.reason} ${alert.row.category}`
    .toLowerCase()
    .includes(needle);
}

function toTableRow(
  alert: NurseAlertItem,
  riskLevel: NurseRiskLevel | undefined,
  riskLoading: boolean,
  now: number,
): AlertsTableRow {
  const row = alert.row;
  const status = deriveActionStatus(
    row.type,
    row.status,
    row.sessions,
    row.dismissedByRole,
  );
  const referredRaw = row.referredAt || row.date || "";
  return {
    key: alert.key,
    typeLabel: row.type === "ADM" ? "ADM" : "Clinic",
    typeTone: row.type === "ADM" ? "blue" : "amber",
    student: row.student,
    lrn: row.lrn,
    mascot: row.mascot,
    grade: row.grade,
    section: row.section,
    statusLabel: status.label,
    statusTone: STATUS_TEXT[status.key] ?? "text-foreground",
    riskLevel,
    riskLoading,
    elapsedMs: referredRaw ? msSinceDate(referredRaw, now) : null,
    elapsedLabel: "Referred",
    searchText: `${row.student} ${row.lrn} ${row.section} ${row.reason} ${row.category}`.toLowerCase(),
  };
}

/**
 * Nurse referred-cases board — the shared alerts table (same toolbar, columns,
 * rows, empty states and pager as /guidance/alerts), with the nurse desk's data
 * and the shared case drawer.
 */
export function NurseAlertsCasesTable({
  rows,
  riskByStudent,
  riskLoading = false,
  query,
  type,
  onQueryChange,
  onTypeChange,
  onChanged,
}: {
  rows: NurseAlertItem[];
  riskByStudent: Record<string, NurseRiskLevel>;
  riskLoading?: boolean;
  query: string;
  type: TypeTrack;
  onQueryChange: (next: string) => void;
  onTypeChange: (next: TypeTrack) => void;
  onChanged: () => void;
}) {
  const now = useNowTick();
  const tableRows = React.useMemo(
    () =>
      rows.map((alert) =>
        toTableRow(
          alert,
          alert.studentId ? riskByStudent[alert.studentId] : undefined,
          riskLoading,
          now,
        ),
      ),
    [rows, riskByStudent, riskLoading, now],
  );

  return (
    <AlertsCasesTable
      rows={tableRows}
      type={type}
      typeOptions={TYPE_OPTIONS}
      query={query}
      onQueryChange={onQueryChange}
      onTypeChange={(next) => onTypeChange(next as TypeTrack)}
      emptyAll={
        <>
          <strong>No referred cases.</strong> New ADM and clinic cases will
          appear here.
        </>
      }
      renderDrawer={(activeKey, close) => {
        const alert = activeKey
          ? rows.find((row) => row.key === activeKey) ?? null
          : null;
        return (
          <NurseCaseDetailDialog
            key={alert?.key ?? "none"}
            alert={alert}
            riskLevel={
              alert?.studentId ? riskByStudent[alert.studentId] : undefined
            }
            onClose={close}
            onChanged={onChanged}
          />
        );
      }}
    />
  );
}
