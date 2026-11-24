"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import {
  useRegistrarNavDotInvalidation,
  useRegistrarNavDots,
  type RegistrarNavDots,
} from "@/services/registrar/navCounts.service";

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
    items: [
      { title: "Overview", href: "/registrar/overview", icon: NAV_ICONS.overview },
    ],
  },
  {
    label: "Records",
    items: [
      { title: "Final Grades", href: "/registrar/final-grades", icon: NAV_ICONS.finalGrades },
      {
        title: "Adviser Access Requests",
        href: "/registrar/adviser-access",
        icon: NAV_ICONS.adviserAccessRequests,
      },
      { title: "Report Cards", href: "/registrar/report-cards", icon: NAV_ICONS.reportCards },
      { title: "SF10 Records", href: "/registrar/sf10", icon: NAV_ICONS.sf10Records },
      { title: "Upload SF10", href: "/registrar/sf10/upload", icon: NAV_ICONS.uploadSf10 },
      { title: "Subjects", href: "/registrar/academics", icon: NAV_ICONS.subjects },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General Settings",
        href: "/registrar/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

/* Which live queue each nav entry watches. The dot comes from
   `/api/registrar/nav-counts`; a page with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof RegistrarNavDots> = {
  "/registrar/overview": "overview",
  "/registrar/final-grades": "finalGrades",
  "/registrar/adviser-access": "adviserAccess",
  "/registrar/sf10": "sf10",
  "/registrar/academics": "subjects",
};

function withDots(groups: NavGroup[], dots: RegistrarNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(QUEUE_FOR_HREF[item.href] && dots[QUEUE_FOR_HREF[item.href]]),
    })),
  }));
}

/**
 * Registrar desk navigation host: the shared floating glass dock.
 */
export function RegistrarSidebar() {
  const pathname = usePathname();
  const dots = useRegistrarNavDots();
  useRegistrarNavDotInvalidation(dots);
  const nav = React.useMemo(() => withDots(NAV, dots), [dots]);

  return (
    <GlassDock
      groups={nav}
      pathname={pathname ?? ""}
      ariaLabel="Registrar sections"
    />
  );
}
