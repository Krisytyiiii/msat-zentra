"use client";

import * as React from "react";
import { ChevronRight, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { anecdotalCategoryPillClass } from "@/lib/labels/anecdotal";
import { formatElapsedShort, msSinceDate, useNowTick } from "@/lib/clock";
import type { NurseAlertItem } from "@/services/nurse/nurse.types";
import { deriveActionStatus } from "@/services/nurse/labels";
import { NurseCaseDetailDialog } from "../../alerts/components/NurseCaseDetailDialog";
import cascade from "@/components/shared/desk-cascade.module.css";
import styles from "./NurseAlertsTable.module.css";

/* Action status key → plain text colour (same semantics as the status chips,
   same palette as /nurse/alerts). */
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

/**
 * Nurse case data list — the same table anatomy as the guidance ADM /
 * counseling desks (`guidance-cases-table`): a muted column head, clickable
 * hairline rows and a chevron. Clicking a row opens the shared nurse case
 * drawer with the whole case (referral details, sessions, review actions).
 */
export function NurseCasesTable({
  alerts,
  highlightId,
  onChanged,
}: {
  alerts: NurseAlertItem[];
  highlightId: string | null;
  onChanged: () => void;
}) {
  // Hold the open row's id, not the row object: the board refetches live, so a
  // captured object would pin the drawer to the pre-refresh status.
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const now = useNowTick();

  const activeAlert = React.useMemo(
    () => (activeId ? alerts.find((a) => a.row.id === activeId) ?? null : null),
    [activeId, alerts]
  );

  return (
    <>
      <div className={styles.tableWrap}>
        <Table className={`${cascade.table} w-full table-fixed`}>
          <TableHeader>
            <TableRow className="bg-muted/50 [&>th]:border-t-0">
              <TableHead style={{ width: 140 }} className="h-10 truncate">
                Concern
              </TableHead>
              <TableHead style={{ width: 240 }} className="h-10 truncate">
                Learner
              </TableHead>
              <TableHead style={{ width: 150 }} className="h-10 truncate">
                Grade &amp; section
              </TableHead>
              <TableHead style={{ width: 110 }} className="h-10 truncate">
                Sessions
              </TableHead>
              <TableHead style={{ width: 150 }} className="h-10 truncate">
                Status
              </TableHead>
              <TableHead style={{ width: 120 }} className="h-10 truncate">
                Referred
              </TableHead>
              <TableHead style={{ width: 44 }} className="h-10" aria-hidden />
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((alert) => {
              const row = alert.row;
              const doneCount = row.sessions.filter(
                (s) => s.status === "completed"
              ).length;
              const bookedCount = row.sessions.filter(
                (s) => s.status === "scheduled"
              ).length;
              const status = deriveActionStatus(
                row.type,
                row.status,
                row.sessions,
                row.dismissedByRole
              );
              const referredRaw = row.referredAt || row.date || "";
              const referredMs = referredRaw ? msSinceDate(referredRaw, now) : null;
              const highlighted = highlightId !== null && highlightId === row.id;
              const category =
                row.category?.trim() && row.category !== "—"
                  ? row.category
                  : row.type === "ADM"
                    ? "ADM case"
                    : "Clinic case";

              return (
                <TableRow
                  key={alert.key}
                  id={`nurse-case-${row.id}`}
                  onClick={() => setActiveId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveId(row.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Open case details for ${row.student}`}
                  className={`${styles.admRow}${highlighted ? ` ${styles.admRowHighlight}` : ""}`}
                >
                  <TableCell className="truncate">
                    <span
                      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[12px] font-semibold capitalize ${
                        anecdotalCategoryPillClass(row.category) ??
                        "border-border bg-muted text-muted-foreground"
                      }`}
                      title={`Concern: ${category}`}
                    >
                      {category}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span className="flex min-w-0 items-center gap-2">
                      <StudentMascot
                        name={row.student}
                        seed={row.lrn}
                        character={row.mascot ?? undefined}
                        size={28}
                      />
                      <span className="min-w-0">
                        <span
                          className="block truncate text-[13px] font-semibold text-primary"
                          title={row.student}
                        >
                          {row.student}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] tabular-nums text-muted-foreground">
                          {row.lrn || "—"}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span className="block truncate text-[12px] font-medium text-foreground">
                      {row.grade || "—"}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {row.section || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span className="block text-[12px] font-medium text-foreground">
                      {doneCount} done
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {bookedCount} booked
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span
                      className={`text-[12px] font-semibold ${STATUS_TEXT[status.key] ?? "text-foreground"}`}
                      title="Status"
                    >
                      {status.label}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <span
                      className={styles.elapsedPill}
                      title={
                        referredMs === null
                          ? "Referred time unknown"
                          : `Referred ${formatElapsedShort(referredMs)} ago`
                      }
                    >
                      <Clock size={11} aria-hidden />
                      {referredMs === null
                        ? "—"
                        : `${formatElapsedShort(referredMs)} ago`}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    <ChevronRight
                      size={15}
                      className="text-muted-foreground"
                      aria-hidden
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <NurseCaseDetailDialog
        key={activeAlert?.key ?? "none"}
        alert={activeAlert}
        riskLevel={undefined}
        onClose={() => setActiveId(null)}
        onChanged={onChanged}
      />
    </>
  );
}
