"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BookOpenCheck,
  CalendarX,
  FileSignature,
  GraduationCap,
  School,
  ShieldAlert,
  Users,
} from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import { useTerm } from "@/lib/term/TermContext";
import { fetchOverview } from "@/services/principal/overview.service";

interface PrincipalStat extends StatDeckItem {
  /** Queues that need a decision feed the header's open-work badge. */
  attention?: boolean;
}

/**
 * Top KPI deck of the principal overview — one bordered strip with a tile per
 * school-health metric and follow-up queue, rendered through the shared
 * `StatDeck` so every desk uses the same stat anatomy. Each tile is a link, so
 * a non-technical reader can click a number and land on the list it came from.
 */
export function PrincipalOverviewStats() {
  const { activeTerm } = useTerm();
  const { data, isPending, isError } = useQuery({
    queryKey: ["overview", activeTerm?.termId ?? null],
    queryFn: fetchOverview,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const items: PrincipalStat[] = [
    {
      key: "enrollment",
      icon: GraduationCap,
      label: "Enrolled",
      unit: "learners",
      value: data?.kpis.enrollment ?? 0,
      hint: "Learners on the roll",
      href: "/principal/risk/students",
    },
    {
      key: "sections",
      icon: School,
      label: "Sections",
      unit: "sections",
      value: data?.kpis.activeSections ?? 0,
      hint: "Active class sections",
      href: "/principal/academics",
    },
    {
      key: "teachers",
      icon: Users,
      label: "Teachers",
      unit: "staff",
      value: data?.kpis.teachers ?? 0,
      hint: "Assigned teaching staff",
      href: "/principal/academics/assign",
    },
    {
      key: "anecdotals",
      icon: BookOpenCheck,
      label: "Anecdotals",
      unit: "records",
      value: data?.kpis.anecdotals ?? 0,
      hint: "Records filed this term",
      href: "/principal/risk/heatmaps/records",
    },
    {
      key: "risk",
      icon: ShieldAlert,
      label: "At-risk learners",
      unit: "flagged",
      value: data?.atRisk.students ?? 0,
      hint: `${data?.riskByLevel.high ?? 0} high · ${data?.riskByLevel.moderate ?? 0} moderate`,
      href: "/principal/risk/students",
      attention: true,
    },
    {
      key: "adm",
      icon: FileSignature,
      label: "ADM referrals",
      unit: "waiting",
      value: data?.admPending ?? 0,
      hint: "Waiting on a principal decision",
      href: "/principal/adm/referrals/all",
      attention: true,
    },
    {
      key: "attendance",
      icon: CalendarX,
      label: "Attendance watch",
      unit: "sections",
      value: data?.attendanceWatch ?? 0,
      hint: "Sections below 80% attendance",
      href: "/principal/risk/heatmaps/attendance",
      attention: true,
    },
    {
      key: "honor",
      icon: Award,
      label: "Honor roll",
      unit: "qualifiers",
      value: data?.honorRoll ?? 0,
      hint: "Qualifiers this term",
      href: "/principal/honor-roll",
    },
  ];

  return (
    <StatDeck
      title="School at a glance"
      icon={School}
      ariaLabel="School health"
      items={items}
      loading={isPending}
      error={isError}
      errorMessage="Could not load school health figures."
      footer="Only learners whose section adviser has turned on data sharing are counted here."
    />
  );
}
