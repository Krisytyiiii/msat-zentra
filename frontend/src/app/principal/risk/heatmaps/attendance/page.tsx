"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListFilter, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Button } from "@/components/ui/button";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { PrincipalPageHeader } from "../../../components/PrincipalPageHeader";
import {
  AttendanceStatsDeck,
  type AttendanceRateFilter,
} from "./components/AttendanceStatsDeck";
import { SectionTrends } from "./components/SectionTrends";
import styles from "./components/attendance.module.css";

const SHARED_PARAMS = { sharedOnly: true } as const;

export default function PrincipalAttendanceHeatmapsPage() {
  // Same key/params as the deck, so this reads its cache. The page empty state
  // lives here instead of inside the boards' data tables.
  const { data, isPending } = useQuery({
    queryKey: ["attendance-section-averages", "shared"],
    queryFn: async () => {
      const res = await apiClient.get<{ sections: { sectionId: string; rate: number }[] }>(
        "/api/attendance/section-stats",
        { params: SHARED_PARAMS },
      );
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Deck tiles and the section board share one filter.
  const [rateFilter, setRateFilter] = usePersistentState<AttendanceRateFilter>(
    "zentra.attendance.sections.rate",
    "all",
  );
  const sectionsRef = React.useRef<HTMLDivElement>(null);

  // A deck tile sits above the boards, so acting on one brings the section
  // list into view — the filter itself is shared, this is just the scroll.
  const scrollToSections = React.useCallback(() => {
    const node = sectionsRef.current;
    if (!node) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  const isEmpty = !isPending && (data?.sections ?? []).length === 0;

  return (
    <section className={styles.page}>
      <PrincipalPageHeader
        title="Attendance Heatmap"
        description="Adviser-shared sections for the active term. Track the daily present share, see which sections slip below 80%, and open any section for its per-student table."
        actions={
          <>
            <Button size="sm" className="h-6 px-2 text-[12px]" asChild>
              <Link href="/principal/risk/students">
                <ShieldAlert aria-hidden="true" />
                At-risk learners
              </Link>
            </Button>
            <Button variant="secondary" size="sm" className="h-6 px-2 text-[12px]" asChild>
              <Link href="/principal/risk">
                <ListFilter aria-hidden="true" />
                Risk board
              </Link>
            </Button>
          </>
        }
      />

      {isEmpty ? (
        <PageEmptyCallout>
          No attendance data for adviser-shared sections in the active term yet.
          Records will appear here once school days elapse.
        </PageEmptyCallout>
      ) : (
        <>
          <AttendanceStatsDeck
            rateFilter={rateFilter}
            onSelectFilter={setRateFilter}
            onOpenSections={scrollToSections}
          />

          <div ref={sectionsRef} className={styles.sectionsAnchor}>
            <SectionTrends />
          </div>
        </>
      )}
    </section>
  );
}
