"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  Inbox,
  MessagesSquare,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { SearchField } from "@/components/ui/search-field";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import type { GuidanceTypeSummary } from "@/services/guidance/guidance.types";
import styles from "./guidance-referrals.module.css";

type BoardTrack = "ADM" | "Counseling";

interface FigureSpec {
  key: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  /** Tint the tile amber while it still holds work. */
  attention?: boolean;
  /** Cleared/positive figure — rendered in the green tone. */
  positive?: boolean;
  pick: (byType: GuidanceTypeSummary | undefined) => number;
}

const count = (value: number | undefined) => Math.max(0, value ?? 0);

/* Six tiles per board, in the order a case usually moves: the work still
   sitting on the desk first, then the sessions, then the closed outcomes. */
const STAT_SPECS: Record<BoardTrack, FigureSpec[]> = {
  ADM: [
    {
      key: "needs_review",
      icon: Inbox,
      label: "Needs review",
      hint: "Awaiting your triage",
      attention: true,
      pick: (t) => count(t?.pending),
    },
    {
      key: "booked",
      icon: CalendarClock,
      label: "Booked session",
      hint: "Session scheduled",
      pick: (t) => count(t?.booked),
    },
    {
      key: "endorsed",
      icon: Send,
      label: "Endorsed",
      hint: "With the ADM coordinator",
      positive: true,
      pick: (t) => count(t?.inProgress),
    },
    {
      key: "followup",
      icon: Activity,
      label: "Follow-up",
      hint: "Still being monitored",
      attention: true,
      pick: (t) => count(t?.followUp),
    },
    {
      key: "rejected",
      icon: XCircle,
      label: "Rejected",
      hint: "Closed by guidance",
      pick: (t) => Math.max(0, count(t?.dismissed) - count(t?.cancelled)),
    },
    {
      key: "cancelled",
      icon: Ban,
      label: "Cancelled",
      hint: "Withdrawn by the referrer",
      pick: (t) => count(t?.cancelled),
    },
  ],
  Counseling: [
    {
      key: "needs_review",
      icon: Inbox,
      label: "Needs review",
      hint: "Awaiting your triage",
      attention: true,
      pick: (t) => count(t?.pending),
    },
    {
      key: "booked",
      icon: CalendarClock,
      label: "Booked session",
      hint: "Session scheduled",
      pick: (t) => count(t?.booked),
    },
    {
      key: "done",
      icon: CheckCircle2,
      label: "Done",
      hint: "Sessions completed",
      positive: true,
      pick: (t) => count(t?.done),
    },
    {
      key: "followup",
      icon: Activity,
      label: "Follow-up",
      hint: "Still being monitored",
      attention: true,
      pick: (t) => count(t?.followUp),
    },
    {
      key: "escalated",
      icon: AlertTriangle,
      label: "Escalated",
      hint: "With a higher office",
      pick: (t) => count(t?.escalated),
    },
    {
      key: "cancelled",
      icon: Ban,
      label: "Cancelled",
      hint: "Withdrawn by the referrer",
      pick: (t) => count(t?.cancelled),
    },
  ],
};

const TRACK_ICON: Record<BoardTrack, LucideIcon> = {
  ADM: FolderOpen,
  Counseling: MessagesSquare,
};

/**
 * Case-board desk head — the same anatomy as the nurse ADM / clinic boards:
 * a badge, the board title, and the tools (search) on the right, with the
 * whole-term figure strip pinned underneath.
 */
export function GuidanceBoardDeskHead({
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
 * The figure strip under the head. Counts come from the referrals response's
 * whole-desk `summary.byType[track]` (no search/action lens applied), never
 * from the sixteen rows the board has paged in, so the tiles hold still while
 * the board pages.
 */
export function GuidanceBoardFigures({
  track,
  byType,
  loading = false,
}: {
  track: BoardTrack;
  byType?: GuidanceTypeSummary;
  loading?: boolean;
}) {
  const items = React.useMemo<StatDeckItem[]>(
    () =>
      STAT_SPECS[track].map((spec) => {
        const value = spec.pick(byType);
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
      }),
    [byType, track]
  );

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
