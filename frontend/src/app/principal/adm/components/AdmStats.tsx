"use client";

import { Activity, CalendarClock, Hourglass, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import { fetchAdmDashboard } from "@/services/principal/adm.service";
import { useTerm } from "@/lib/term/TermContext";

/**
 * ADM key findings — rendered through the shared `StatDeck` so the principal ADM
 * page uses the same stat strip as the rest of the desks.
 */
export function AdmStats() {
  const { termReady } = useTerm();
  const { data, isPending } = useQuery({
    queryKey: ["adm-dashboard"],
    queryFn: ({ signal }) => fetchAdmDashboard(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: termReady,
  });

  const tiles: StatDeckItem[] = [
    {
      key: "total",
      icon: Activity,
      label: "Total referred",
      unit: "learners",
      value: data?.totalReferred ?? 0,
      hint: "All ADM learners on file school-wide",
    },
    {
      key: "pending",
      icon: Hourglass,
      label: "Awaiting your signature",
      unit: "cases",
      value: data?.kpis.pendingSignature ?? 0,
      hint: "Certifications waiting at the principal desk",
      tone: "amber",
    },
    {
      key: "signed",
      icon: Send,
      label: "Signed this term",
      unit: "cases",
      value: data?.kpis.signed ?? 0,
      hint: "Profiles you have approved and released",
    },
    {
      key: "active",
      icon: CalendarClock,
      label: "Active cases",
      unit: "learners",
      value: data?.kpis.active ?? 0,
      hint: "Learners still progressing through ADM",
    },
  ];

  return (
    <StatDeck
      title="Key findings"
      icon={Activity}
      items={tiles}
      loading={!termReady || isPending}
    />
  );
}
