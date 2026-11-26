"use client";

import { Check, Loader2, UserPlus, X } from "lucide-react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import rowStyles from "@/components/ui/table-row-in.module.css";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { formatGrade, formatSection } from "@/lib/utils";
import { formatRelativeTime, type PendingStudent } from "./types";

export type PendingStaffRow = {
  id: string;
  role?: string;
  name: string;
  email: string;
  contactNumber: string;
  employeeId?: string | null;
  department?: string | null;
  requestedAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  subject_teacher: "Subject Teacher",
  adviser: "Adviser",
};

const HEAD_CLASS =
  "px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground";

function requestedLabel(iso: string): string {
  return formatRelativeTime(iso);
}

/**
 * Pending student / parent sign-ups as a data table — the same anatomy as the
 * account directory (`accounts-table`): hairline header row, muted 12px column
 * labels, mascot + name/email identity cell and outline row actions.
 */
export function PendingAccountsTable({
  rows,
  kind,
  actingId,
  busy,
  onVerify,
  onApprove,
  onReject,
}: {
  rows: PendingStudent[];
  kind: "student" | "parent";
  actingId?: string;
  busy: boolean;
  onVerify: (row: PendingStudent) => void;
  onApprove: (row: PendingStudent) => void;
  onReject: (row: PendingStudent) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={HEAD_CLASS}>
              Account
            </th>
            {kind === "student" ? (
              <>
                <th scope="col" className={HEAD_CLASS}>
                  Grade
                </th>
                <th scope="col" className={HEAD_CLASS}>
                  Section
                </th>
              </>
            ) : null}
            <th scope="col" className={HEAD_CLASS}>
              Status
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Requested
            </th>
            <th scope="col" className={`${HEAD_CLASS} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const pendingRow = actingId === row.id;
            return (
              <tr
                key={row.id}
                style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as CSSProperties}
                className={`${rowStyles.row} border-b border-border/60 transition-colors duration-150 last:border-b-0 hover:bg-muted/60`}
              >
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <StudentMascot name={row.name} seed={row.lrn || row.id} size={32} />
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground">
                        {row.name}
                      </p>
                      <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
                        {row.email}
                      </p>
                    </div>
                  </div>
                </td>
                {kind === "student" ? (
                  <>
                    <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] text-muted-foreground">
                      {formatGrade(row.gradeLevel)}
                    </td>
                    <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] text-muted-foreground">
                      {formatSection(row.section)}
                    </td>
                  </>
                ) : null}
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  <Pill tone="amber" label="Approval status">
                    Pending
                  </Pill>
                </td>
                <td
                  className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground"
                  title={`Requested ${new Date(row.requestedAt).toLocaleString()}`}
                >
                  {requestedLabel(row.requestedAt)}
                </td>
                <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                  {kind === "student" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[12px]"
                      onClick={() => onVerify(row)}
                      aria-label={`Verify LRN for ${row.name}`}
                    >
                      <UserPlus size={12} aria-hidden />
                      Verify &amp; approve
                    </Button>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        className="h-6 gap-1 px-2 text-[12px]"
                        disabled={busy}
                        onClick={() => onApprove(row)}
                        aria-label={`Approve ${row.name}`}
                      >
                        {pendingRow ? (
                          <Loader2 size={12} className="animate-spin" aria-hidden />
                        ) : (
                          <Check size={12} aria-hidden />
                        )}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-6 gap-1 px-2 text-[12px] text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => onReject(row)}
                        aria-label={`Reject ${row.name}`}
                      >
                        <X size={12} aria-hidden />
                        Reject
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Pending teacher sign-ups as the same data table. */
export function PendingStaffTable({
  rows,
  actingId,
  busy,
  onApprove,
  onReject,
}: {
  rows: PendingStaffRow[];
  actingId?: string;
  busy: boolean;
  onApprove: (row: PendingStaffRow) => void;
  onReject: (row: PendingStaffRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={HEAD_CLASS}>
              Account
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Role
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Contact
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Status
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Requested
            </th>
            <th scope="col" className={`${HEAD_CLASS} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const pendingRow = actingId === row.id;
            return (
              <tr
                key={row.id}
                style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as CSSProperties}
                className={`${rowStyles.row} border-b border-border/60 transition-colors duration-150 last:border-b-0 hover:bg-muted/60`}
              >
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <StudentMascot name={row.name} seed={row.id} size={32} />
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground">
                        {row.name}
                      </p>
                      <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
                        {row.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] text-muted-foreground">
                  {ROLE_LABEL[row.role ?? ""] ?? "Teacher"}
                  {row.department ? (
                    <span className="block text-[12px] text-muted-foreground/80">
                      {row.department}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] text-muted-foreground">
                  {row.contactNumber && row.contactNumber !== "—" ? row.contactNumber : "—"}
                  {row.employeeId ? (
                    <span className="block text-[12px] text-muted-foreground/80">
                      ID {row.employeeId}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  <Pill tone="amber" label="Approval status">
                    Pending
                  </Pill>
                </td>
                <td
                  className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground"
                  title={`Requested ${new Date(row.requestedAt).toLocaleString()}`}
                >
                  {requestedLabel(row.requestedAt)}
                </td>
                <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      className="h-6 gap-1 px-2 text-[12px]"
                      disabled={busy}
                      onClick={() => onApprove(row)}
                      aria-label={`Approve ${row.name}`}
                    >
                      {pendingRow ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                      ) : (
                        <Check size={12} aria-hidden />
                      )}
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[12px] text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => onReject(row)}
                      aria-label={`Reject ${row.name}`}
                    >
                      <X size={12} aria-hidden />
                      Reject
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Shimmer loading state for the pending queues — the same table shell as the
 * loaded list (header labels, mascot + identity cell, action cell) so nothing
 * shifts when the rows arrive.
 */
export function PendingQueueSkeleton({ columns }: { columns: string[] }) {
  return (
    <ShimmerGroup>
      <div
        className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent"
        role="status"
        aria-label="Loading pending accounts"
        aria-busy="true"
      >
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              {columns.map((label) => (
                <th key={label} scope="col" className={HEAD_CLASS}>
                  {label}
                </th>
              ))}
              <th scope="col" className={`${HEAD_CLASS} text-right`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PAGE_SIZE }).map((_, row) => (
              <tr
                key={row}
                className="border-b border-border/60 last:border-b-0"
                aria-hidden="true"
              >
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <ShimmerSkeleton className="size-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <ShimmerSkeleton className="h-3 w-32 max-w-full" />
                      <ShimmerSkeleton className="mt-1 h-2.5 w-44 max-w-full" />
                    </div>
                  </div>
                </td>
                {columns.slice(1).map((label) => (
                  <td key={label} className="px-4 py-2.5 align-middle">
                    <ShimmerSkeleton className="h-3 w-20" />
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right align-middle">
                  <ShimmerSkeleton className="ml-auto h-6 w-24 rounded-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ShimmerGroup>
  );
}
