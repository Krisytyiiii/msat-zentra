"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";

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
    items: [
      { title: "Overview", href: "/principal/overview", icon: NAV_ICONS.overview },
    ],
  },
  {
    label: "Academics",
    items: [
      { title: "Academics", href: "/principal/academics", icon: NAV_ICONS.academics },
      {
        title: "Assigning",
        href: "/principal/academics/assign",
        icon: NAV_ICONS.assigning,
      },
      {
        title: "Schedule Approval",
        href: "/principal/academics/schedule",
        icon: NAV_ICONS.scheduleApproval,
      },
    ],
  },
  {
    label: "Risk",
    items: [
      { title: "Risk Board", href: "/principal/risk", icon: NAV_ICONS.riskBoard },
      { title: "Students", href: "/principal/risk/students", icon: NAV_ICONS.students },
      {
        title: "Attendance Heatmap",
        href: "/principal/risk/heatmaps/attendance",
        icon: NAV_ICONS.attendance,
      },
      {
        title: "Academic Heatmap",
        href: "/principal/risk/heatmaps/academics",
        icon: NAV_ICONS.academicHeatmap,
      },
      {
        title: "Anecdotal Records",
        href: "/principal/risk/heatmaps/records",
        icon: NAV_ICONS.behavioralRecords,
      },
      {
        title: "Interventions",
        href: "/principal/risk/interventions",
        icon: NAV_ICONS.interventions,
      },
    ],
  },
  {
    label: "ADM Cases",
    items: [
      {
        title: "Referrals",
        href: "/principal/adm/referrals/all",
        icon: NAV_ICONS.referrals,
      },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "ADM Report", href: "/principal/adm", icon: NAV_ICONS.admReport },
      { title: "Honor Roll", href: "/principal/honor-roll", icon: NAV_ICONS.honorRoll },
      { title: "Audit Log", href: "/principal/audit", icon: NAV_ICONS.auditLog },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General Settings",
        href: "/principal/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

/**
 * Principal desk navigation host: the shared floating glass dock.
 */
export function PrincipalSidebar() {
  const pathname = usePathname();

  return (
    <GlassDock
      groups={NAV}
      pathname={pathname ?? ""}
      ariaLabel="Principal sections"
    />
  );
}
