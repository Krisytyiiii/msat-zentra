"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/useSession";
import { TeacherOverviewKanban } from "./components/teacher-overview-kanban";
import { TeacherOverviewCharts } from "./components/teacher-overview-charts";
import { TeacherOverviewSkeleton } from "./components/teacher-overview-skeleton";
import {
  fetchTeacherOverviewGradebook,
  teacherOverviewGradebookKey,
  useTeacherOverview,
} from "@/services/teacher/overview.service";
import { useTerm } from "@/lib/term/TermContext";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { useHydrated } from "@/lib/hooks/useHydrated";
import styles from "./components/teacher-overview.module.css";

/** Right-rail width is user-resizable between these bounds (px). */
const RAIL_STORAGE_KEY = "teacher-overview-rail";
const RAIL_DEFAULT_WIDTH = 320;
const RAIL_MIN_WIDTH = 264;
const RAIL_MAX_WIDTH = 480;

function clampRailWidth(width: number): number {
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(width)));
}

function readRailWidth(): number {
  try {
    const raw = window.localStorage.getItem(RAIL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { width?: number };
      return clampRailWidth(Number(parsed.width) || RAIL_DEFAULT_WIDTH);
    }
  } catch {
    // ignore corrupt/blocked storage
  }
  return RAIL_DEFAULT_WIDTH;
}

export default function TeacherOverviewPage() {
  const { data, isPending, isError } = useTeacherOverview();
  // SSR renders the skeleton (the session lives in localStorage), so the first
  // client render must render it too — otherwise hydration compares a loaded
  // desk with the server's skeleton. See useHydrated.
  const hydrated = useHydrated();
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  const queryClient = useQueryClient();
  const session = useSession();
  const prefetchTeacherId = session?.sub ?? null;
  React.useEffect(() => {
    if (!prefetchTeacherId) return;
    const run = () => {
      void queryClient.prefetchQuery({
        queryKey: teacherOverviewGradebookKey(prefetchTeacherId, termKey),
        queryFn: fetchTeacherOverviewGradebook,
        staleTime: 30_000,
      });
    };
    if (typeof window !== "undefined") {
      const idleWindow = window as unknown as {
        requestIdleCallback?: (cb: () => void) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof idleWindow.requestIdleCallback === "function") {
        const id = idleWindow.requestIdleCallback(run);
        return () => idleWindow.cancelIdleCallback?.(id);
      }
    }
  }, [queryClient, prefetchTeacherId, termKey]);

  // Right rail: drag-resizable width only — intentionally not collapsible.
  // The width loads after mount so prerender/hydration stay deterministic.
  const [railWidth, setRailWidth] = React.useState(RAIL_DEFAULT_WIDTH);
  const railDrag = React.useRef<{ startX: number; startWidth: number } | null>(null);
  const [railResizing, setRailResizing] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of a local UI preference
    setRailWidth(readRailWidth());
  }, []);

  const updateRailWidth = React.useCallback((next: number) => {
    const width = clampRailWidth(next);
    setRailWidth(width);
    try {
      window.localStorage.setItem(RAIL_STORAGE_KEY, JSON.stringify({ width }));
    } catch {
      // ignore quota/storage errors
    }
  }, []);

  const onRailResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    railDrag.current = { startX: e.clientX, startWidth: railWidth };
    setRailResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onRailResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = railDrag.current;
    if (!drag) return;
    // Dragging left widens the rail.
    updateRailWidth(drag.startWidth + (drag.startX - e.clientX));
  };

  const onRailResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!railDrag.current) return;
    railDrag.current = null;
    setRailResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onRailResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowLeft" ? 16 : -16;
    updateRailWidth(railWidth + delta);
  };

  if (!hydrated || isPending) {
    return <TeacherOverviewSkeleton />;
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>Could not load your overview.</p>
      </section>
    );
  }

  const isAdviser = !!data.advisorySection;
  const classStudents = data.classStudents ?? [];
  const studentCount = isAdviser
    ? (data.advisoryTotal ?? data.advisory.students.length)
    : (data.classStudentsTotal ?? classStudents.length);
  const atRiskFactors = isAdviser
    ? data.atRiskFactors
    : data.classAtRiskFactors
      ? {
          academic: data.classAtRiskFactors.academic,
          attendance: data.classAtRiskFactors.attendance,
          behavioral: 0,
        }
      : {
          academic: classStudents.filter((s) => s.flags.includes("academic")).length,
          attendance: classStudents.filter((s) => s.flags.includes("attendance")).length,
          behavioral: 0,
        };
  const atRiskStudents = isAdviser
    ? data.atRiskStudents
    : classStudents.filter((s) => s.riskLevel !== "Low").length;

  // Nothing assigned this term → one centered callout instead of empty boards.
  if (!data.advisorySection && data.kpi.classCount === 0) {
    return (
      <section className={styles.page}>
        <PageEmptyCallout>
          No classes or advisees are assigned to you for the selected term yet.
          Sections and subjects assigned to you will appear here.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div
        className={`${styles.body} ${railResizing ? styles.bodyResizing : ""}`}
        style={{ ["--rail-width" as string]: `${railWidth}px` } as React.CSSProperties}
      >
        <div className={styles.mainCol}>
          <TeacherOverviewCharts
            overview={data}
            factors={atRiskFactors}
            hideBehavioral={!isAdviser}
          />
        </div>

        <aside
          className={styles.sideCol}
          style={{ top: "calc(4rem + var(--term-banner-offset, 0rem))" }}
        >
          <div className={`${styles.railLayer} ${styles.railExpanded}`}>
            <TeacherOverviewKanban
              teacherName={data.teacherName}
              advisorySection={data.advisorySection}
              classCount={data.kpi.classCount}
              studentCount={studentCount}
              atRiskFactors={atRiskFactors}
              atRiskStudents={atRiskStudents}
              populationLabel={isAdviser ? "advisees" : "students"}
              hideBehavioral={!isAdviser}
              storageKey={`teacher-kanban:${prefetchTeacherId ?? data.teacherName}:${termKey}`}
            />
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize side panel"
            aria-valuemin={RAIL_MIN_WIDTH}
            aria-valuemax={RAIL_MAX_WIDTH}
            aria-valuenow={railWidth}
            tabIndex={0}
            className={styles.railResize}
            onPointerDown={onRailResizeStart}
            onPointerMove={onRailResizeMove}
            onPointerUp={onRailResizeEnd}
            onPointerCancel={onRailResizeEnd}
            onKeyDown={onRailResizeKeyDown}
          />
        </aside>
      </div>
    </section>
  );
}
