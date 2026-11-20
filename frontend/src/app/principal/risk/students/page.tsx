"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CircleAlert, ListFilter, School, ShieldAlert, TriangleAlert } from "lucide-react";
import { fetchAllRiskStudents, fetchHeatmap } from "@/services/principal/riskStudents.service";
import type { RiskFactor, RiskLevelKey } from "@/services/principal/riskStudents.types";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Button } from "@/components/ui/button";
import { StatDeck } from "@/components/ui/stat-deck";
import { PrincipalPageHeader } from "../../components/PrincipalPageHeader";
import { RiskInsightRow } from "./components/RiskInsightRow";
import { StudentHeatmap } from "./components/StudentHeatmap";
import {
  StudentsListTable,
  type FactorFilter,
  type RiskFilter,
} from "./components/StudentsListTable";
import { useTerm } from "@/lib/term/TermContext";
import styles from "./students.module.css";

const ACTIVE_SECTION_KEY = "zentra.risk.students.activeSection";

const FACTOR_ORDER = ["Academic", "Attendance", "Behavioral"] as const;

export default function RiskBoardStudentsPage() {
  const { termReady, activeTerm } = useTerm();
  const [selectedSection, setSelectedSection] = usePersistentState<string>(
    ACTIVE_SECTION_KEY,
    "all",
  );
  // Risk level + factor live here, not in the table, because the insight panels
  // above the heatmap drive the same filters — one source of truth.
  const [riskFilter, setRiskFilter] = usePersistentState<RiskFilter>(
    "zentra.risk.students.risk",
    "all",
  );
  const [factorFilter, setFactorFilter] = usePersistentState<FactorFilter>(
    "zentra.risk.students.factor",
    "all",
  );
  const tableRef = React.useRef<HTMLDivElement>(null);

  const termId = activeTerm?.termId ?? null;
  const schoolYearId = activeTerm?.schoolYearId ?? null;

  const { data: heat, isPending: heatLoading } = useQuery({
    queryKey: ["risk-heatmap", termId, schoolYearId],
    queryFn: () => fetchHeatmap(),
    enabled: termReady,
    // Same window as the students table: heatmap + table stay fresh
    // together, skeleton only on genuine first load.
    staleTime: 120_000,
    gcTime: 600_000,
  });

  // Same key as the table's query, so this only observes its cache — the two
  // boards never fetch the roster twice.
  const { data: roster, isPending: studentsLoading } = useQuery({
    queryKey: ["risk-students-all", termId, schoolYearId],
    queryFn: fetchAllRiskStudents,
    enabled: termReady,
    staleTime: 120_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const students = React.useMemo(() => roster ?? [], [roster]);
  const sections = React.useMemo(() => heat?.sections ?? [], [heat]);
  const statsPending = heatLoading || studentsLoading;

  const high = students.filter((s) => s.riskLevel === "High").length;
  const moderate = students.filter((s) => s.riskLevel === "Moderate").length;

  // Highest-volume driver this term — shown as a single read on the strip so
  // the matrix below has a headline.
  const topDriver = React.useMemo(() => {
    const totals = heat?.factorTotals;
    if (!totals) return null;
    return FACTOR_ORDER.reduce(
      (best, factor) => (totals[factor] > best.count ? { factor, count: totals[factor] } : best),
      { factor: "Academic" as (typeof FACTOR_ORDER)[number], count: totals.Academic },
    );
  }, [heat]);

  const handleSelectSection = React.useCallback(
    (section: string) => {
      // Clicking the active row again clears the filter — the matrix doubles as
      // the desk's section switcher.
      setSelectedSection((current) => (current === section ? "all" : section));
    },
    [setSelectedSection],
  );

  // Panels sit above the boards, so acting on one scrolls the learner table
  // into view; the filters themselves are shared with the table's toolbar.
  const scrollToTable = React.useCallback(() => {
    const node = tableRef.current;
    if (!node) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  const handleInsightRisk = React.useCallback(
    (level: RiskLevelKey) => {
      setRiskFilter((current) => (current === level ? "all" : level));
      scrollToTable();
    },
    [setRiskFilter, scrollToTable],
  );

  const handleInsightFactor = React.useCallback(
    (factor: RiskFactor) => {
      setFactorFilter((current) => (current === factor ? "all" : factor));
      scrollToTable();
    },
    [setFactorFilter, scrollToTable],
  );

  const handleInsightSection = React.useCallback(
    (section: string) => {
      setSelectedSection((current) => (current === section ? "all" : section));
      scrollToTable();
    },
    [setSelectedSection, scrollToTable],
  );

  // A section persisted from another term/school year may no longer exist —
  // treat it as "all" instead of showing an empty table with a phantom chip.
  const activeSection = React.useMemo(() => {
    if (selectedSection === "all") return "all";
    return sections.some((row) => row.section === selectedSection) ? selectedSection : "all";
  }, [sections, selectedSection]);

  const isEmpty = !heatLoading && sections.length === 0;

  return (
    <section className={styles.page} aria-busy={heatLoading || undefined}>
      <PrincipalPageHeader
        title="At-Risk Learners"
        description="Adviser-shared sections for the active term. Flagged by the live rules — subject average below 75, attendance below 80%, or at least one anecdotal record."
        actions={
          <>
            <Button size="sm" className="h-6 px-2 text-[12px]" asChild>
              <Link href="/principal/risk">
                <ListFilter aria-hidden="true" />
                Risk board
              </Link>
            </Button>
            <Button variant="secondary" size="sm" className="h-6 px-2 text-[12px]" asChild>
              <Link href="/principal/risk/interventions">
                Interventions
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />

      {isEmpty ? (
        <PageEmptyCallout>
          No sections with risk data for the active term yet. Sections and their
          flagged students will appear here once detected.
        </PageEmptyCallout>
      ) : (
        <>
          <StatDeck
            title="Risk at a glance"
            icon={ShieldAlert}
            ariaLabel="Risk at a glance"
            loading={statsPending}
            items={[
              {
                key: "atRisk",
                label: "At risk",
                unit: "learners",
                value: students.length,
                hint: "High + moderate flags",
                icon: ShieldAlert,
                tone: "amber" as const,
              },
              {
                key: "high",
                label: "High",
                unit: "learners",
                value: high,
                hint: "Two or more rules fired",
                icon: TriangleAlert,
              },
              {
                key: "moderate",
                label: "Moderate",
                unit: "learners",
                value: moderate,
                hint: "One rule fired",
                icon: CircleAlert,
              },
              {
                key: "sections",
                label: "Sections",
                unit: "sections",
                value: sections.length,
                hint: "Adviser-shared",
                icon: School,
              },
            ]}
            footer={
              topDriver
                ? `Most common driver this term: ${topDriver.factor} — ${topDriver.count} flagged.`
                : "No risk driver flagged yet this term."
            }
          />

          <RiskInsightRow
            students={students}
            loading={statsPending}
            selectedSection={activeSection}
            riskFilter={riskFilter}
            factorFilter={factorFilter}
            onSelectRisk={handleInsightRisk}
            onSelectFactor={handleInsightFactor}
            onSelectSection={handleInsightSection}
          />

          <StudentHeatmap
            heat={heat ?? null}
            students={students}
            loading={heatLoading}
            selectedSection={activeSection === "all" ? null : activeSection}
            onSelect={handleSelectSection}
          />

          <div ref={tableRef} className={styles.tableAnchor}>
            <StudentsListTable
              selectedSection={activeSection}
              onClearSection={() => setSelectedSection("all")}
              riskFilter={riskFilter}
              onRiskFilterChange={setRiskFilter}
              factorFilter={factorFilter}
              onFactorFilterChange={setFactorFilter}
            />
          </div>
        </>
      )}
    </section>
  );
}
