"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarCheck,
  School,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUpNumber } from "@/app/principal/overview/components/CountUpNumber";
// Share the overview deck's stylesheet so the attendance strip is literally the
// same surface: muted head rail, divided tiles, number + unit + hint.
import deck from "@/app/principal/overview/components/PrincipalOverviewStats.module.css";
import styles from "./AttendanceStatsDeck.module.css";

export type AttendanceRateFilter = "all" | "below";

interface SectionStat {
  sectionId: string;
  section: string;
  gradeLevel: string;
  enrolled: number;
  rate: number;
}

interface TrendPoint {
  date: string;
  rate: number;
}

const SHARED_PARAMS = { sharedOnly: true } as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

function trendDirection(points: TrendPoint[]): "up" | "down" | "flat" {
  if (points.length < 4) return "flat";
  const rates = points.map((p) => p.rate);
  const half = Math.floor(rates.length / 2);
  const first = rates.slice(0, half).reduce((a, r) => a + r, 0) / half;
  const second =
    rates.slice(half).reduce((a, r) => a + r, 0) / (rates.length - half);
  const diff = second - first;
  if (diff > 2) return "up";
  if (diff < -2) return "down";
  return "flat";
}

interface TileSpec {
  key: string;
  icon: LucideIcon;
  title: string;
  unit: string;
  value: number;
  hint: string;
  /** Filter the section list lands on when the tile is clicked. Omitted when
   *  the tile only jumps to the board (e.g. the school-average read). */
  filter?: AttendanceRateFilter;
  attention?: boolean;
}

/**
 * Attendance counterpart of the principal overview KPI deck — one bordered
 * strip, four divided tiles, a head rail that carries the open-work badge and
 * a footnote for the term's direction. Every tile is a control: clicking it
 * filters the section list below (and opens it).
 */
export function AttendanceStatsDeck({
  rateFilter,
  onSelectFilter,
  onOpenSections,
}: {
  rateFilter: AttendanceRateFilter;
  onSelectFilter: (filter: AttendanceRateFilter) => void;
  onOpenSections: () => void;
}) {
  const statsQuery = useQuery({
    queryKey: ["attendance-section-averages", "shared"],
    queryFn: async () => {
      const res = await apiClient.get<{
        sections: SectionStat[];
        trend: TrendPoint[];
        schoolDays: number;
        totalEnrolled: number;
      }>("/api/attendance/section-stats", { params: SHARED_PARAMS });
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const attentionQuery = useQuery({
    queryKey: ["attendance-needs-attention", "shared"],
    queryFn: async () => {
      const res = await apiClient.get<{ students: unknown[] }>(
        "/api/attendance/at-risk-students",
        { params: SHARED_PARAMS },
      );
      return res.data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const loading = statsQuery.isPending || attentionQuery.isPending;
  const sections = React.useMemo(
    () => statsQuery.data?.sections ?? [],
    [statsQuery.data],
  );

  const below = sections.filter((s) => s.rate < 80).length;
  const atRisk = attentionQuery.data?.students.length ?? 0;
  const schoolDays = statsQuery.data?.schoolDays ?? 0;

  // Headcount-weighted mean — the true school rate, not the mean of means.
  const average = React.useMemo(() => {
    const enrolled = sections.reduce((sum, s) => sum + s.enrolled, 0);
    if (enrolled > 0) {
      return round1(
        sections.reduce((sum, s) => sum + s.rate * s.enrolled, 0) / enrolled,
      );
    }
    return sections.length
      ? round1(sections.reduce((sum, s) => sum + s.rate, 0) / sections.length)
      : 0;
  }, [sections]);

  const direction = React.useMemo(
    () => trendDirection(statsQuery.data?.trend ?? []),
    [statsQuery.data],
  );
  const directionLabel =
    direction === "up" ? "Improving" : direction === "down" ? "Slipping" : "Steady";

  const tiles: TileSpec[] = [
    {
      key: "sections",
      icon: School,
      title: "Sections",
      unit: "tracked",
      value: sections.length,
      hint: "Adviser-shared this term",
      filter: "all",
    },
    {
      key: "below",
      icon: TriangleAlert,
      title: "Below 80%",
      unit: "sections",
      value: below,
      hint: "Under the target rate",
      filter: "below",
      attention: true,
    },
    {
      key: "learners",
      icon: Users,
      title: "At-risk learners",
      unit: "learners",
      value: atRisk,
      hint: "Attendance below 80%",
      filter: "below",
      attention: true,
    },
    {
      key: "average",
      icon: Activity,
      title: "School average",
      unit: "%",
      value: Math.round(average),
      hint: `${directionLabel} this term`,
    },
  ];

  if (loading) {
    return (
      <section className={deck.deck} aria-busy="true" aria-label="Attendance loading">
        <div className={deck.deckHead}>
          <span className={deck.deckTitle}>
            <Skeleton className="h-3.5 w-36" />
          </span>
        </div>
        <div className={deck.tiles}>
          {tiles.map((tile) => (
            <div key={tile.key} className={deck.tile} aria-hidden="true">
              <span className={deck.tileTop}>
                <Skeleton className={deck.skelIcon} />
                <Skeleton className="h-3 w-20" />
              </span>
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={deck.deck} aria-label="Attendance at a glance">
      <div className={deck.deckHead}>
        <span className={deck.deckTitle}>
          <CalendarCheck aria-hidden /> Attendance at a glance
        </span>
      </div>

      <div className={deck.tiles}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const active = tile.filter !== undefined && tile.filter === rateFilter;
          return (
            <button
              key={tile.key}
              type="button"
              className={[
                deck.tile,
                styles.tileButton,
                tile.attention ? styles.tileAttention : "",
                active ? styles.tileActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={tile.filter === undefined ? undefined : active}
              aria-label={`${tile.title}: ${tile.value} ${tile.unit} — ${
                tile.filter === undefined ? "open" : "filter"
              } the section list`}
              onClick={() => {
                if (tile.filter !== undefined) onSelectFilter(tile.filter);
                onOpenSections();
              }}
            >
              <span className={deck.tileTop}>
                <span className={deck.tileIcon} aria-hidden>
                  <Icon size={13} />
                </span>
                <span className={deck.tileLabel}>{tile.title}</span>
              </span>
              <span className={deck.tileValue}>
                <CountUpNumber
                  className={`${deck.tileNumber} ${
                    tile.value === 0 ? deck.tileNumberZero : ""
                  } ${tile.attention && tile.value > 0 ? styles.numberAlert : ""}`}
                  value={tile.value}
                />
                <span className={deck.tileUnit}>{tile.unit}</span>
              </span>
              <span className={deck.tileHint}>{tile.hint}</span>
            </button>
          );
        })}
      </div>

      <p className={deck.deckFoot}>
        {schoolDays > 0
          ? `${schoolDays} school day${schoolDays === 1 ? "" : "s"} elapsed. `
          : ""}
        Direction: <strong>{directionLabel}</strong> — second half of the term
        against the first half. Only sections whose adviser turned on data
        sharing are counted.
      </p>
    </section>
  );
}
