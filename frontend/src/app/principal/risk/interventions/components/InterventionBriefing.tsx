"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  HeartHandshake,
  Search,
  X,
} from "lucide-react";
import { useTerm } from "@/lib/term/TermContext";
import { useLiveQuery } from "@/lib/api/live";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { useNowTick } from "@/lib/clock";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { toast } from "@/components/ui/sonner";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { apiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { RiskSnapshotStudent } from "../types";
import {
  alertGuidance,
  fetchInterventionCohort,
} from "@/services/principal/riskInterventions.service";
import { AlertGuidanceDialog } from "./alert-guidance-dialog";
import { LearnerDossier } from "./LearnerDossier";
import {
  FACTOR_META,
  LANES,
  RISK_COLOR,
  buildInsights,
  compareUrgency,
  headlineFor,
  humanAge,
  laneOf,
  narrativeFor,
  type CaseLane,
  type FactorFilter,
  type RiskFilter,
} from "./intervention-model";
import styles from "./InterventionBriefing.module.css";

const RISK_TABS: { value: RiskFilter; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "High", label: "High" },
  { value: "Moderate", label: "Moderate" },
  { value: "Low", label: "Low" },
];

function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0] ?? name;
  return part.length > 12 ? `${part.slice(0, 11)}…` : part;
}

export function InterventionBriefing() {
  const queryClient = useQueryClient();
  const now = useNowTick();
  const { activeTerm, termReady } = useTerm();
  const termId = activeTerm?.termId ?? null;
  const schoolYearId = activeTerm?.schoolYearId ?? null;

  const [query, setQuery] = usePersistentState<string>("zentra.interventions.search", "");
  const [lane, setLane] = usePersistentState<CaseLane>("zentra.interventions.lane", "needs-plan");
  const [risk, setRisk] = usePersistentState<RiskFilter>("zentra.interventions.risk", "all");
  const [factor, setFactor] = usePersistentState<FactorFilter>(
    "zentra.interventions.factor",
    "all",
  );
  const [section, setSection] = usePersistentState<string>(
    "zentra.interventions.section",
    "all",
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [alertTarget, setAlertTarget] = React.useState<RiskSnapshotStudent | null>(null);
  const [note, setNote] = React.useState("");

  const { data, isPending, isError, refetch } = useLiveQuery({
    queryKey: ["interventions-list", termId, schoolYearId],
    queryFn: ({ signal }) => fetchInterventionCohort(signal),
    enabled: termReady,
    staleTime: 120_000,
    gcTime: 600_000,
  });

  const allStudents = React.useMemo(() => data?.students ?? [], [data]);
  const insights = React.useMemo(() => buildInsights(allStudents, now), [allStudents, now]);

  // Risk / factor / section / search narrow the queue before the lane split so
  // each lane count always describes what is actually on screen.
  const base = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allStudents.filter((student) => {
      if (risk !== "all" && student.riskLevel !== risk) return false;
      if (section !== "all" && student.section !== section) return false;
      if (factor === "Academic" && !student.factors.academic) return false;
      if (factor === "Attendance" && !student.factors.attendance) return false;
      if (factor === "Behavioral" && !student.factors.behavioral) return false;
      if (
        needle &&
        !`${student.studentName} ${student.lrn} ${student.section}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [allStudents, factor, query, risk, section]);

  const laneCounts = React.useMemo(() => {
    const counts: Record<CaseLane, number> = {
      "needs-plan": 0,
      "in-progress": 0,
      recovering: 0,
      all: base.length,
    };
    for (const student of base) counts[laneOf(student)] += 1;
    return counts;
  }, [base]);

  const filtered = React.useMemo(() => {
    const rows =
      lane === "all" ? base : base.filter((student) => laneOf(student) === lane);
    return [...rows].sort((a, b) => compareUrgency(a, b, now));
  }, [base, lane, now]);

  const current = React.useMemo(
    () => filtered.find((student) => student.studentId === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );
  const currentIndex = current
    ? filtered.findIndex((student) => student.studentId === current.studentId)
    : -1;

  const step = React.useCallback(
    (direction: -1 | 1) => {
      if (filtered.length === 0) return;
      const nextIndex = (currentIndex + direction + filtered.length) % filtered.length;
      setSelectedId(filtered[nextIndex].studentId);
    },
    [currentIndex, filtered],
  );

  const resetFilters = React.useCallback(() => {
    setQuery("");
    setRisk("all");
    setFactor("all");
    setSection("all");
  }, [setFactor, setQuery, setRisk, setSection]);

  const hasFilters =
    query.trim() !== "" || risk !== "all" || factor !== "all" || section !== "all";

  const alertMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => alertGuidance(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interventions-list"] });
      toast.success({
        title: "Guidance alerted",
        description: alertTarget
          ? `The guidance desk was notified about ${alertTarget.studentName}.`
          : "The guidance desk was notified.",
      });
      setAlertTarget(null);
      setNote("");
    },
    onError: (err) => {
      toast.error({
        title: "Could not alert guidance",
        description: apiErrorMessage(
          err,
          "The alert did not go through. Check your connection and try again.",
        ),
      });
    },
  });

  const openAlert = React.useCallback((student: RiskSnapshotStudent) => {
    setAlertTarget(student);
    setNote("");
  }, []);

  const closeAlert = () => {
    if (alertMutation.isPending) return;
    setAlertTarget(null);
    setNote("");
  };

  if (isPending) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Loading intervention briefing">
        <div className={styles.skeletonHero}>
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-3 h-7 w-96 max-w-full" />
          <Skeleton className="mt-3 h-4 w-[34rem] max-w-full" />
          <div className={styles.skeletonLanes}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
        <div className={styles.skeletonWorkspace}>
          <Skeleton className="h-[34rem] w-full" />
          <Skeleton className="h-[34rem] w-full" />
        </div>
      </div>
    );
  }

  if (isError && allStudents.length === 0) {
    return (
      <div className={styles.errorState} role="alert">
        <p>Couldn&apos;t load the intervention briefing.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (allStudents.length === 0) {
    return (
      <PageEmptyCallout>
        No learners are flagged for intervention this term. When the risk engine
        detects a learner, their case will open here with a full briefing.
      </PageEmptyCallout>
    );
  }

  const maxFactor = Math.max(1, ...insights.factors.map((item) => item.count));
  const maxSection = Math.max(1, ...insights.sections.map((item) => item.count));
  const topSubject = insights.subjects[0] ?? null;

  return (
    <>
      <div className={styles.page}>
        <header className={styles.brief}>
          <div className={styles.briefTop}>
            <div className={styles.briefLead}>
              <p className={styles.eyebrow}>
                <HeartHandshake size={13} aria-hidden="true" />
                Intervention briefing
              </p>
              <h1 className={styles.headline}>{headlineFor(insights)}</h1>
              <p className={styles.narrative}>{narrativeFor(insights)}</p>
            </div>
            <div className={styles.briefMeta}>
              <span className={styles.live}>
                <span className={styles.liveDot} aria-hidden="true" />
                Live
              </span>
              {activeTerm ? (
                <span>
                  {activeTerm.schoolYearName} · Term {activeTerm.termNumber}
                </span>
              ) : null}
            </div>
          </div>

          <div className={styles.lanes} role="group" aria-label="Choose which cases to review">
            {LANES.map((item) => {
              const active = lane === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={cn(styles.lane, active && styles.laneActive)}
                  aria-pressed={active}
                  onClick={() => setLane(item.key)}
                >
                  <span className={styles.laneCount}>{laneCounts[item.key]}</span>
                  <span className={styles.laneLabel}>{item.label}</span>
                  <span className={styles.laneHint}>{item.hint}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div className={styles.controls}>
          <div className={styles.search}>
            <Search className={styles.searchIcon} aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a learner by name, LRN or section"
              aria-label="Search learners"
              className={styles.searchInput}
            />
          </div>
          <FilterTabs
            label="Filter by risk level"
            options={RISK_TABS}
            value={risk}
            onChange={(next) => setRisk(next as RiskFilter)}
          />
          {factor !== "all" ? (
            <button
              type="button"
              className={styles.activeFilter}
              onClick={() => setFactor("all")}
              aria-label={`Remove ${FACTOR_META[factor].label} filter`}
            >
              {FACTOR_META[factor].label}
              <X size={12} aria-hidden="true" />
            </button>
          ) : null}
          {section !== "all" ? (
            <button
              type="button"
              className={styles.activeFilter}
              onClick={() => setSection("all")}
              aria-label={`Remove ${section} filter`}
            >
              {section}
              <X size={12} aria-hidden="true" />
            </button>
          ) : null}
          {hasFilters ? (
            <button type="button" className={styles.reset} onClick={resetFilters}>
              Clear filters
            </button>
          ) : null}
        </div>

        <div className={styles.workspace}>
          <section className={styles.stage} aria-label="Case spotlight">
            <div className={styles.stageBar}>
              <div>
                <p className={styles.stageLabel}>Case spotlight</p>
                <p className={styles.stageCount} aria-live="polite">
                  {filtered.length === 0
                    ? "No cases match"
                    : `Case ${currentIndex + 1} of ${filtered.length}`}
                </p>
              </div>
              <div className={styles.stageNav}>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => step(-1)}
                  disabled={filtered.length < 2}
                  aria-label="Previous case"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => step(1)}
                  disabled={filtered.length < 2}
                  aria-label="Next case"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {filtered.length > 1 ? (
              <div
                className={styles.filmstrip}
                role="tablist"
                aria-label="Learners in this view"
              >
                {filtered.map((student) => {
                  const active = student.studentId === current?.studentId;
                  return (
                    <button
                      key={student.studentId}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={cn(styles.filmItem, active && styles.filmItemActive)}
                      onClick={() => setSelectedId(student.studentId)}
                      title={`${student.studentName} · ${student.riskLevel} risk · ${student.section}`}
                    >
                      <StudentMascot
                        name={student.studentName}
                        seed={student.lrn}
                        character={student.mascot ?? undefined}
                        size={22}
                      />
                      <span className={styles.filmName}>{firstName(student.studentName)}</span>
                      <span
                        className={styles.filmDot}
                        style={{ background: RISK_COLOR[student.riskLevel] }}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}

            {current ? (
              <LearnerDossier student={current} now={now} onAlert={openAlert} />
            ) : (
              <div className={styles.noMatch}>
                <p className={styles.noMatchTitle}>No learner matches this view.</p>
                <p className={styles.noMatchText}>
                  Try another stage, risk level or search term — or clear the filters.
                </p>
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            )}
          </section>

          <aside className={styles.insightRail} aria-label="What the data says">
            <p className={styles.railEyebrow}>What the data says</p>

            <section className={styles.insight}>
              <div className={styles.insightHead}>
                <h2 className={styles.insightTitle}>Plan coverage</h2>
                <span className={styles.insightValue}>{insights.coveragePct}%</span>
              </div>
              <p className={styles.insightText}>
                <strong>{insights.withPlan}</strong> of{" "}
                <strong>{insights.total}</strong> flagged learners have a guidance plan on
                file.
              </p>
              <span className={styles.coverageTrack} aria-hidden="true">
                <span
                  className={styles.coverageFill}
                  style={{ width: `${insights.coveragePct}%` }}
                />
              </span>
              <p className={styles.insightHint}>
                {insights.needsPlan > 0
                  ? `${insights.needsPlan} still wait for a booked session${
                      insights.oldestNeedDays !== null
                        ? ` · longest wait ${humanAge(insights.oldestNeedDays)}`
                        : ""
                    }.`
                  : "Every case has guidance involved."}
              </p>
              {insights.pendingApproval > 0 ? (
                <p className={styles.insightHint}>
                  {insights.pendingApproval} plan
                  {insights.pendingApproval === 1 ? "" : "s"} awaiting approval.
                </p>
              ) : null}
              <button
                type="button"
                className={styles.textBtn}
                onClick={() => setLane("needs-plan")}
              >
                Review learners still waiting
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            </section>

            <section className={styles.insight}>
              <div className={styles.insightHead}>
                <h2 className={styles.insightTitle}>What is driving the flags</h2>
                <span className={styles.insightHint}>Select to filter</span>
              </div>
              <div className={styles.bars}>
                {insights.factors.map((item) => {
                  const active = factor === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={cn(styles.barRow, active && styles.barRowActive)}
                      aria-pressed={active}
                      onClick={() => setFactor(active ? "all" : item.key)}
                    >
                      <span className={styles.barLabel}>
                        <span
                          className={styles.barDot}
                          style={{ background: item.color }}
                          aria-hidden="true"
                        />
                        {item.label}
                      </span>
                      <span className={styles.barTrack} aria-hidden="true">
                        <span
                          className={styles.barFill}
                          style={{
                            width: `${Math.round((item.count / maxFactor) * 100)}%`,
                            background: item.color,
                          }}
                        />
                      </span>
                      <span className={styles.barValue}>{item.count}</span>
                    </button>
                  );
                })}
              </div>
              {topSubject ? (
                <p className={styles.insightHint}>
                  Most below-passing grades are in <strong>{topSubject.subject}</strong> (
                  {topSubject.count} learner{topSubject.count === 1 ? "" : "s"}).
                </p>
              ) : null}
            </section>

            <section className={styles.insight}>
              <div className={styles.insightHead}>
                <h2 className={styles.insightTitle}>Sections carrying the load</h2>
                <span className={styles.insightHint}>Select to filter</span>
              </div>
              <div className={styles.bars}>
                {insights.sections.map((item) => {
                  const active = section === item.section;
                  return (
                    <button
                      key={item.section}
                      type="button"
                      className={cn(styles.barRow, active && styles.barRowActive)}
                      aria-pressed={active}
                      onClick={() => setSection(active ? "all" : item.section)}
                      title={item.section}
                    >
                      <span className={styles.barLabel}>{item.section}</span>
                      <span className={styles.barTrack} aria-hidden="true">
                        <span
                          className={styles.barFill}
                          style={{
                            width: `${Math.round((item.count / maxSection) * 100)}%`,
                            background: "var(--muted-foreground)",
                          }}
                        />
                      </span>
                      <span className={styles.barValue}>{item.count}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={styles.insight}>
              <div className={styles.insightHead}>
                <h2 className={styles.insightTitle}>How long they have waited</h2>
              </div>
              <p className={styles.insightText}>
                Learners with no booked session, grouped by time since detection.
              </p>
              <ul className={styles.waitList}>
                <li>
                  <span>Under 1 week</span>
                  <strong>{insights.waits.underWeek}</strong>
                </li>
                <li>
                  <span>1–2 weeks</span>
                  <strong>{insights.waits.oneToTwo}</strong>
                </li>
                <li className={insights.waits.overTwo > 0 ? styles.waitAlert : undefined}>
                  <span>More than 2 weeks</span>
                  <strong>{insights.waits.overTwo}</strong>
                </li>
              </ul>
              {insights.waits.overTwo > 0 ? (
                <p className={styles.insightHint}>
                  {insights.waits.overTwo} case
                  {insights.waits.overTwo === 1 ? " has" : "s have"} waited longer than two
                  weeks for a guidance session.
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      </div>

      <AlertGuidanceDialog
        target={alertTarget}
        note={note}
        onNoteChange={setNote}
        pending={alertMutation.isPending}
        onClose={closeAlert}
        onSubmit={() => {
          if (!alertTarget) return;
          alertMutation.mutate({ id: alertTarget.studentId, note });
        }}
      />
    </>
  );
}
