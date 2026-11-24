"use client";

import * as React from "react";
import {
  CalendarClock,
  ClipboardCheck,
  FolderOpen,
  GraduationCap,
  Home,
  Inbox,
  Send,
  type LucideIcon,
} from "lucide-react";
import { SearchField } from "@/components/ui/search-field";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import styles from "./coordinator-referrals.module.css";

/**
 * Case-board desk head — the same anatomy as the nurse ADM / clinic and
 * guidance ADM boards: a badge, the board title, and the search on the right,
 * with the whole-term figure strip pinned underneath.
 */
export function CoordinatorReferralsDeskHead({
  query,
  onQueryChange,
  loading = false,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  /** Shows the field's spinner while the debounced server search runs. */
  loading?: boolean;
}) {
  return (
    <header className={styles.deskHead}>
      <span className={styles.deskBadge} aria-hidden>
        <FolderOpen size={16} />
      </span>
      <div className={styles.deskHeading}>
        <h1 className={styles.deskTitle}>ADM Cases</h1>
      </div>
      <div className={styles.deskTools}>
        <SearchField
          className="w-full max-w-60 sm:w-60"
          placeholder="Search ADM cases…"
          value={query}
          onChange={onQueryChange}
          aria-label="Search ADM cases"
          loading={loading}
        />
      </div>
    </header>
  );
}

interface FigureSpec {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  /** Tint the tile amber while it still holds work. */
  attention?: boolean;
  /** Cleared/positive figure — rendered in the green tone. */
  positive?: boolean;
  /** Stage keys summed into this figure. */
  stages: string[];
}

/* Six tiles in the order a case moves through the ADM track: the work still
   sitting on the desk first, then the field steps, then the closed track. */
const FIGURE_SPECS: FigureSpec[] = [
  {
    key: "needs_review",
    icon: Inbox,
    label: "Needs review",
    hint: "Awaiting your triage",
    attention: true,
    stages: ["anecdotal", "consultation"],
  },
  {
    key: "meeting_parents",
    icon: CalendarClock,
    label: "Parent meeting",
    hint: "Meeting stage",
    stages: ["meeting_parents"],
  },
  {
    key: "home_visitation",
    icon: Home,
    label: "Home visit",
    hint: "Field follow-through",
    attention: true,
    stages: ["home_visitation"],
  },
  {
    key: "certification",
    icon: ClipboardCheck,
    label: "Certification",
    hint: "Being certified",
    attention: true,
    stages: ["certification"],
  },
  {
    key: "principal_approval",
    icon: Send,
    label: "Principal",
    hint: "Awaiting approval",
    stages: ["principal_approval"],
  },
  {
    key: "enrolled",
    icon: GraduationCap,
    label: "In ADM",
    hint: "Monitoring + completed",
    positive: true,
    stages: ["enrollment_monitoring", "completion"],
  },
];

/**
 * The figure strip under the head. Counts come from the referrals response's
 * whole-desk `stageCounts` (no search/filter lens applied), never from the
 * fifteen rows the board has paged in, so the tiles hold still while the board
 * pages.
 */
export function CoordinatorReferralsFigures({
  stageCounts,
  loading = false,
}: {
  stageCounts: Record<string, number>;
  loading?: boolean;
}) {
  const items = React.useMemo<StatDeckItem[]>(
    () =>
      FIGURE_SPECS.map((spec) => {
        const value = spec.stages.reduce(
          (sum, stage) => sum + Math.max(0, stageCounts[stage] ?? 0),
          0,
        );
        return {
          key: spec.key,
          icon: spec.icon,
          label: spec.label,
          unit: value === 1 ? "case" : "cases",
          value,
          hint: spec.hint,
          tone: spec.positive
            ? ("green" as const)
            : spec.attention && value > 0
              ? ("amber" as const)
              : undefined,
        };
      }),
    [stageCounts],
  );

  return (
    <ShimmerGroup>
      <StatDeck
        ariaLabel="ADM case figures"
        columns={6}
        loading={loading}
        items={items}
        footer="Whole-term counts for every ADM case on this desk — the board pages them fifteen at a time."
      />
    </ShimmerGroup>
  );
}
