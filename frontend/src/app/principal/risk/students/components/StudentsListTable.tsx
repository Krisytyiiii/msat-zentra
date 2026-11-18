"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { PrincipalEmptyState } from "../../../components/PrincipalEmptyCard";
import { useTerm } from "@/lib/term/TermContext";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Input } from "@/components/ui/input";
import { InsightCallout } from "@/components/ui/insight-callout";
import { FilterTabs } from "@/components/ui/filter-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  FACTOR_CHIP,
  FACTOR_LABELS,
  type RiskFactor,
  type RiskLevelKey,
} from "@/services/principal/riskStudents.types";
import { fetchAllRiskStudents } from "@/services/principal/riskStudents.service";
import { riskTone } from "@/lib/labels/status-tone";
import styles from "./StudentsListTable.module.css";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";

const FACTORS: RiskFactor[] = ["Academic", "Attendance", "Behavioral"];

/** The rule that produced each flag — shown in the expanded row. */
const FACTOR_RULE: Record<RiskFactor, string> = {
  Academic: "Subject average below 75",
  Attendance: "Attendance below 80% of meetups",
  Behavioral: "One or more anecdotal records",
};

// Shared Pill tones: Academic amber, Attendance green, Anecdotal blue.
const FACTOR_TONE: Record<RiskFactor, "amber" | "green" | "blue"> = {
  Academic: "amber",
  Attendance: "green",
  Behavioral: "blue",
};

export type RiskFilter = "all" | RiskLevelKey;
export type FactorFilter = "all" | RiskFactor;

export function StudentsListTable({
  selectedSection,
  onClearSection,
  riskFilter,
  onRiskFilterChange,
  factorFilter,
  onFactorFilterChange,
}: {
  selectedSection: string;
  onClearSection: () => void;
  riskFilter: RiskFilter;
  onRiskFilterChange: (value: RiskFilter) => void;
  factorFilter: FactorFilter;
  onFactorFilterChange: (value: FactorFilter) => void;
}) {
  const [query, setQuery] = usePersistentState<string>(
    "zentra.risk.students.search",
    "",
  );
  // Paging and the expanded row carry the filter signature they belong to, so a
  // filter change starts a new result set (page 1, nothing expanded) without an
  // effect that re-renders after the fact.
  const [pageState, setPageState] = React.useState({ signature: "", page: 1 });
  const [open, setOpen] = React.useState<{ id: string; signature: string } | null>(null);

  const { activeTerm } = useTerm();
  const termId = activeTerm?.termId ?? null;
  const schoolYearId = activeTerm?.schoolYearId ?? null;
  // Whole risk roster (every level, Low included) loaded once per term. Search,
  // section/risk filters and paging then run in memory — typing never fires
  // a request and no stale page of rows is left behind.
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["risk-students-all", termId, schoolYearId],
    queryFn: fetchAllRiskStudents,
    staleTime: 120_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const roster = React.useMemo(() => data ?? [], [data]);

  const sectionStudents = React.useMemo(
    () =>
      selectedSection === "all"
        ? roster
        : roster.filter((student) => student.section === selectedSection),
    [roster, selectedSection],
  );

  const sectionCounts = React.useMemo(
    () => ({
      all: sectionStudents.length,
      High: sectionStudents.filter((s) => s.riskLevel === "High").length,
      Moderate: sectionStudents.filter((s) => s.riskLevel === "Moderate").length,
      Low: sectionStudents.filter((s) => s.riskLevel === "Low").length,
    }),
    [sectionStudents],
  );

  const needle = query.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    let list =
      riskFilter === "all"
        ? sectionStudents
        : sectionStudents.filter((student) => student.riskLevel === riskFilter);
    if (factorFilter !== "all") {
      list = list.filter((student) => student.factors[factorFilter]);
    }
    if (needle) {
      list = list.filter(
        (student) =>
          student.name.toLowerCase().includes(needle) ||
          student.lrn.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [sectionStudents, riskFilter, factorFilter, needle]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filterSignature = `${selectedSection}|${riskFilter}|${factorFilter}|${needle}`;
  const requestedPage = pageState.signature === filterSignature ? pageState.page : 1;
  const safePage = Math.min(Math.max(1, requestedPage), totalPages);
  const openId = open && open.signature === filterSignature ? open.id : null;

  const changePage = React.useCallback(
    (next: number) => setPageState({ signature: filterSignature, page: next }),
    [filterSignature],
  );

  const toggleRow = React.useCallback(
    (id: string) =>
      setOpen((current) =>
        current && current.id === id && current.signature === filterSignature
          ? null
          : { id, signature: filterSignature },
      ),
    [filterSignature],
  );

  // Client-side slice of the filtered roster — no fetch, no stale rows.
  const rows = React.useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const hasActiveFilters =
    needle !== "" || selectedSection !== "all" || riskFilter !== "all" || factorFilter !== "all";

  const applySearch = (value: string) => {
    setQuery(value);
  };

  const applyRisk = (value: RiskFilter) => {
    onRiskFilterChange(value);
  };

  const applyFactor = (value: FactorFilter) => {
    onFactorFilterChange(value);
  };

  const resetFilters = () => {
    setQuery("");
    onRiskFilterChange("all");
    onFactorFilterChange("all");
    onClearSection();
  };

  const showSkeleton = isPending;
  return (
    <KanbanBoard
      title="Flagged Learners"
      icon={<ShieldCheck size={14} aria-hidden="true" />}
      headerToolbar={
        <>
          <Pill tone="green" label="Data source">
            Adviser-shared
          </Pill>
          <FilterTabs
            label="Filter by risk level"
            options={[
              { value: "all", label: "All levels", count: sectionCounts.all },
              { value: "High", label: "High", count: sectionCounts.High },
              { value: "Moderate", label: "Moderate", count: sectionCounts.Moderate },
              { value: "Low", label: "Low", count: sectionCounts.Low },
            ]}
            value={riskFilter}
            onChange={(next) => applyRisk(next as RiskFilter)}
          />
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <Input
              className={`${styles.search} rounded-[16px]`}
              placeholder="Search name or LRN…"
              value={query}
              onChange={(e) => applySearch(e.target.value)}
              aria-label="Search at-risk students"
            />
          </div>
        </>
      }
      toolbar={
        <div className={styles.filterBar} role="group" aria-label="Learner filters">
          <FilterTabs
            label="Filter by risk factor"
            options={[
              { value: "all", label: "All factors" },
              ...FACTORS.map((factor) => ({ value: factor, label: FACTOR_LABELS[factor] })),
            ]}
            value={factorFilter}
            onChange={(next) => applyFactor(next as FactorFilter)}
          />
          {selectedSection !== "all" ? (
            <button
              type="button"
              className={styles.sectionChip}
              onClick={onClearSection}
              aria-label={`Clear the ${selectedSection} section filter`}
            >
              <span className={styles.sectionChipLabel}>Section</span>
              <span className={styles.sectionChipValue}>{selectedSection}</span>
              <X size={11} aria-hidden="true" />
            </button>
          ) : null}
          <span className={styles.resultCount} aria-live="polite">
            {showSkeleton ? (
              "Loading…"
            ) : (
              <>
                <span className={styles.resultCountValue}>{total.toLocaleString()}</span>
                <span className={styles.resultCountLabel}>
                  learner{total === 1 ? "" : "s"}
                </span>
              </>
            )}
          </span>
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[12px] text-muted-foreground"
              onClick={resetFilters}
            >
              Reset
            </Button>
          ) : null}
        </div>
      }
      footer={
        <Pagination
          currentPage={safePage}
          totalItems={total}
          pageSize={PAGE_SIZE}
          onPageChange={changePage}
        />
      }
      ariaLabel="At-risk learners"
    >
      <div className={`${styles.tableBody} relative`} aria-busy={showSkeleton || undefined}>
        {showSkeleton ? (
          <div className={styles.tableWrap} aria-label="Loading at-risk learners" aria-busy="true">
            <Table aria-label="At-risk learners">
              <TableBody>
                <SkeletonRows />
              </TableBody>
            </Table>
          </div>
        ) : isError && rows.length === 0 ? (
          <div className={styles.empty} role="alert">
            <p className={styles.emptyText}>Couldn&apos;t load at-risk learners.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          needle ? (
            <div className={styles.noMatch}>
              <InsightCallout role="status" className={styles.noMatchCallout}>
                <strong>No learners match “{query.trim()}”.</strong> Try a
                different name or LRN — or clear the search to see every
                at-risk learner.
              </InsightCallout>
            </div>
          ) : hasActiveFilters ? (
            <div className={styles.noMatch}>
              <InsightCallout role="status" className={styles.noMatchCallout}>
                <strong>No learners match the selected filters.</strong> Try a
                different section, risk level or factor — or reset the filters.
              </InsightCallout>
            </div>
          ) : (
            <PrincipalEmptyState
              icon={ShieldCheck}
              title="No at-risk learners"
              hint="No at-risk learners — nothing needs attention right now."
            />
          )
        ) : (
          <div className={styles.tableWrap}>
            <Table aria-label="At-risk learners" className="w-full table-fixed">
              <colgroup>
                <col className={styles.colName} />
                <col className={styles.colSection} />
                <col className={styles.colRisk} />
                <col className={styles.colFactors} />
              </colgroup>
              <TableBody>
                {rows.map((student, index) => {
                  const expanded = openId === student.studentId;
                  return (
                    <React.Fragment key={student.studentId}>
                      <TableRow
                        className={`${styles.rowIn} ${styles.clickableRow} ${
                          expanded ? styles.rowOpen : ""
                        }`}
                        style={{ animationDelay: `${40 + Math.min(index, 11) * 30}ms` }}
                        onClick={() => toggleRow(student.studentId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleRow(student.studentId);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`${student.name}, ${student.section}, ${student.riskLevel} risk — ${
                          expanded ? "hide" : "show"
                        } rule detail`}
                      >
                        <TableCell>
                          <div className={styles.studentCell}>
                            <StudentMascot
                              name={student.name}
                              seed={student.lrn}
                              character={student.mascot ?? undefined}
                              size={28}
                            />
                            <span className={styles.studentMeta}>
                              <span className={styles.studentName}>{student.name}</span>
                              <span className={styles.studentLrn}>{student.lrn}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Pill tone="green" label="Section" className={styles.sectionPill}>
                            {student.section}
                          </Pill>
                        </TableCell>
                        <TableCell>
                          <Pill tone={riskTone(student.riskLevel)} label="Risk level">
                            {student.riskLevel}
                          </Pill>
                        </TableCell>
                        <TableCell>
                          <span className={styles.factors}>
                            {FACTORS.filter((factor) => student.factors[factor]).map((factor) => (
                              <Pill
                                key={factor}
                                tone={FACTOR_TONE[factor]}
                                label={`${FACTOR_LABELS[factor]} factor`}
                              >
                                {FACTOR_LABELS[factor]}
                              </Pill>
                            ))}
                          </span>
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow className={styles.detailRow}>
                          <TableCell colSpan={4} className={styles.detailCell}>
                            <div className={styles.detail}>
                              <div className={styles.detailHead}>
                                <span className={styles.detailTitle}>Flagged by</span>
                                <span className={styles.detailMeta}>
                                  {student.riskCount} of 3 rules · {student.gradeLevel}
                                </span>
                              </div>
                              <ul className={styles.detailList}>
                                {FACTORS.map((factor) => {
                                  const on = student.factors[factor];
                                  return (
                                    <li
                                      key={factor}
                                      className={`${styles.detailItem} ${
                                        on ? styles.detailOn : styles.detailOff
                                      }`}
                                    >
                                      <span
                                        className={styles.detailDot}
                                        style={{ background: FACTOR_CHIP[factor] }}
                                        aria-hidden="true"
                                      />
                                      <span className={styles.detailLabel}>
                                        {FACTOR_LABELS[factor]}
                                      </span>
                                      <span className={styles.detailHint}>{FACTOR_RULE[factor]}</span>
                                      <span className={styles.detailState}>
                                        {on ? "Flagged" : "Clear"}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </KanbanBoard>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <div className={styles.studentCell}>
              <span className={styles.skelAvatar} />
              <span className={styles.studentMeta}>
                <span className={styles.skelName} />
                <span className={styles.skelLrn} />
              </span>
            </div>
          </TableCell>
          <TableCell>
            <span className={styles.skelCell} style={{ width: "60%" }} />
          </TableCell>
          <TableCell>
            <span className={styles.skelChip} />
          </TableCell>
          <TableCell>
            <span className={styles.factors}>
              <span className={styles.skelChip} />
              <span className={styles.skelChip} />
            </span>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
