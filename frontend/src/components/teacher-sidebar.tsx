"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import { useCachedAdviser } from "@/services/teacher/flagCache";
import { useTeacherOverview } from "@/services/teacher/overview.service";
import {
  useTeacherNavDots,
  useTeacherNavDotInvalidation,
  type TeacherNavDots,
} from "@/services/teacher/navCounts.service";
import { useSession } from "@/lib/auth/useSession";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  /** Red "new or updated since you last looked" dot. */
  dot?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export type { NavGroup, NavItem };

/**
 * Sidebar focus. `workspace` is the default the rail always lands on; the
 * topbar pill switches it to `advisory`, and `all` keeps both groups (the
 * global-search palette calls `buildNav` without a mode to list every page).
 */
export type TeacherNavMode = "all" | "advisory" | "workspace";

export function buildNav(
  isAdviser: boolean,
  mode: TeacherNavMode = "all",
): NavGroup[] {
  // Non-advisers have no advisory desk to show, so they always get the class
  // workspace links regardless of the (hidden) pill state.
  const focus: TeacherNavMode = isAdviser ? mode : "workspace";
  const workspaceItems = [
    { title: "Class", href: "/teacher/classes", icon: NAV_ICONS.class },
    { title: "Gradebook", href: "/teacher/grading", icon: NAV_ICONS.gradebook },
    { title: "Lock Grades", href: "/teacher/lock-grades", icon: NAV_ICONS.lockGrades },
    { title: "Attendance", href: "/teacher/attendance", icon: NAV_ICONS.attendance },
  ];
  const groups: NavGroup[] = [
    { label: "Overview", items: [
      { title: "Dashboard", href: "/teacher/overview", icon: NAV_ICONS.overview },
      { title: "Student List", href: "/teacher/overview/students", icon: NAV_ICONS.studentList },
      { title: "Reports", href: "/teacher/overview/reports", icon: NAV_ICONS.reports },
    ] },
  ];
  const showAdvisory = isAdviser && focus !== "workspace";
  const showWorkspace = focus !== "advisory";
  if (showAdvisory) {
    groups.push(
      { label: "Advisory", items: [
        { title: "Advisory List", href: "/teacher/advisory/list", icon: NAV_ICONS.advisoryList },
        { title: "Attendance", href: "/teacher/advisory/attendance", icon: NAV_ICONS.attendance },
        { title: "Academics", href: "/teacher/advisory/academics", icon: NAV_ICONS.academic },
        { title: "Anecdotal", href: "/teacher/anecdotal", icon: NAV_ICONS.anecdotal },
        { title: "Referrals", href: "/teacher/advisory/referrals", icon: NAV_ICONS.referrals },
        { title: "Interventions", href: "/teacher/advisory/interventions", icon: NAV_ICONS.interventions },
        { title: "ADM", href: "/teacher/advisory/adm-cases", icon: NAV_ICONS.admCases },
        { title: "Modules", href: "/teacher/advisory/modules", icon: NAV_ICONS.modules },
        { title: "SF10 Access", href: "/teacher/advisory/sf10-access", icon: NAV_ICONS.sf10Access },
      ]},
    );
  }
  if (showWorkspace) {
    groups.push({ label: "Workspace", items: workspaceItems });
  }
  groups.push(
    { label: "Settings", items: [{ title: "General Settings", href: "/teacher/settings", icon: NAV_ICONS.settings }] },
  );
  return groups;
}

/* Which live queue each nav entry watches. The dot comes from
   `/api/teacher/nav-counts`; a page with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof TeacherNavDots> = {
  "/teacher/overview": "overview",
  "/teacher/advisory/list": "advisoryList",
  "/teacher/advisory/attendance": "adviseeAttendance",
  "/teacher/advisory/academics": "adviseeAcademic",
  "/teacher/anecdotal": "anecdotal",
  "/teacher/advisory/referrals": "referrals",
  "/teacher/advisory/interventions": "interventions",
  "/teacher/advisory/adm-cases": "adm",
  "/teacher/advisory/modules": "modules",
  "/teacher/advisory/sf10-access": "sf10",
};

function withDots(groups: NavGroup[], dots?: TeacherNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(dots && QUEUE_FOR_HREF[item.href] ? dots[QUEUE_FOR_HREF[item.href]] : false),
    })),
  }));
}

/**
 * Teacher desk navigation host: resolves the adviser/subject-teacher nav and
 * renders it as the left glass dock (`nav/GlassDock`). Builds the same groups
 * the global search palette reads via `buildNav`.
 */
export function TeacherSidebar({ mode = "workspace" }: { mode?: TeacherNavMode }) {
  const pathname = usePathname();
  const session = useSession();
  const overview = useTeacherOverview();

  const cachedAdviser = useCachedAdviser(session?.sub);
  const isAdviser = overview.data?.isAdviser ?? cachedAdviser ?? true;
  const dots = useTeacherNavDots();
  useTeacherNavDotInvalidation(dots);
  const nav = React.useMemo(
    () => withDots(buildNav(isAdviser, mode), dots),
    [isAdviser, mode, dots],
  );

  return <GlassDock groups={nav} pathname={pathname ?? ""} ariaLabel="Teacher sections" />;
}
