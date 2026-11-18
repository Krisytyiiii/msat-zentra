"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRecords } from "@/services/principal/records.service";
import { RecordsSummary } from "./components/RecordsSummary";
import { RecordsCharts } from "./components/RecordsCharts";
import { RecordsHeatblocks } from "./components/RecordsHeatblocks";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import type { BehavioralCategory } from "./types";
import styles from "./components/records.module.css";

export default function PrincipalRecordsPage() {
  const { termReady } = useTerm();
  // Staff file anecdotal records all day; this desk stays live so the
  // principal sees new records without reloading.
  const { data, isPending, isError } = useQuery({
    ...liveQueryOptions,
    queryKey: ["records-heatmap"],
    queryFn: fetchRecords,
    enabled: termReady,
  });

  // Summary panel → record board wiring: a category filters the list, a
  // learner seeds the search. Both scroll the board into view.
  const [category, setCategory] = React.useState<BehavioralCategory | null>(
    null
  );
  const [focus, setFocus] = React.useState<{
    lrn: string;
    nonce: number;
  } | null>(null);
  const focusNonce = React.useRef(0);
  const boardRef = React.useRef<HTMLDivElement>(null);
  const shouldScroll = React.useRef(false);

  const scrollToBoard = React.useCallback(() => {
    shouldScroll.current = true;
  }, []);

  const selectCategory = React.useCallback(
    (next: BehavioralCategory | null) => {
      setCategory(next);
      scrollToBoard();
    },
    [scrollToBoard]
  );

  const focusLearner = React.useCallback(
    (lrn: string) => {
      focusNonce.current += 1;
      setFocus({ lrn, nonce: focusNonce.current });
      scrollToBoard();
    },
    [scrollToBoard]
  );

  React.useEffect(() => {
    if (!shouldScroll.current) return;
    shouldScroll.current = false;
    const node = boardRef.current;
    if (!node) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }, [category, focus]);

  const total = (data?.sections ?? []).reduce(
    (sum, s) => sum + s.students.reduce((a, st) => a + st.behavioral.length, 0),
    0
  );
  const isEmpty = !isPending && !isError && total === 0;

  return (
    <section className={styles.page} aria-busy={isPending || undefined}>
      {isEmpty ? (
        <PageEmptyCallout>
          No anecdotal records filed for the active term yet. New records will
          appear here once filed.
        </PageEmptyCallout>
      ) : (
        <div className={styles.mainColumn}>
          <RecordsSummary
            category={category}
            onSelectCategory={selectCategory}
            onFocusLearner={focusLearner}
          />
          <RecordsCharts />
          <div ref={boardRef} style={{ scrollMarginTop: "5rem" }}>
            <RecordsHeatblocks
              category={category}
              onClearCategory={() => selectCategory(null)}
              focus={focus}
            />
          </div>
        </div>
      )}
    </section>
  );
}
