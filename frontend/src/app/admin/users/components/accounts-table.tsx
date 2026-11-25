"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Loader2, UserCheck, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import rowStyles from "@/components/ui/table-row-in.module.css";
import { roleLabel } from "@/lib/auth/roles";
import type { AdminUser } from "@/services/admin/admin.service";

const STATUS_TONE: Record<string, PillTone> = {
  active: "green",
  pending: "amber",
  suspended: "red",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const HEAD_CLASS =
  "px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground";

/**
 * The account directory as a data table — same anatomy as the timetable
 * workspace's section list (`section-workspace-table`): hairline header row,
 * muted 12px column labels, row separators and hover tint. Only the columns
 * that matter on this desk are shown: identity, role, status, creation date
 * and the suspend/restore action.
 */
export function AccountsTable({
  rows,
  actingId,
  busy,
  onRequest,
}: {
  rows: AdminUser[];
  /** Row whose suspend/restore request is in flight. */
  actingId?: string;
  busy: boolean;
  onRequest: (user: AdminUser, next: "active" | "suspended") => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
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
              Status
            </th>
            <th scope="col" className={HEAD_CLASS}>
              Created
            </th>
            <th scope="col" className={`${HEAD_CLASS} text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((user, index) => {
            const pendingRow = actingId === user.id;
            const status = user.status.charAt(0).toUpperCase() + user.status.slice(1);
            return (
              <tr
                key={user.id}
                style={{ "--row-delay": `${Math.min(index, 11) * 35}ms` } as CSSProperties}
                className={`${rowStyles.row} border-b border-border/60 transition-colors duration-150 last:border-b-0 hover:bg-muted/60`}
              >
                <td className="px-4 py-2.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <StudentMascot
                      name={user.fullName}
                      seed={user.id}
                      character={user.mascot ?? undefined}
                      size={32}
                    />
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13px] leading-tight font-semibold text-foreground">
                        {user.fullName}
                      </p>
                      <p className="m-0 truncate text-[12px] leading-tight text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] text-muted-foreground">
                  {roleLabel(user.role)}
                </td>
                <td className="px-4 py-2.5 align-middle whitespace-nowrap">
                  <Pill tone={STATUS_TONE[user.status] ?? "neutral"} label="Account status">
                    {status}
                  </Pill>
                </td>
                <td
                  className="px-4 py-2.5 align-middle whitespace-nowrap text-[12px] tabular-nums text-muted-foreground"
                  title={`Created ${new Date(user.createdAt).toLocaleString()}`}
                >
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap">
                  {user.role === "admin" ? (
                    <span className="text-[12px] text-muted-foreground">—</span>
                  ) : user.status === "pending" ? (
                    <Button
                      asChild
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[12px]"
                    >
                      <Link href="/admin/users/pending">
                        Review
                        <ArrowRight size={12} aria-hidden />
                      </Link>
                    </Button>
                  ) : user.status === "suspended" ? (
                    <Button
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[12px]"
                      disabled={busy}
                      onClick={() => onRequest(user, "active")}
                      aria-label={`Restore ${user.fullName}`}
                    >
                      {pendingRow ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                      ) : (
                        <UserCheck size={12} aria-hidden />
                      )}
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[12px] text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => onRequest(user, "suspended")}
                      aria-label={`Suspend ${user.fullName}`}
                    >
                      {pendingRow ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden />
                      ) : (
                        <UserX size={12} aria-hidden />
                      )}
                      Suspend
                    </Button>
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
