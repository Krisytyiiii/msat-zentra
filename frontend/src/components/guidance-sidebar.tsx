"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { GlassDock } from "./nav/GlassDock";
import { NAV_ICONS } from "./nav/sidebar-icons";
import {
  useGuidanceNavDots,
  type GuidanceNavDots,
} from "@/services/guidance/navCounts.service";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Numeric/text pill (unused on the guidance desk — it shows a dot). */
  badge?: string;
  /** Red "new or updated since you last looked" dot. */
  dot?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Overview", href: "/guidance/overview", icon: NAV_ICONS.overview },
      { title: "Alerts", href: "/guidance/alerts", icon: NAV_ICONS.alerts },
      { title: "Schedule", href: "/guidance/schedule", icon: NAV_ICONS.schedule },
      {
        title: "Interventions",
        href: "/guidance/interventions",
        icon: NAV_ICONS.interventions,
      },
    ],
  },
  {
    label: "Referrals",
    items: [
      {
        title: "ADM Cases",
        href: "/guidance/referrals/adm",
        icon: NAV_ICONS.admCases,
      },
      {
        title: "Counseling Cases",
        href: "/guidance/referrals/counseling",
        icon: NAV_ICONS.counselingCases,
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        title: "Anecdotal Records",
        href: "/guidance/anecdotal",
        icon: NAV_ICONS.anecdotal,
      },
      {
        title: "Session Documents",
        href: "/guidance/session-documents",
        icon: NAV_ICONS.sessionDocuments,
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        title: "Intervention Insights",
        href: "/guidance/interventions/insights",
        icon: NAV_ICONS.interventionInsights,
      },
      { title: "Referrals Report", href: "/guidance/reports", icon: NAV_ICONS.referrals },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "General Settings",
        href: "/guidance/settings",
        icon: NAV_ICONS.settings,
      },
    ],
  },
];

/* Which live queue each nav entry watches. The dot comes from
   `/api/guidance/nav-counts`; a queue with nothing unseen shows no dot. */
const QUEUE_FOR_HREF: Record<string, keyof GuidanceNavDots> = {
  "/guidance/overview": "overview",
  "/guidance/alerts": "alerts",
  "/guidance/interventions": "interventions",
  "/guidance/interventions/insights": "insights",
  "/guidance/schedule": "schedule",
  "/guidance/referrals/adm": "adm",
  "/guidance/referrals/counseling": "counseling",
  "/guidance/anecdotal": "anecdotal",
  "/guidance/session-documents": "documents",
  "/guidance/reports": "report",
};

function withDots(groups: NavGroup[], dots?: GuidanceNavDots): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dot: Boolean(
        dots && QUEUE_FOR_HREF[item.href] ? dots[QUEUE_FOR_HREF[item.href]] : false,
      ),
    })),
  }));
}

/**
 * Guidance desk navigation host: the same floating glass dock as the teacher
 * desk, fed by the guidance nav (with the live "new or updated" dots).
 */
export function GuidanceSidebar() {
  const pathname = usePathname();
  const counts = useGuidanceNavDots();
  const nav = React.useMemo(() => withDots(NAV, counts), [counts]);

  return (
    <GlassDock
      groups={nav}
      pathname={pathname ?? ""}
      ariaLabel="Guidance sections"
    />
  );
}
