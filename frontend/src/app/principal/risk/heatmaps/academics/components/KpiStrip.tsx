"use client";

import * as React from "react";
import { Clock, School, TriangleAlert, Users } from "lucide-react";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import { AwaitingGradesBoard } from "./AwaitingGradesBoard";
import type { UngradedStudent } from "./types";

/**
 * Top stat deck for the academic heatmap — rendered through the shared
 * `StatDeck` so it matches every other desk. The "Awaiting grades" tile is a
 * button instead of a link: it opens the learner list underneath the strip.
 */
export function KpiStrip({
  below,
  gradedTotal,
  riskySections,
  sectionCount,
  ungraded,
  ungradedStudents,
  sharedTotal,
  isPending,
}: {
  below: number;
  gradedTotal: number;
  riskySections: number;
  sectionCount: number;
  /** Adviser-shared learners with no grade record yet this term. */
  ungraded: number;
  /** Those same learners, listed when the stat is tapped. */
  ungradedStudents: UngradedStudent[];
  /** All adviser-shared learners in scope. */
  sharedTotal: number;
  isPending: boolean;
}) {
  const [showUngraded, setShowUngraded] = React.useState(false);
  const belowPct =
    gradedTotal > 0 ? Math.round((below / gradedTotal) * 100) : 0;

  const empty =
    !isPending && sectionCount === 0 && gradedTotal === 0 && ungraded === 0;

  const tiles: StatDeckItem[] = [
    {
      key: "below",
      icon: TriangleAlert,
      label: "Students below 75",
      unit: "learners",
      value: below,
      hint: `${belowPct}% of ${gradedTotal.toLocaleString()} graded learners`,
      href: "/principal/risk/students",
    },
    {
      key: "sections",
      icon: Users,
      label: "Sections at risk",
      unit: "sections",
      value: riskySections,
      hint: `Of ${sectionCount.toLocaleString()} sections with grades`,
      href: "/principal/academics",
      tone: "amber",
    },
    {
      key: "ungraded",
      icon: Clock,
      label: "Awaiting grades",
      unit: "learners",
      value: ungraded,
      hint:
        ungraded > 0
          ? `Of ${sharedTotal.toLocaleString()} adviser-shared learners`
          : "Every shared learner has a grade record",
      onClick: () => setShowUngraded((open) => !open),
      disabled: ungraded === 0,
      indicator: "chevron",
      indicatorOpen: showUngraded,
      ariaLabel: `Awaiting grades: ${ungraded} learners — ${
        showUngraded ? "hide" : "open"
      } list`,
    },
  ];

  return (
    <StatDeck
      title="Academics at a glance"
      icon={School}
      ariaLabel="Academic overview"
      items={tiles}
      loading={isPending}
      hidden={empty}
      footer="Only learners whose section adviser has turned on data sharing are counted here. Tap “Awaiting grades” to list learners without a grade record yet."
    >
      {showUngraded && ungradedStudents.length > 0 ? (
        <AwaitingGradesBoard
          students={ungradedStudents}
          onClose={() => setShowUngraded(false)}
        />
      ) : null}
    </StatDeck>
  );
}
