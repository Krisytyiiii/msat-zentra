"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ListFilter } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Button } from "@/components/ui/button";
import { PrincipalPageHeader } from "../components/PrincipalPageHeader";
import type { RiskBoardData } from "@/services/principal/risk.types";
import { RiskFocusProvider } from "./components/risk-focus";
import { RiskHero } from "./components/RiskHero";
import { RiskLevelDistribution } from "./components/RiskLevelDistribution";
import { RiskTrend } from "./components/RiskTrend";
import { HighRiskStudentsTable } from "./components/HighRiskStudentsTable";
import styles from "./risk.module.css";

export default function PrincipalRiskBoardPage() {
  const { activeTerm } = useTerm();
  // Same key/endpoint the boards read, so this only observes their cache: the
  // page-level empty state replaces the per-board "no data" messages.
  const { data, isPending } = useQuery({
    queryKey: ["risk-board", activeTerm?.termId ?? null, activeTerm?.schoolYearId ?? null],
    queryFn: async () => {
      const res = await apiClient.get<RiskBoardData>("/api/risk/board");
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const total = (data?.levelDistribution ?? []).reduce(
    (sum, level) => sum + level.count,
    0,
  );

  if (!isPending && data && total === 0) {
    return (
      <section className={styles.page}>
        <PageEmptyCallout>
          No risk flags for the active term yet. Students flagged by the
          academic, attendance, or anecdotal rules will appear here once
          detected.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <RiskFocusProvider>
      <section className={styles.page}>
        <PrincipalPageHeader
          title="Risk Monitoring"
          description="Live risk signals across adviser-shared sections. Focus a level, factor or section and every board below follows."
          actions={
            <>
              <Button size="sm" className="h-6 px-2 text-[12px]" asChild>
                <Link href="/principal/risk/students">
                  <ListFilter aria-hidden="true" />
                  Learner heatmap
                </Link>
              </Button>
              <Button variant="secondary" size="sm" className="h-6 px-2 text-[12px]" asChild>
                <Link href="/principal/risk/interventions">
                  Interventions
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            </>
          }
        />

        <RiskHero />

        <RiskLevelDistribution />

        <RiskTrend />

        <div id="risk-learners" className={styles.learnerAnchor}>
          <HighRiskStudentsTable />
        </div>
      </section>
    </RiskFocusProvider>
  );
}
