"use client";

import {
  CalendarCheck,
  ClipboardList,
  Clock,
  Target,
} from "lucide-react";
import { StatDeck } from "@/components/ui/stat-deck";
import type { InterventionInsightKpis } from "@/services/guidance/insights.types";

/**
 * Intervention KPI strip — rendered through the shared `StatDeck`, the same
 * stat language every other desk uses (icon + label tile, big animated number +
 * unit, hint). Do not fork the markup per page.
 */
export function InsightsKpis({ kpis }: { kpis: InterventionInsightKpis }) {
  const closed = kpis.resolved + kpis.unresolved;

  return (
    <StatDeck
      ariaLabel="Intervention figures"
      items={[
        {
          key: "followups",
          icon: ClipboardList,
          label: "Follow-ups this term",
          unit: "cases",
          value: kpis.total,
          hint: `${kpis.ongoing} ongoing | ${kpis.resolved} resolved | ${kpis.unresolved} unresolved`,
        },
        {
          key: "success",
          icon: Target,
          label: "Intervention success rate",
          unit: "%",
          value: kpis.successRate,
          meter: kpis.successRate,
          tone: kpis.successRate >= 75 ? "green" : undefined,
          hint:
            closed > 0
              ? `${kpis.resolved} of ${closed} closed follow-ups resolved`
              : "No closed follow-ups yet",
        },
        {
          key: "resolution",
          icon: Clock,
          label: "Avg. time to resolution",
          unit: "days",
          value: kpis.avgResolutionDays === null ? "—" : kpis.avgResolutionDays,
          hint: "From triage to the last completed session",
        },
        {
          key: "sessions",
          icon: CalendarCheck,
          label: "Session completion",
          unit: "%",
          value: kpis.sessionCompletionRate,
          meter: kpis.sessionCompletionRate,
          hint: `${kpis.sessionsCompleted} of ${kpis.sessionsTotal} counseling sessions completed`,
        },
      ]}
    />
  );
}
