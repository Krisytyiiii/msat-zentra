"use client";

import * as React from "react";
import { ArrowRight, Share2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SectionSummary } from "@/services/principal/academics";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pill } from "@/components/ui/pill";
import { SectionCardSkeleton } from "./SectionCardSkeleton";
import styles from "./SectionCardGrid.module.css";

interface SectionCardGridProps {
  /** Already filtered and sorted by the page toolbar. */
  sections: SectionSummary[];
  /** Total sections before filtering — distinguishes "no sections" from "no hits". */
  totalCount: number;
  loading: boolean;
  filtersActive: boolean;
  onClearFilters: () => void;
  selectedSectionId: string | null;
  onSelectSection: (id: string | null) => void;
}

type Tone = "warn" | "caution" | null;

function averageTone(value: number): Tone {
  if (!Number.isFinite(value)) return null;
  if (value < 75) return "warn";
  if (value < 80) return "caution";
  return null;
}

function passWidth(pct: number): string {
  const safe = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return `${safe}%`;
}

/** Passing-rate meter colour: green when healthy, amber near the line, red below. */
function passTone(pct: number): "good" | "warn" | "low" {
  if (pct >= 90) return "good";
  if (pct >= 75) return "warn";
  return "low";
}

/**
 * The section board: one restrained card per class. Each card leads with the
 * section identity, then its three figures, a passing-rate meter and a clear
 * "view roster" affordance — no decorative colour chips, the numbers do the
 * talking and only a below-threshold average picks up a warning colour.
 */
export function SectionCardGrid({
  sections,
  totalCount,
  loading,
  filtersActive,
  onClearFilters,
  selectedSectionId,
  onSelectSection,
}: SectionCardGridProps) {
  if (loading && totalCount === 0) {
    return (
      <div className={styles.grid} aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <SectionCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (totalCount === 0) {
    // Empty board reads as a plain insight callout — no card shell.
    return (
      <div className={styles.emptyCallout}>
        <InsightCallout role="status">
          No sections on file for the active term. Sections will appear here once created.
        </InsightCallout>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className={styles.emptyCallout}>
        <InsightCallout role="status">
          <strong>No sections match your filters.</strong> Try a different name or
          grade level.{" "}
          {filtersActive ? (
            <Button
              type="button"
              variant="link"
              size="xs"
              className={styles.clearBtn}
              onClick={onClearFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </InsightCallout>
      </div>
    );
  }

  return (
    <div className={styles.grid} aria-label="Sections">
      {sections.map((s) => {
        const active = s.sectionId === selectedSectionId;
        const shared = s.shared === true;
        const avg = Number(s.avgTransmuted);
        const tone = averageTone(avg);
        const learners = s.students?.length ?? 0;
        const atRisk = Number(s.atRiskCount) || 0;
        const passPct = Number(s.passPct) || 0;

        return (
          <button
            key={s.sectionId}
            type="button"
            className={`${styles.card} ${active ? styles.cardActive : ""}`}
            onClick={() => onSelectSection(active ? null : s.sectionId)}
            aria-pressed={active}
            aria-label={`${s.section}, ${s.grade}. ${
              shared
                ? `${learners} learners, average ${s.avgTransmuted}, ${atRisk} at risk. Open roster.`
                : "Data sharing is off. Open section."
            }`}
          >
            <span className={styles.cardHead}>
              <span className={styles.cardTitle}>
                <span className={styles.sectionName}>{s.section}</span>
                <Pill field="grade" className="self-start">
                  {s.grade}
                </Pill>
              </span>
              <span
                className={`${styles.shareState} ${shared ? styles.shareOn : styles.shareOff}`}
              >
                {shared ? (
                  <Share2 className={styles.shareIcon} aria-hidden />
                ) : (
                  <ShieldOff className={styles.shareIcon} aria-hidden />
                )}
                {shared ? "Shared" : "Not shared"}
              </span>
            </span>

            {shared ? (
              <>
                <span className={styles.metrics}>
                  <span className={styles.metric}>
                    <span className={styles.metricValue}>{learners}</span>
                    <span className={styles.metricLabel}>Learners</span>
                  </span>
                  <span className={styles.metric}>
                    <span
                      className={`${styles.metricValue} ${
                        tone ? styles[`tone_${tone}`] : ""
                      }`}
                    >
                      {Number.isFinite(avg) ? avg.toFixed(1) : "—"}
                    </span>
                    <span className={styles.metricLabel}>Average</span>
                  </span>
                  <span className={styles.metric}>
                    <span
                      className={`${styles.metricValue} ${atRisk > 0 ? styles.toneWarn : ""}`}
                    >
                      {atRisk}
                    </span>
                    <span className={styles.metricLabel}>At risk</span>
                  </span>
                </span>

                <span className={styles.meterRow}>
                  <span className={styles.meter} aria-hidden>
                    <span
                      className={`${styles.meterFill} ${
                        styles[`meterFill_${passTone(passPct)}`]
                      }`}
                      style={{ width: passWidth(passPct) }}
                    />
                  </span>
                  <span className={styles.meterCaption}>
                    {Math.round(passPct)}% passing
                  </span>
                </span>
              </>
            ) : (
              <span className={styles.unshared}>
                <span className={styles.unsharedTitle}>Learner data is hidden</span>
                <span className={styles.unsharedText}>
                  The class adviser has not turned on data sharing for this
                  section, so learners, grades and risk are not shown.
                </span>
              </span>
            )}

            <span className={styles.cardFoot}>
              <span className={styles.footLabel}>
                {shared ? "View roster" : "Open section"}
              </span>
              <ArrowRight className={styles.footArrow} aria-hidden />
            </span>
          </button>
        );
      })}
    </div>
  );
}
