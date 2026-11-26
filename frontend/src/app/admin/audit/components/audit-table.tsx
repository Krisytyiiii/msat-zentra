"use client";

import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import rowStyles from "@/components/ui/table-row-in.module.css";
import { roleLabel } from "@/lib/auth/roles";
import type { AdminAuditEntry } from "@/services/admin/admin.service";

const HEAD_CLASS =
  "px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground";

function prettyAction(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The audit trail as a data table — same anatomy as the account directory
 * (`accounts-table`): hairline header row, muted 12px column labels, row
 * separators and hover tint. Role, action and timestamp are plain columns
 * here, not pills, so the log reads like a record list.
 */
export function AuditTable({
  rows,
  onOpen,
}: {
  rows: AdminAuditEntry[];
  onOpen: (entry: AdminAuditEntry) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card dark:bg-transparent">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={HEAD_CLASS}>
              Action
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Actor
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Role
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Source
            </th>
            <th scope="col" className={HEAD_CLASS}>
              When
            </th>
            <th scope="col" className={`${HEAD_CLASS} text-right`}>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, index) => (
            <tr
              key={entry.id}
              style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as CSSProperties}
              className={`${rowStyles.row} border-b border-border/60 transition-colors duration-150 last:border-b-0 hover:bg-muted/60`}
            >
              <td className="px-4 py-2.5 align-middle whitespace-nowrap font-medium text-foreground">
                {prettyAction(entry.actionType)}
              </td>
              <td className="px-4 py-2.5 align-middle">
                <div className="flex items-center gap-2.5">
                  <StudentMascot name={entry.user} seed={entry.user} size={32} />
                  <p className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground">
                    {entry.user}
                  </p>
                </div>
              </td>
              <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] text-muted-foreground">
                {roleLabel(entry.actorRole)}
              </td>
              <td className="px-4 py-2.5 align-middle">
                <p className="m-0 truncate text-[13px] leading-tight text-foreground">
                  {entry.sourceLabel}
                </p>
                <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
                  #{entry.sourceId.slice(0, 8)}
                </p>
              </td>
              <td
                className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground"
                title={formatDateTime(entry.timestamp)}
              >
                {timeAgo(entry.timestamp)}
              </td>
              <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                <Button
                  type="button"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[12px]"
                  onClick={() => onOpen(entry)}
                  aria-label={`View details for ${prettyAction(entry.actionType)} on ${entry.sourceLabel}`}
                >
                  Details
                  <ChevronRight size={12} aria-hidden />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
