"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  CalendarX,
  FileSignature,
  GraduationCap,
  School,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTerm } from "@/lib/term/TermContext";
import { fetchOverview } from "@/services/principal/overview.service";
import { CountUpNumber } from "./CountUpNumber";
import styles from "./PrincipalOverviewStats.module.css";

interface StatItem {
  key: string;
  icon: LucideIcon;
  /** Tile label — the metric name only, never the raw value. */
  title: string;
  /** Unit under the number, uppercase like the registry stat deck. */
  unit: string;
  value: number;
  hint: string;
  /** Where the tile takes you — every number opens its source list. */
  href: string;
  /** Queues that need a decision feed the header's open-work badge. */
  attention?: boolean;
}

/**
 * Top KPI deck of the principal overview — one bordered strip with a tile per
 * school-health metric and follow-up queue, same structure and micro-motion as
 * the registry overview attention deck (header strip, divided tiles, number +
 * unit + hint). Each tile is a link, so a non-technical reader can click a
 * number and land on the list it came from.
 */
export function PrincipalOverviewStats() {
  const { activeTerm } = useTerm();
  const { data, isPending, isError } = useQuery({
    queryKey: ["overview", activeTerm?.termId ?? null],
    queryFn: fetchOverview,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const items: StatItem[] = [
    {
      key: "enrollment",
      icon: GraduationCap,
      title: "Enrolled",
      unit: "learners",
      value: data?.kpis.enrollment ?? 0,
      hint: "Learners on the roll",
      href: "/principal/risk/students",
    },
    {
      key: "sections",
      icon: School,
      title: "Sections",
      unit: "sections",
      value: data?.kpis.activeSections ?? 0,
      hint: "Active class sections",
      href: "/principal/academics",
    },
    {
      key: "teachers",
      icon: Users,
      title: "Teachers",
      unit: "staff",
      value: data?.kpis.teachers ?? 0,
      hint: "Assigned teaching staff",
      href: "/principal/academics/assign",
    },
    {
      key: "anecdotals",
      icon: BookOpenCheck,
      title: "Anecdotals",
      unit: "records",
      value: data?.kpis.anecdotals ?? 0,
      hint: "Records filed this term",
      href: "/principal/risk/heatmaps/records",
    },
    {
      key: "risk",
      icon: ShieldAlert,
      title: "At-risk learners",
      unit: "flagged",
      value: data?.atRisk.students ?? 0,
      hint: `${data?.riskByLevel.high ?? 0} high · ${data?.riskByLevel.moderate ?? 0} moderate`,
      href: "/principal/risk/students",
      attention: true,
    },
    {
      key: "adm",
      icon: FileSignature,
      title: "ADM referrals",
      unit: "waiting",
      value: data?.admPending ?? 0,
      hint: "Waiting on a principal decision",
      href: "/principal/adm/referrals/all",
      attention: true,
    },
    {
      key: "attendance",
      icon: CalendarX,
      title: "Attendance watch",
      unit: "sections",
      value: data?.attendanceWatch ?? 0,
      hint: "Sections below 80% attendance",
      href: "/principal/risk/heatmaps/attendance",
      attention: true,
    },
    {
      key: "honor",
      icon: Award,
      title: "Honor roll",
      unit: "qualifiers",
      value: data?.honorRoll ?? 0,
      hint: "Qualifiers this term",
      href: "/principal/honor-roll",
    },
  ];

  if (isPending) {
    return (
      <section className={styles.deck} aria-busy="true" aria-label="School health loading">
        <div className={styles.deckHead}>
          <span className={styles.deckTitle}>
            <Skeleton className="h-3.5 w-32" />
          </span>
        </div>
        <div className={styles.tiles}>
          {items.map((s) => (
            <div key={s.key} className={styles.tile} aria-hidden="true">
              <span className={styles.tileTop}>
                <Skeleton className={styles.skelIcon} />
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

  if (isError) {
    return (
      <section className={styles.deck} aria-label="School health">
        <div className={styles.deckHead}>
          <span className={styles.deckTitle}>
            <School aria-hidden /> School at a glance
          </span>
        </div>
        <p className={styles.empty}>Could not load school health figures.</p>
      </section>
    );
  }

  return (
    <section className={styles.deck} aria-label="School health">
      <div className={styles.deckHead}>
        <span className={styles.deckTitle}>
          <School aria-hidden /> School at a glance
        </span>
      </div>
      <div className={styles.tiles}>
        {items.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.key}
              href={s.href}
              className={styles.tile}
              aria-label={`${s.title}: ${s.value} ${s.unit} — open list`}
            >
              <span className={styles.tileTop}>
                <span className={styles.tileIcon} aria-hidden>
                  <Icon size={13} />
                </span>
                <span className={styles.tileLabel}>{s.title}</span>
                <ArrowRight className={styles.tileArrow} aria-hidden />
              </span>
              <span className={styles.tileValue}>
                <CountUpNumber
                  className={`${styles.tileNumber} ${
                    s.value === 0 ? styles.tileNumberZero : ""
                  }`}
                  value={s.value}
                />
                <span className={styles.tileUnit}>{s.unit}</span>
              </span>
              <span className={styles.tileHint}>{s.hint}</span>
            </Link>
          );
        })}
      </div>
      <p className={styles.deckFoot}>
        Only learners whose section adviser has turned on data sharing are
        counted here.
      </p>
    </section>
  );
}
