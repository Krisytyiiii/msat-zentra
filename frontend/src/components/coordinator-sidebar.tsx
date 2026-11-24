"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import styles from "./coordinator-sidebar.module.css";
import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import { CoordinatorSidebarDeviceReminder } from "./coordinator-sidebar-device-reminder";
import {
  useCoordinatorNavDotInvalidation,
  useCoordinatorNavDots,
  type CoordinatorNavDots,
} from "@/services/coordinator/navCounts.service";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  /** Red "new activity" dot pinned to the icon / tab label. */
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
      { title: "Overview", href: "/coordinator/overview", icon: NAV_ICONS.overview },
    ],
  },
  {
    label: "Intake",
    items: [
      { title: "ADM Cases", href: "/coordinator/referrals", icon: NAV_ICONS.admCases },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { title: "Enrolled", href: "/coordinator/enrolled", icon: NAV_ICONS.enrolled },
    ],
  },
  {
    label: "Records",
    items: [
      { title: "Files", href: "/coordinator/files", icon: NAV_ICONS.certifications },
      { title: "Devices", href: "/coordinator/devices", icon: NAV_ICONS.devices },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General Settings",
        href: "/coordinator/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

/* Which live queue each nav entry watches. The dot comes from
   `/api/adm/nav-counts`; a page with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof CoordinatorNavDots> = {
  "/coordinator/overview": "overview",
  "/coordinator/referrals": "referrals",
  "/coordinator/enrolled": "enrolled",
  "/coordinator/files": "certifications",
  "/coordinator/devices": "devices",
};

function withDots(groups: NavGroup[], dots: CoordinatorNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(QUEUE_FOR_HREF[item.href] && dots[QUEUE_FOR_HREF[item.href]]),
    })),
  }));
}

/**
 * Coordinator desk navigation host: the shared floating glass dock, plus the
 * live needs-device reminder card docked at the bottom-left (the rail used to
 * hold it at its foot).
 */
export function CoordinatorSidebar() {
  const pathname = usePathname();
  const dots = useCoordinatorNavDots();
  useCoordinatorNavDotInvalidation(dots);
  const nav = React.useMemo(() => withDots(NAV, dots), [dots]);

  return (
    <>
      <GlassDock
        groups={nav}
        pathname={pathname ?? ""}
        ariaLabel="Coordinator sections"
      />
      <div className={styles.reminderWrap}>
        <CoordinatorSidebarDeviceReminder />
      </div>
    </>
  );
}
