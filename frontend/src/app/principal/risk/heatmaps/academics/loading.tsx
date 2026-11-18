"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { KpiStrip } from "./components/KpiStrip";
import { SubjectTrendChart } from "./components/SubjectTrendChart";
import { NeedsAttentionList } from "./components/NeedsAttentionList";
import shell from "../components/heatmap.module.css";

const noop = () => {};

/**
 * Route-level skeleton. It renders the page's own pending states so the
 * placeholder is the same shape as the loaded layout: the page header, the
 * stat deck, the Subject Trends board and the Needs Attention card grid.
 */
export default function PrincipalAcademicsHeatmapLoading() {
  return (
    <div className={shell.shell}>
      <div className={shell.layout}>
        <section
          className={shell.page}
          aria-label="Loading academic heatmap"
          aria-busy="true"
        >
          <Skeleton className="h-8 w-64" aria-hidden="true" />
          <KpiStrip
            below={0}
            gradedTotal={0}
            riskySections={0}
            sectionCount={0}
            ungraded={0}
            ungradedStudents={[]}
            sharedTotal={0}
            isPending
          />
          <SubjectTrendChart
            sections={[]}
            isPending
            selectedSubject={null}
            onSelectSubject={noop}
          />
          <NeedsAttentionList items={[]} isPending />
        </section>
      </div>
    </div>
  );
}
