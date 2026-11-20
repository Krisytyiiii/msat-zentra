"use client";

import { MapPin } from "lucide-react";
import { findHotspot } from "@/components/risk-dashboard/RiskHotspot";
import { useNurseAdmRiskData } from "./use-nurse-risk-data";
import styles from "./nurse-adm.module.css";

/**
 * Busiest-spot readout — the hotspot board condensed to one line so it rides in
 * the header rail of the ADM stats deck instead of taking a full board below.
 */
export function NurseAdmHotspotStat() {
  const { isPending, dashboard } = useNurseAdmRiskData();
  const hotspot = dashboard
    ? findHotspot(dashboard.matrix, dashboard.matrixCategories, dashboard.totalCases)
    : null;

  return (
    <span className={styles.hotspotInline}>
      <MapPin size={13} aria-hidden className="text-amber-500" />
      Busiest spot
      <strong className={styles.hotspotInlineValue}>
        {isPending || !dashboard
          ? "…"
          : hotspot
            ? hotspot.section
            : "—"}
      </strong>
      {!isPending && dashboard && hotspot ? (
        <span className={styles.hotspotInlineMeta}>
          {hotspot.count} {hotspot.category.toLowerCase()} case
          {hotspot.count === 1 ? "" : "s"}
        </span>
      ) : null}
    </span>
  );
}
