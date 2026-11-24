"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import {
  useNurseNavDots,
  useNurseNavDotInvalidation,
  type NurseNavDots,
} from "@/services/nurse/navCounts.service";

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

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Overview", href: "/nurse/overview", icon: NAV_ICONS.overview },
      { title: "Alerts", href: "/nurse/alerts", icon: NAV_ICONS.alerts },
      { title: "Schedule", href: "/nurse/schedule", icon: NAV_ICONS.schedule },
    ],
  },
  {
    label: "Referrals",
    items: [
      {
        title: "ADM Cases",
        href: "/nurse/referrals/adm",
        icon: NAV_ICONS.admCases,
      },
      {
        title: "Clinic Matters",
        href: "/nurse/referrals/clinic",
        icon: NAV_ICONS.clinicMatters,
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        title: "Health Records",
        href: "/nurse/health-records",
        icon: NAV_ICONS.healthRecords,
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        title: "Referrals Report",
        href: "/nurse/reports",
        icon: NAV_ICONS.referrals,
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General Settings",
        href: "/nurse/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

/* Which live queue each nav entry watches. The dot comes from
   `/api/nurse/nav-counts`; a page with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof NurseNavDots> = {
  "/nurse/overview": "overview",
  "/nurse/alerts": "alerts",
  "/nurse/referrals/adm": "adm",
  "/nurse/referrals/clinic": "clinic",
  "/nurse/health-records": "records",
  "/nurse/reports": "report",
};

function withDots(groups: NavGroup[], dots: NurseNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(QUEUE_FOR_HREF[item.href] && dots[QUEUE_FOR_HREF[item.href]]),
    })),
  }));
}

/**
 * Nurse desk navigation host: the shared floating glass dock, fed by the
 * nurse nav with the live "new or updated" dots.
 */
export function NurseSidebar() {
  const pathname = usePathname();
  const dots = useNurseNavDots();
  useNurseNavDotInvalidation(dots);
  const nav = React.useMemo(() => withDots(NAV, dots), [dots]);

  return (
    <GlassDock groups={nav} pathname={pathname ?? ""} ariaLabel="Nurse sections" />
  );
}
