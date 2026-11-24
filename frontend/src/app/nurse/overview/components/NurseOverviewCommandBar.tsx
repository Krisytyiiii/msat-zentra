"use client";

import * as React from "react";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Send,
  Stethoscope,
} from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import type { NurseKpis, NurseQueueRow } from "@/services/nurse/nurse.types";
import { waitingElapsed } from "./nurse-action-badge";
import { useNowMs } from "./use-now-ms";

/**
 * Clinic command row. Rendered through the shared `StatDeck` — the same stat
 * strip every other desk uses — so the clinic overview speaks the app's
 * standard figure language instead of a bespoke tile design. Each tile links
 * to the queue its number came from.
 */
export function NurseOverviewCommandBar({
  kpis,
  needsReview,
}: {
  kpis: NurseKpis;
  needsReview: NurseQueueRow[];
}) {
  const nowMs = useNowMs();

  const items = React.useMemo<StatDeckItem[]>(() => {
    const oldest = needsReview[0]
      ? waitingElapsed(needsReview[0].referredAt, nowMs)
      : null;
    return [
      {
        key: "needs",
        icon: Stethoscope,
        label: "Needs review",
        unit: "cases",
        value: kpis.needsReview,
        hint: oldest ? `Oldest waiting ${oldest}` : "Queue clear",
        href: "/nurse/alerts",
        tone: kpis.needsReview > 0 ? "amber" : undefined,
      },
      {
        key: "booked",
        icon: CalendarClock,
        label: "Booked sessions",
        unit: "cases",
        value: kpis.bookedSession,
        hint: "Active clinic bookings",
        href: "/nurse/referrals/clinic",
      },
      {
        key: "endorsed",
        icon: Send,
        label: "Endorsed to ADM",
        unit: "cases",
        value: kpis.endorsedToAdm,
        hint: "With the ADM coordinator",
        href: "/nurse/referrals/adm",
      },
      {
        key: "followup",
        icon: Activity,
        label: "Follow-ups",
        unit: "cases",
        value: kpis.followUp,
        hint: "Still being monitored",
        href: "/nurse/alerts",
        tone: kpis.followUp > 0 ? "amber" : undefined,
      },
      {
        key: "done",
        icon: CheckCircle2,
        label: "Completed",
        unit: "cases",
        value: kpis.doneSession,
        hint: "Sessions finished",
        href: "/nurse/referrals/clinic",
      },
    ];
  }, [kpis, needsReview, nowMs]);

  return <StatDeck columns={5} ariaLabel="Clinic case figures" items={items} />;
}

/** Loading state for the command row — same deck shell, five skeleton tiles. */
export function NurseOverviewCommandSkeleton() {
  return (
    <StatDeck
      columns={5}
      ariaLabel="Clinic case figures"
      loading
      items={Array.from({ length: 5 }, (_, index) => ({
        key: `skeleton-${index}`,
        icon: Stethoscope,
        label: "",
        unit: "",
        value: 0,
        hint: "",
      }))}
    />
  );
}
