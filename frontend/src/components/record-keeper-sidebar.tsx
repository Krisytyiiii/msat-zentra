"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import {
  useRecordKeeperNavDotInvalidation,
  useRecordKeeperNavDots,
  type RecordKeeperNavDots,
} from "@/services/record-keeper/navCounts.service";

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
      { title: "Overview", href: "/record-keeper/overview", icon: NAV_ICONS.overview },
    ],
  },
  {
    label: "Records",
    items: [
      { title: "Final Grades", href: "/record-keeper/final-grades", icon: NAV_ICONS.finalGrades },
      {
        title: "Adviser Access Requests",
        href: "/record-keeper/adviser-access",
        icon: NAV_ICONS.adviserAccessRequests,
      },
      { title: "Report Cards", href: "/record-keeper/report-cards", icon: NAV_ICONS.reportCards },
      { title: "SF10 Records", href: "/record-keeper/sf10", icon: NAV_ICONS.sf10Records },
      { title: "Upload SF10", href: "/record-keeper/sf10/upload", icon: NAV_ICONS.uploadSf10 },
      { title: "Subjects", href: "/record-keeper/academics", icon: NAV_ICONS.subjects },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General Settings",
        href: "/record-keeper/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

/* Which live queue each nav entry watches. The dot comes from
   `/api/record-keeper/nav-counts`; a page with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof RecordKeeperNavDots> = {
  "/record-keeper/overview": "overview",
  "/record-keeper/final-grades": "finalGrades",
  "/record-keeper/adviser-access": "adviserAccess",
  "/record-keeper/sf10": "sf10",
  "/record-keeper/academics": "subjects",
};

function withDots(groups: NavGroup[], dots: RecordKeeperNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(QUEUE_FOR_HREF[item.href] && dots[QUEUE_FOR_HREF[item.href]]),
    })),
  }));
}

/**
 * Record Keeper desk navigation host: the shared floating glass dock.
 */
export function RecordKeeperSidebar() {
  const pathname = usePathname();
  const dots = useRecordKeeperNavDots();
  useRecordKeeperNavDotInvalidation(dots);
  const nav = React.useMemo(() => withDots(NAV, dots), [dots]);

  return (
    <GlassDock
      groups={nav}
      pathname={pathname ?? ""}
      ariaLabel="Record Keeper sections"
    />
  );
}
