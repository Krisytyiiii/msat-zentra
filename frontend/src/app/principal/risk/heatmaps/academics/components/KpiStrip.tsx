"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  School,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUpNumber } from "../../../../overview/components/CountUpNumber";
import { AwaitingGradesBoard } from "./AwaitingGradesBoard";
import type { UngradedStudent } from "./types";
import styles from "./academics.module.css";

interface StatTile {
  key: string;
  icon: LucideIcon;
  title: string;
  unit: string;
  value: number;
  hint: string;
  /** Where the tile takes you — every number opens its source list. */
  href?: string;
  /** Amber accent for the tile that flags work still needing action. */
  tone?: "amber";
}

/**
 * Top stat deck for the academic heatmap — same structure as the principal
 * overview deck (one bordered strip, divided tiles, number + unit + hint), so
 * the two desks read the same. The "Awaiting grades" tile is a button instead
 * of a link: it opens the learner list underneath the strip.
 */
export function KpiStrip({
  below,
  gradedTotal,
  riskySections,
  sectionCount,
  ungraded,
  ungradedStudents,
  sharedTotal,
  isPending,
}: {
  below: number;
  gradedTotal: number;
  riskySections: number;
  sectionCount: number;
  /** Adviser-shared learners with no grade record yet this term. */
  ungraded: number;
  /** Those same learners, listed when the stat is tapped. */
  ungradedStudents: UngradedStudent[];
  /** All adviser-shared learners in scope. */
  sharedTotal: number;
  isPending: boolean;
}) {
  const [showUngraded, setShowUngraded] = React.useState(false);
  const belowPct =
    gradedTotal > 0 ? Math.round((below / gradedTotal) * 100) : 0;

  if (!isPending && sectionCount === 0 && gradedTotal === 0 && ungraded === 0)
    return null;

  const tiles: StatTile[] = [
    {
      key: "below",
      icon: TriangleAlert,
      title: "Students below 75",
      unit: "learners",
      value: below,
      hint: `${belowPct}% of ${gradedTotal.toLocaleString()} graded learners`,
      href: "/principal/risk/students",
    },
    {
      key: "sections",
      icon: Users,
      title: "Sections at risk",
      unit: "sections",
      value: riskySections,
      hint: `Of ${sectionCount.toLocaleString()} sections with grades`,
      href: "/principal/academics",
      tone: "amber",
    },
    {
      key: "ungraded",
      icon: Clock,
      title: "Awaiting grades",
      unit: "learners",
      value: ungraded,
      hint:
        ungraded > 0
          ? `Of ${sharedTotal.toLocaleString()} adviser-shared learners`
          : "Every shared learner has a grade record",
    },
  ];

  if (isPending) {
    return (
      <section
        className={styles.deck}
        aria-busy="true"
        aria-label="Academic overview loading"
      >
        <div className={styles.deckHead}>
          <span className={styles.deckTitle}>
            <Skeleton className="h-3.5 w-36" />
          </span>
        </div>
        <div className={styles.tiles}>
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className={`${styles.tile} ${
                tile.tone === "amber" ? styles.tileAmber : ""
              }`}
              aria-hidden="true"
            >
              <span className={styles.tileTop}>
                <Skeleton className={styles.skelIcon} />
                <Skeleton className="h-3 w-24" />
              </span>
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.deck} aria-label="Academic overview">
      <div className={styles.deckHead}>
        <span className={styles.deckTitle}>
          <School aria-hidden /> Academics at a glance
        </span>
      </div>
      <div className={styles.tiles}>
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const zero = tile.value === 0;
          const tileClass = `${styles.tile} ${
            tile.tone === "amber" ? styles.tileAmber : ""
          }`;

          if (tile.href) {
            return (
              <Link
                key={tile.key}
                href={tile.href}
                className={tileClass}
                aria-label={`${tile.title}: ${tile.value} ${tile.unit} — open list`}
              >
                <span className={styles.tileTop}>
                  <span className={styles.tileIcon} aria-hidden>
                    <Icon size={13} />
                  </span>
                  <span className={styles.tileLabel}>{tile.title}</span>
                  <ArrowRight className={styles.tileArrow} aria-hidden />
                </span>
                <span className={styles.tileValue}>
                  <CountUpNumber
                    className={`${styles.tileNumber} ${
                      zero ? styles.tileNumberZero : ""
                    }`}
                    value={tile.value}
                  />
                  <span className={styles.tileUnit}>{tile.unit}</span>
                </span>
                <span className={styles.tileHint}>{tile.hint}</span>
              </Link>
            );
          }

          return (
            <button
              key={tile.key}
              type="button"
              className={tileClass}
              onClick={() => setShowUngraded((open) => !open)}
              disabled={zero}
              {...(zero
                ? {}
                : {
                    "aria-expanded": showUngraded,
                    "aria-controls": "awaiting-grades-table",
                  })}
              aria-label={`${tile.title}: ${tile.value} ${tile.unit} — ${
                showUngraded ? "hide" : "open"
              } list`}
            >
              <span className={styles.tileTop}>
                <span className={styles.tileIcon} aria-hidden>
                  <Icon size={13} />
                </span>
                <span className={styles.tileLabel}>{tile.title}</span>
                <ChevronDown
                  className={`${styles.tileArrow} ${
                    showUngraded ? styles.tileArrowOpen : ""
                  }`}
                  aria-hidden
                />
              </span>
              <span className={styles.tileValue}>
                <CountUpNumber
                  className={`${styles.tileNumber} ${
                    zero ? styles.tileNumberZero : ""
                  }`}
                  value={tile.value}
                />
                <span className={styles.tileUnit}>{tile.unit}</span>
              </span>
              <span className={styles.tileHint}>{tile.hint}</span>
            </button>
          );
        })}
      </div>
      <p className={styles.deckFoot}>
        Only learners whose section adviser has turned on data sharing are
        counted here. Tap “Awaiting grades” to list learners without a grade
        record yet.
      </p>

      {showUngraded && ungradedStudents.length > 0 ? (
        <div id="awaiting-grades-table" className={styles.deckPanel}>
          <AwaitingGradesBoard
            students={ungradedStudents}
            onClose={() => setShowUngraded(false)}
          />
        </div>
      ) : null}
    </section>
  );
}
