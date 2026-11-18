import { CalendarDays, FileText, Layers } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Skeleton } from "@/components/ui/skeleton";
import chartStyles from "./components/RecordsCharts.module.css";
import blockStyles from "./components/RecordsHeatblocks.module.css";
import styles from "./components/records.module.css";

/**
 * Route-level skeleton. Mirrors the loaded desk: summary strip + follow-up
 * panels, two chart boards (header, description, 260px chart + insight
 * callout) and the anecdotal record board with its search action and eight
 * card slots.
 */
export default function PrincipalRecordsHeatmapLoading() {
  return (
    <section
      className={styles.page}
      aria-label="Loading records heatmap"
      aria-busy="true"
    >
      <div className={styles.mainColumn} aria-hidden="true">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-52 w-full rounded-lg" />
        </div>

        <div className={chartStyles.grid}>
          <KanbanBoard
            title="Records by grade level"
            icon={<Layers size={14} />}
            description="Anecdotal records per grade level, split by category for the active term."
            className="h-full"
          >
            <div className={chartStyles.skeleton}>
              <Skeleton className={chartStyles.skeletonChart} />
              <InsightCallout>
                <span className={chartStyles.skeletonLine} />
              </InsightCallout>
            </div>
          </KanbanBoard>

          <KanbanBoard
            title="Records filed over time"
            icon={<CalendarDays size={14} />}
            description="Anecdotal records filed per day this term, split by category."
            className="h-full"
          >
            <div className={chartStyles.skeleton}>
              <Skeleton className={chartStyles.skeletonChart} />
              <InsightCallout>
                <span className={chartStyles.skeletonLine} />
              </InsightCallout>
            </div>
          </KanbanBoard>
        </div>

        <KanbanBoard
          title="Anecdotal Records"
          icon={<FileText size={14} />}
          actions={<Skeleton className="h-8 w-[220px] rounded-[16px]" />}
          ariaLabel="Anecdotal records"
        >
          <div className={blockStyles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={blockStyles.skelCard}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        </KanbanBoard>
      </div>
    </section>
  );
}
