"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import { usePendingApprovalCounts } from "@/components/registry/account-approvals/api";
import {
  useAdminNavDotInvalidation,
  useAdminNavDots,
  type AdminNavDots,
} from "@/services/admin/navCounts.service";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  dot?: boolean;
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
        title: "Schedule Board",
        href: "/admin/academics/schedule",
        icon: NAV_ICONS.schedule,
      },
      {
        title: "Timetable",
        href: "/admin/academics/schedule/timetable",
        icon: NAV_ICONS.scheduleTemplate,
      },
      {
        title: "Sections",
        href: "/admin/academics/schedule/sections",
        icon: NAV_ICONS.scheduleSections,
      },
      {
        title: "Subjects",
        href: "/admin/academics/schedule/subjects",
        icon: NAV_ICONS.scheduleSubjects,
      },
      {
        title: "Teachers",
        href: "/admin/academics/schedule/teachers",
        icon: NAV_ICONS.scheduleTeachers,
      },
      {
        title: "Configure",
        href: "/admin/academics/schedule/configure",
        icon: NAV_ICONS.scheduleConfigure,
      },
      {
        title: "School Year",
        href: "/admin/academics/schedule/school-year",
        icon: NAV_ICONS.scheduleYear,
      },
      {
        title: "Publish",
        href: "/admin/academics/schedule/publish",
        icon: NAV_ICONS.schedulePublish,
      },
    ],
  },
  {
    label: "Attendance",
    items: [
      {
        title: "No-Class Days",
        href: "/admin/attendance/no-class-days",
        icon: NAV_ICONS.attendance,
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

/* Which live page each nav entry watches. The dot comes from
   `/api/admin/nav-counts`; a page with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof AdminNavDots> = {
  "/admin/overview": "overview",
  "/admin/academics/schedule": "schedule",
  "/admin/academics/schedule/timetable": "timetable",
  "/admin/academics/schedule/sections": "sections",
  "/admin/academics/schedule/subjects": "subjects",
  "/admin/academics/schedule/teachers": "teachers",
  "/admin/academics/schedule/configure": "configure",
  "/admin/academics/schedule/school-year": "schoolYear",
  "/admin/academics/schedule/publish": "publish",
  "/admin/attendance/no-class-days": "noClassDays",
  "/admin/users": "users",
  "/admin/users/pending": "pending",
  "/admin/audit": "audit",
};

function withDots(groups: NavGroup[], dots: AdminNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(QUEUE_FOR_HREF[item.href] && dots[QUEUE_FOR_HREF[item.href]]),
    })),
  }));
}

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
  const search = useSearchParams();
  const { total: pendingTotal } = usePendingApprovalCounts();
  const dots = useAdminNavDots();
  useAdminNavDotInvalidation(dots);
  const nav = React.useMemo(
    () => withDots(withPendingBadge(NAV, pendingTotal), dots),
    [pendingTotal, dots],
  );

  return (
    <GlassDock
      groups={nav}
      pathname={pathname ?? ""}
      search={search?.toString() ?? ""}
      ariaLabel="Administrator sections"
    />
  );
}
