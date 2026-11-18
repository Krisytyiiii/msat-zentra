"use client";

import * as React from "react";
import type { RiskFactor } from "@/services/principal/risk.types";

export type RiskLevelFocus = "High" | "Moderate" | "Low" | null;

interface RiskFocusValue {
  level: RiskLevelFocus;
  factor: RiskFactor | null;
  section: string | null;
  hasFocus: boolean;
  toggleLevel: (level: Exclude<RiskLevelFocus, null>) => void;
  toggleFactor: (factor: RiskFactor) => void;
  toggleSection: (section: string) => void;
  clear: () => void;
}

const RiskFocusContext = React.createContext<RiskFocusValue | null>(null);

/**
 * One focus selection shared by every board on the principal risk page. The
 * overview tiles and the section chart write to it; the learner table reads it.
 * Keeping it here (instead of per-widget state) is what makes a click on a
 * level or a bar narrow the whole page instead of just one card.
 */
export function RiskFocusProvider({ children }: { children: React.ReactNode }) {
  const [level, setLevel] = React.useState<RiskLevelFocus>(null);
  const [factor, setFactor] = React.useState<RiskFactor | null>(null);
  const [section, setSection] = React.useState<string | null>(null);

  const toggleLevel = React.useCallback((next: Exclude<RiskLevelFocus, null>) => {
    setLevel((prev) => (prev === next ? null : next));
  }, []);

  const toggleFactor = React.useCallback((next: RiskFactor) => {
    setFactor((prev) => (prev === next ? null : next));
  }, []);

  const toggleSection = React.useCallback((next: string) => {
    setSection((prev) => (prev === next ? null : next));
  }, []);

  const clear = React.useCallback(() => {
    setLevel(null);
    setFactor(null);
    setSection(null);
  }, []);

  const value = React.useMemo<RiskFocusValue>(
    () => ({
      level,
      factor,
      section,
      hasFocus: level !== null || factor !== null || section !== null,
      toggleLevel,
      toggleFactor,
      toggleSection,
      clear,
    }),
    [level, factor, section, toggleLevel, toggleFactor, toggleSection, clear],
  );

  return <RiskFocusContext.Provider value={value}>{children}</RiskFocusContext.Provider>;
}

export function useRiskFocus(): RiskFocusValue {
  const ctx = React.useContext(RiskFocusContext);
  if (!ctx) {
    throw new Error("useRiskFocus must be used inside <RiskFocusProvider>");
  }
  return ctx;
}
