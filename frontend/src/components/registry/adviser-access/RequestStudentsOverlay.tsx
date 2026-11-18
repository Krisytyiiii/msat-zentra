"use client";

import * as React from "react";
import { CheckCircle2, FileSearch, Users } from "lucide-react";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  formatRelativeTime,
  toBoardStudents,
  type AdviserAccessRequest,
  type BoardStudent,
} from "@/components/shared/adviser-access/adviser-access-types";

const STATE: Record<BoardStudent["state"], { label: string; tone: PillTone }> = {
  pendingChecking: { label: "Unchecked", tone: "neutral" },
  awaiting: { label: "Awaiting decision", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  reported: { label: "Reported", tone: "red" },
};

function SummaryStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

/**
 * Read-only peek at one pending adviser request: the learners that request
 * covers. Opened by clicking a request card — it never scopes the workbench
 * below, so the full learner table stays exactly as it was.
 */
export function RequestStudentsOverlay({
  request,
  onClose,
}: {
  request: AdviserAccessRequest | null;
  onClose: () => void;
}) {
  const students = React.useMemo(
    () => (request ? toBoardStudents([request]) : []),
    [request],
  );

  const decided =
    (request?.approvedLrns?.length ?? 0) + (request?.reportedMissingLrns?.length ?? 0);
  const attached =
    request?.summary?.has ?? students.filter((s) => s.hasRecord).length;

  return (
    <KanbanOverlay
      open={request !== null}
      onClose={onClose}
      width="xl"
      icon={<FileSearch size={14} className="text-amber-500" aria-hidden />}
      title={request ? `${request.adviserName}, ${request.section}` : "Adviser request"}
      ariaLabel="Adviser request learners"
      headerActions={
        request ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Pill tone="blue" label="Grade level">
              {request.gradeLevel}
            </Pill>
            <Pill tone="neutral" label="Employee ID">
              {request.employeeId}
            </Pill>
            <Pill tone={request.checkedAt ? "green" : "amber"} label="SF10 check">
              {request.checkedAt ? "Checked" : "Unchecked"}
            </Pill>
          </span>
        ) : null
      }
      description={
        request ? (
          <span className="flex flex-col gap-0.5">
            <span>{request.reason}</span>
            <span className="text-[12px] text-muted-foreground">
              Requested {formatRelativeTime(request.requestedAt)}
            </span>
          </span>
        ) : null
      }
    >
      {request ? (
        <div className="flex flex-col gap-3 px-0.5 pb-0.5">
          <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-muted/20">
            <SummaryStat
              icon={<Users size={11} aria-hidden />}
              value={students.length}
              label="Learners"
            />
            <SummaryStat
              icon={<FileSearch size={11} aria-hidden />}
              value={attached}
              label="SF10 attached"
            />
            <SummaryStat
              icon={<CheckCircle2 size={11} aria-hidden />}
              value={decided}
              label="Decided"
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="hidden items-center gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
              <span className="flex-1">Learner</span>
              <span className="w-24 shrink-0">SF10 record</span>
              <span className="w-36 shrink-0 text-right">Decision</span>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {students.map((s) => (
                <li
                  key={s.lrn}
                  className="flex flex-wrap items-center gap-2 px-3 py-1.5 sm:flex-nowrap sm:gap-3"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <StudentMascot
                      name={s.name}
                      seed={s.lrn}
                      character={s.mascot ?? undefined}
                      size={26}
                    />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="truncate text-xs font-medium text-foreground">
                        {s.name}
                      </span>
                      <span className="truncate font-mono text-[12px] tracking-tight text-muted-foreground">
                        {s.lrn}
                      </span>
                    </span>
                  </span>
                  <span className="w-24 shrink-0">
                    {s.checkedAt ? (
                      <Pill tone={s.hasRecord ? "green" : "red"} label="SF10 record">
                        {s.hasRecord ? "Attached" : "Missing"}
                      </Pill>
                    ) : (
                      <Pill tone="neutral" label="SF10 record">
                        Not checked
                      </Pill>
                    )}
                  </span>
                  <span className="flex w-36 shrink-0 justify-end">
                    <Pill tone={STATE[s.state].tone} label="Decision status">
                      {STATE[s.state].label}
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </KanbanOverlay>
  );
}
