"use client";

import { AlertTriangle, Award, Clock3, Inbox, Users } from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";

interface CoordinatorOverviewKpisProps {
  needsReviewTotal: number | null;
  needsReviewReady: boolean;
  referredToMe: number;
  certificationsIssued: number;
  awaitingPrincipal: number;
  activeEnrolled: number;
  className?: string;
}

/**
 * Desk figures — the same headerless StatDeck strip every other desk opens
 * with (guidance, nurse, registry), so the coordinator overview reads as one
 * stat language. Each tile links straight to the queue it came from.
 */
export function CoordinatorOverviewKpis({
  needsReviewTotal,
  needsReviewReady,
  referredToMe,
  certificationsIssued,
  awaitingPrincipal,
  activeEnrolled,
  className,
}: CoordinatorOverviewKpisProps) {
  const openCount = needsReviewTotal ?? 0;
  const hasOpen = needsReviewReady && openCount > 0;

  const items: StatDeckItem[] = [
    {
      key: "attention",
      icon: AlertTriangle,
      label: "Needs attention",
      unit: "cases",
      value: needsReviewReady ? openCount : "…",
      hint: !needsReviewReady
        ? "Checking your desk"
        : openCount === 0
          ? "Nothing needs you"
          : "Forwarded by Nurse / Guidance",
      href: "/coordinator/referrals",
      tone: hasOpen ? "amber" : undefined,
    },
    {
      key: "referred",
      icon: Inbox,
      label: "Referred to me",
      unit: "cases",
      value: referredToMe,
      hint: "Awaiting or in intake",
      href: "/coordinator/referrals",
    },
    {
      key: "certifications",
      icon: Award,
      label: "Certifications issued",
      unit: "cases",
      value: certificationsIssued,
      hint: "Recommended & certified",
      href: "/coordinator/files",
    },
    {
      key: "principal",
      icon: Clock3,
      label: "Awaiting Principal",
      unit: "cases",
      value: awaitingPrincipal,
      hint: "Eligible · unsigned",
      href: "/coordinator/files?tab=awaiting",
    },
    {
      key: "enrolled",
      icon: Users,
      label: "Active enrolled",
      unit: "learners",
      value: activeEnrolled,
      hint: "In enrollment monitoring",
      href: "/coordinator/enrolled",
    },
  ];

  return (
    <StatDeck
      columns={5}
      ariaLabel="ADM coordinator desk figures"
      items={items}
      className={className}
    />
  );
}
