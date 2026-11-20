"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarCheck, School, TriangleAlert, Users } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";

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

/**
 * Attendance counterpart of the principal overview deck — rendered through the
 * shared `StatDeck`. Every tile is a control: clicking it filters the section
 * list below (and opens it).
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

  const pick = (filter: AttendanceRateFilter) => () => {
    onSelectFilter(filter);
    onOpenSections();
  };

  const tiles: StatDeckItem[] = [
    {
      key: "sections",
      icon: School,
      label: "Sections",
      unit: "tracked",
      value: sections.length,
      hint: "Adviser-shared this term",
      onClick: pick("all"),
      active: rateFilter === "all",
      ariaLabel: `Sections: ${sections.length} tracked — filter the section list`,
    },
    {
      key: "below",
      icon: TriangleAlert,
      label: "Below 80%",
      unit: "sections",
      value: below,
      hint: "Under the target rate",
      onClick: pick("below"),
      active: rateFilter === "below",
      tone: "red",
      ariaLabel: `Below 80%: ${below} sections — filter the section list`,
    },
    {
      key: "learners",
      icon: Users,
      label: "At-risk learners",
      unit: "learners",
      value: atRisk,
      hint: "Attendance below 80%",
      onClick: pick("below"),
      active: rateFilter === "below",
      tone: "red",
      ariaLabel: `At-risk learners: ${atRisk} learners — filter the section list`,
    },
    {
      key: "average",
      icon: Activity,
      label: "School average",
      unit: "%",
      value: Math.round(average),
      hint: `${directionLabel} this term`,
      onClick: () => onOpenSections(),
      ariaLabel: `School average: ${Math.round(average)}% — open the section list`,
    },
  ];

  return (
    <StatDeck
      title="Attendance at a glance"
      icon={CalendarCheck}
      ariaLabel="Attendance at a glance"
      items={tiles}
      loading={loading}
      footer={
        <>
          {schoolDays > 0
            ? `${schoolDays} school day${schoolDays === 1 ? "" : "s"} elapsed. `
            : ""}
          Direction: <strong>{directionLabel}</strong> — second half of the term
          against the first half. Only sections whose adviser turned on data
          sharing are counted.
        </>
      }
    />
  );
}
