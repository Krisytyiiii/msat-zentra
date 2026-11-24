"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { AdmCasesSkeleton } from "@/app/teacher/advisory/adm-cases/components/AdmCasesSkeleton";
import { useCoordinatorEnrolled } from "./components/use-coordinator-enrolled";
import { CoordinatorEnrolledListPanel } from "./components/coordinator-enrolled-list";
import { CoordinatorEnrolledOverview } from "./components/coordinator-enrolled-overview";
import { CoordinatorEnrolledWorkspace } from "./components/coordinator-enrolled-workspace";
import { CoordinatorEnrolledCompleteConfirm } from "./components/coordinator-enrolled-complete-confirm";
import {
  canOpenMonitoring,
  laneFor,
  moduleProgress,
  type LaneFilter,
} from "./components/coordinator-enrolled-status";
import pageStyles from "./components/coordinator-enrolled.module.css";
import styles from "@/app/teacher/advisory/adm-cases/components/adm-cases.module.css";

function CoordinatorEnrolledPageInner() {
  const r = useCoordinatorEnrolled();
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight");

  /* The open learner lives here, not in the URL: picking a row swaps the right
     pane in place, exactly like the adviser ADM desk. `picked` stays null until
     the coordinator chooses something, so a ?highlight=<case id> deep link can
     select the learner without an effect (which the compiler lint forbids). */
  const [picked, setPicked] = React.useState<{ id: string | null } | null>(null);
  const [lane, setLane] = React.useState<LaneFilter>("all");

  const rows = r.rows;
  const searched = rows;

  const laneCounts = React.useMemo(() => {
    const out: Record<LaneFilter, number> = {
      all: searched.length,
      not_released: 0,
      in_progress: 0,
      complete: 0,
    };
    for (const row of searched) out[laneFor(row)] += 1;
    return out;
  }, [searched]);

  const visibleRows = React.useMemo(
    () =>
      lane === "all" ? searched : searched.filter((row) => laneFor(row) === lane),
    [searched, lane],
  );

  // A notification landing here (?highlight=<case id>) opens that learner as the
  // desk's initial selection; the moment the coordinator picks anything else,
  // their own choice wins.
  const selectedRow =
    picked !== null
      ? (rows.find((row) => row.id === picked.id) ?? null)
      : highlight
        ? (rows.find((row) => row.id === highlight) ?? null)
        : null;

  const selectedModules = selectedRow ? moduleProgress(selectedRow) : null;
  const canComplete =
    selectedRow !== null &&
    selectedRow.stage !== "completion" &&
    selectedModules !== null &&
    selectedModules.total > 0 &&
    selectedModules.submitted >= selectedModules.total;

  const openEmpty =
    !r.enrolledPending &&
    !r.enrolledError &&
    rows.length === 0 &&
    !r.hasActiveFilters;

  if (r.enrolledPending) return <AdmCasesSkeleton />;

  if (openEmpty) {
    return (
      <section
        className={`${pageStyles.page} ${pageStyles.pageEmpty}`}
        aria-label="Enrolled students"
      >
        <PageEmptyCallout fit>
          No enrolled learners yet. Learners appear here once their ADM case is
          certified and they are placed in a section for the selected school
          year.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label="Enrolled students desk">
      <CoordinatorEnrolledListPanel
        rows={visibleRows}
        total={r.total}
        query={r.query}
        onQueryChange={r.setQuery}
        lane={lane}
        laneCounts={laneCounts}
        onLaneChange={setLane}
        selectedId={selectedRow?.id ?? null}
        onSelect={(row) => setPicked({ id: row.id })}
        currentPage={r.safePage}
        onPageChange={(page) => r.setPage(page)}
        isError={r.enrolledError}
        isFetching={r.enrolledRefetching}
        onRetry={r.refetchEnrolled}
      />

      <div
        className={styles.panel}
        aria-label={selectedRow ? "ADM monitoring workspace" : "Enrolled overview"}
      >
        {selectedRow ? (
          <>
            <div className={styles.panelToolbar}>
              <Button
                type="button"
                variant="ghost"
                className="h-7 gap-1 px-2 text-[12px] text-muted-foreground"
                onClick={() => setPicked({ id: null })}
              >
                <ArrowLeft size={12} aria-hidden />
                Overview
              </Button>
              <span className="ml-auto min-w-0 truncate text-[12px] font-medium text-muted-foreground">
                {selectedRow.student}
              </span>
              {selectedRow.stage !== "completion" ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[12px]"
                  disabled={!canComplete || r.completingId === selectedRow.id}
                  title={
                    canComplete
                      ? "Complete this ADM case"
                      : "All released modules must be submitted first"
                  }
                  onClick={() => r.setCompleteTarget(selectedRow)}
                >
                  Mark complete
                </Button>
              ) : null}
            </div>
            <div className={`${styles.panelScroll} ${styles.workspacePad}`}>
              {canOpenMonitoring(selectedRow) ? (
                <CoordinatorEnrolledWorkspace
                  key={selectedRow.id}
                  caseRef={selectedRow.id}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Info size={24} className="text-muted-foreground" aria-hidden />
                  <p className="m-0 font-semibold text-foreground">
                    No case file yet for {selectedRow.student}
                  </p>
                  <p className="m-0 max-w-sm text-xs text-muted-foreground">
                    This learner is still tracked on the referrals desk until
                    guidance opens an ADM case file.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.panelScroll}>
            <CoordinatorEnrolledOverview
              rows={rows}
              monitoringTotal={r.total}
              completedTotal={r.completedTotal}
              onOpenCase={(row) => setPicked({ id: row.id })}
            />
          </div>
        )}
      </div>

      {r.completeTarget ? (
        <CoordinatorEnrolledCompleteConfirm
          row={r.completeTarget}
          pending={r.stagePending}
          onConfirm={r.confirmComplete}
          onClose={() => {
            if (!r.stagePending) r.setCompleteTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

export default function CoordinatorEnrolledPage() {
  return (
    <React.Suspense fallback={<AdmCasesSkeleton />}>
      <CoordinatorEnrolledPageInner />
    </React.Suspense>
  );
}
