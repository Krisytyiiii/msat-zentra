"use client";

import * as React from "react";
import {
  Activity,
  Ban,
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  Inbox,
  Send,
  Stethoscope,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { SearchField } from "@/components/ui/search-field";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import type { NurseBreakdownRow } from "@/services/nurse/nurse.types";
import styles from "../nurse-referrals-page.module.css";

type BoardTrack = "adm" | "clinic";

interface StatSpec {
  /** Bucket key the server's breakdown uses for this figure. */
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  /** Tint the tile amber while it still holds work. */
  attention?: boolean;
  /** Cleared/positive figure — rendered in the green tone. */
  positive?: boolean;
}

/* Six tiles per board, in the order a case usually moves: the work still
   sitting on the desk first, then the sessions, then the closed outcomes. */
const STAT_SPECS: Record<BoardTrack, StatSpec[]> = {
  adm: [
    {
      key: "needs_review",
      icon: Inbox,
      label: "Needs review",
      hint: "Awaiting your triage",
      attention: true,
    },
    {
      key: "booked",
      icon: CalendarClock,
      label: "Booked session",
      hint: "Clinic session scheduled",
    },
    {
      key: "endorsed",
      icon: Send,
      label: "Endorsed",
      hint: "With the ADM coordinator",
      positive: true,
    },
    {
      key: "followup",
      icon: Activity,
      label: "Follow-up",
      hint: "Still being monitored",
      attention: true,
    },
    {
      key: "rejected",
      icon: XCircle,
      label: "Rejected",
      hint: "Sent back by the clinic",
    },
    {
      key: "cancelled",
      icon: Ban,
      label: "Cancelled",
      hint: "Withdrawn by the referrer",
    },
  ],
  clinic: [
    {
      key: "needs_review",
      icon: Inbox,
      label: "Needs review",
      hint: "Awaiting your triage",
      attention: true,
    },
    {
      key: "booked",
      icon: CalendarClock,
      label: "Booked session",
      hint: "Clinic session scheduled",
    },
    {
      key: "followup",
      icon: Activity,
      label: "Follow-up",
      hint: "Still being monitored",
      attention: true,
    },
    {
      key: "done",
      icon: CheckCircle2,
      label: "Done",
      hint: "Sessions completed",
    },
    {
      key: "rejected",
      icon: XCircle,
      label: "Rejected",
      hint: "Closed by the clinic",
    },
    {
      key: "cancelled",
      icon: Ban,
      label: "Cancelled",
      hint: "Withdrawn by the referrer",
    },
  ],
};

const TRACK_ICON: Record<BoardTrack, LucideIcon> = {
  adm: FolderOpen,
  clinic: Stethoscope,
};

/**
 * Case-board desk head — the same anatomy as the anecdotal register: a badge,
 * the board title, and the tools (search + refresh) on the right, with the
 * whole-term figure strip pinned underneath.
 */
export function NurseBoardDeskHead({
  track,
  title,
  query,
  onQueryChange,
  searchPlaceholder,
  loading = false,
}: {
  track: BoardTrack;
  title: string;
  query: string;
  onQueryChange: (next: string) => void;
  searchPlaceholder: string;
  /** Shows the field's spinner while the debounced server search runs. */
  loading?: boolean;
}) {
  const BadgeIcon = TRACK_ICON[track];

  return (
    <header className={styles.deskHead}>
      <span className={styles.deskBadge} aria-hidden>
        <BadgeIcon size={16} />
      </span>
      <div className={styles.deskHeading}>
        <h1 className={styles.deskTitle}>{title}</h1>
      </div>
      <div className={styles.deskTools}>
        <SearchField
          className="w-full max-w-60 sm:w-60"
          placeholder={searchPlaceholder}
          value={query}
          onChange={onQueryChange}
          aria-label={searchPlaceholder}
          loading={loading}
        />
      </div>
    </header>
  );
}

/**
 * The figure strip under the head. Counts come from `GET /api/nurse/overview`
 * (whole term scope), never from the sixteen rows the board has paged in, so
 * the tiles hold still while the board pages.
 */
export function NurseBoardFigures({
  track,
  breakdown,
  loading = false,
}: {
  track: BoardTrack;
  breakdown: NurseBreakdownRow[];
  loading?: boolean;
}) {
  const items = React.useMemo<StatDeckItem[]>(() => {
    const counts = new Map(breakdown.map((row) => [row.key, row.count]));
    return STAT_SPECS[track].map((spec) => {
      const value = counts.get(spec.key) ?? 0;
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
            : spec.key === "rejected" && value > 0
              ? ("red" as const)
              : undefined,
      };
    });
  }, [breakdown, track]);

  return (
    <StatDeck
      ariaLabel="Case figures"
      columns={6}
      loading={loading}
      items={items}
      footer="Whole-term counts for every case on this desk — the board pages them sixteen at a time."
    />
  );
}
