"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import { usePendingApprovalCounts } from "@/components/registry/account-approvals/api";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Overview", href: "/admin/overview", icon: NAV_ICONS.overview }],
  },
  {
    label: "Academics",
    items: [
      {
        title: "Timetable",
        href: "/admin/academics/schedule",
        icon: NAV_ICONS.schedule,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "User Accounts",
        href: "/admin/users",
        icon: NAV_ICONS.accountApprovals,
      },
      {
        title: "Pending Approvals",
        href: "/admin/users/pending",
        icon: NAV_ICONS.pendingApprovals,
      },
      {
        title: "Audit Log",
        href: "/admin/audit",
        icon: NAV_ICONS.auditLog,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "Settings",
        href: "/admin/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

const PENDING_APPROVALS_HREF = "/admin/users/pending";

/** Show the live pending-sign-up count on the administrator approval item. */
function withPendingBadge(groups: NavGroup[], total: number): NavGroup[] {
  if (total <= 0) return groups;
  const badge = total > 99 ? "99+" : String(total);
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.href === PENDING_APPROVALS_HREF ? { ...item, badge } : item,
    ),
  }));
}

/**
 * Administrator desk navigation host: the shared floating glass dock, with
 * the live pending-approvals count on its approvals tile.
 */
export function AdminSidebar() {
  const pathname = usePathname();
  const { total: pendingTotal } = usePendingApprovalCounts();
  const nav = React.useMemo(() => withPendingBadge(NAV, pendingTotal), [pendingTotal]);

  return (
    <GlassDock
      groups={nav}
      pathname={pathname ?? ""}
      ariaLabel="Administrator sections"
    />
  );
}
