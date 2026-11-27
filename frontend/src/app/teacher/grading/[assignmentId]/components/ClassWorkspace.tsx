"use client";

import * as React from "react";
import {
  ArrowLeft,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Scale,
} from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
import { SidePanel } from "@/components/ui/side-panel";
import { gradeLabel } from "@/services/teacher/grading.compute";
import { compareSurnameFirst } from "@/lib/names";
import emptyStyles from "@/components/schedule/schedule-empty.module.css";
import kanbanStyles from "@/components/schedule/subject-kanban.module.css";
import { Button } from "@/components/ui/button";
import { useRefreshAcademic } from "@/services/teacher/grading.service";
import { useSession } from "@/lib/auth/useSession";
import type {
  ClassDetail,
  ComponentType,
} from "@/services/teacher/grading.types";
import {
  WorkspaceToolNav,
  WorkspaceToolPanel,
  type WorkspaceToolKey,
  type WorkspaceView,
} from "./WorkspaceGutter";
import { AssessmentList } from "./AssessmentList";
import { AudienceTabs, type AssessmentAudience } from "./AudienceTabs";
import { ScoreGrid } from "./ScoreGrid";
import { FinalsCard } from "./FinalsCard";
import { WeightsBoard } from "./WeightsBoard";
import { AddAssessmentForm } from "./AddAssessmentForm";
import styles from "./ClassWorkspace.module.css";

/** Tool panels that own the whole column — no assessment list beneath them. */
const FOCUSED_TOOLS: ReadonlySet<WorkspaceToolKey> = new Set([
  "subject",
  "weights",
  "record",
  "lock",
]);

const TOOL_KEYS: ReadonlySet<string> = new Set([
  "subject",
  "weights",
  "add",
  "record",
  "lock",
]);

type Props = {
  detail: ClassDetail;
  queryKeyId: string;
  onMutated: () => void;
};

export function ClassWorkspace({ detail, queryKeyId, onMutated }: Props) {
  const { assignment } = detail;
  // Alphabetical by surname (then given name) so every list on this page —
  // score table, encode view, finals — reads like the advisory roster.
  const students = React.useMemo(
    () => [...detail.students].sort((a, b) => compareSurnameFirst(a.name, b.name)),
    [detail.students],
  );
  const refreshAcademic = useRefreshAcademic();
  const [weightsOpen, setWeightsOpen] = React.useState(false);
  const [view] = React.useState<WorkspaceView>("scores");
  const [encodeCategory, setEncodeCategory] = React.useState<ComponentType>("WRITTEN_WORK");
  const [encodeAssessmentId, setEncodeAssessmentId] = React.useState("");
  const [audience, setAudience] = React.useState<AssessmentAudience>("regular");
  // Add assessment lives in an overlay opened from the tab's top-right button
  // (or the empty-state action), so the tab itself stays a browsable list.
  const [addOpen, setAddOpen] = React.useState(false);
  // The rail selects which tool panel fills the right column. Subject info is
  // the landing tab; picking an assessment closes it (the score grid owns the
  // whole column then).
  const [tool, setTool] = React.useState<WorkspaceToolKey>("subject");
  const session = useSession();
  // Remember the last tool this teacher opened per class, so a reload or a
  // return from the record sheet lands back on it instead of Subject info.
  const toolStorageKey = `zentra.teacher.grading.tool.${session?.sub ?? "anon"}.${queryKeyId}`;
  React.useEffect(() => {
    if (!session?.sub) return;
    try {
      const saved = window.localStorage.getItem(toolStorageKey);
      if (saved && TOOL_KEYS.has(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTool(saved as WorkspaceToolKey);
      }
    } catch {
      /* storage unavailable — keep the default tool */
    }
  }, [toolStorageKey, session?.sub]);
  const selectTool = (next: WorkspaceToolKey) => {
    setTool(next);
    setEncodeAssessmentId("");
    try {
      window.localStorage.setItem(toolStorageKey, next);
    } catch {
      /* storage unavailable — selection still applies for this visit */
    }
  };

  // Collapsed tool rail (icon-only, hover tooltips); remembered per teacher.
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const railStorageKey = `zentra.teacher.grading.rail.collapsed.${session?.sub ?? "anon"}`;
  React.useEffect(() => {
    if (!session?.sub) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRailCollapsed(window.localStorage.getItem(railStorageKey) === "1");
    } catch {
      /* storage unavailable — keep the expanded rail */
    }
  }, [railStorageKey, session?.sub]);
  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(railStorageKey, next ? "1" : "0");
      } catch {
        /* storage unavailable — still applies for this visit */
      }
      return next;
    });
  };

  const selectedAssessment = React.useMemo(
    () =>
      detail.components
        .flatMap((c) => c.assessments.map((a) => ({ ...a, type: c.type as ComponentType })))
        .find((a) => a.id === encodeAssessmentId) ?? null,
    [detail.components, encodeAssessmentId],
  );

  const weightsConfigured = detail.components.some((c) => (c.weight ?? 0) > 0);
  // Per-audience totals for the type filter tags — Regular vs ADM assessments
  // this class already has across every category.
  const audienceCounts = React.useMemo(() => {
    let regular = 0;
    let adm = 0;
    for (const component of detail.components) {
      for (const assessment of component.assessments) {
        if (assessment.audience === "adm") adm += 1;
        else regular += 1;
      }
    }
    return { regular, adm };
  }, [detail.components]);
  const unlockCount = students.filter(
    (s) => s.final != null && s.final.lockStatus === "unlocked" && s.final.computedAverage != null,
  ).length;
  const subjectLabel = `${assignment.subjectName} (${assignment.subjectCode}) — ${assignment.sectionName}`;

  return (
    <section className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.main}>
          {!weightsConfigured && tool !== "weights" ? (
            <div className={emptyStyles.emptyWrap}>
              <div
                key={weightsOpen ? "weights-edit" : "weights-empty"}
                className={`${kanbanStyles.column} ${styles.weightsSwap} mx-auto w-full max-w-md`}
              >
                {weightsOpen ? (
                  <WeightsBoard
                    detail={detail}
                    onCancel={() => setWeightsOpen(false)}
                    onSaved={() => {
                      setWeightsOpen(false);
                      onMutated();
                      refreshAcademic();
                    }}
                  />
                ) : (
                <KanbanBoard
                  title="Subject weights"
                  icon={
                    <span className="text-amber-500" aria-hidden>
                      <Scale size={14} />
                    </span>
                  }
                  actions={
                    <span className="flex items-center gap-1.5">
                      <Pill tone="amber" label="Section">{assignment.sectionName}</Pill>
                      <Pill tone="amber" label="Grade level">Grade {gradeLabel(assignment.gradeLevel)}</Pill>
                    </span>
                  }
                  description="Final grades cannot compute until the WW / PT / E shares are set."
                  footer={
                    <div className="flex justify-end px-1 pb-1">
                      <Button
                        size="sm"
                        className="h-6 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                        onClick={() => setWeightsOpen(true)}
                      >
                        Set up weights
                      </Button>
                    </div>
                  }
                >
                  <p className="px-1 text-xs text-muted-foreground">
                    Pick a DepEd preset or enter custom weights.
                  </p>
                </KanbanBoard>
                )}
              </div>
            </div>
          ) : !selectedAssessment ? (
          <div className="flex min-w-0 flex-1 flex-col gap-3">
          {tool !== "add" ? (
            <WorkspaceToolPanel
              tool={tool}
              assignment={assignment}
              detail={detail}
              studentCount={students.length}
              assignmentId={assignment.id}
              components={detail.components}
              unlockCount={unlockCount}
              subjectLabel={subjectLabel}
              termLabel={`Term ${assignment.termNumber}, ${assignment.schoolYear}`}
              onChanged={() => {
                onMutated();
                refreshAcademic();
              }}
              onSelectTool={selectTool}
            />
          ) : null}
          {/* Add assessment is a browsable list with the create action top-right;
              Subject info / Subject weights are focused panels with nothing
              beneath them. */}
          {weightsConfigured && tool === "add" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AudienceTabs value={audience} onChange={setAudience} counts={audienceCounts} />
              <Button
                type="button"
                size="sm"
                className="h-6 gap-1 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                onClick={() => setAddOpen(true)}
              >
                <Plus size={14} aria-hidden />
                Add assessment
              </Button>
            </div>
          ) : null}
          {weightsConfigured && tool !== "add" && !FOCUSED_TOOLS.has(tool) ? (
            <div className="flex flex-wrap items-center justify-end">
              <AudienceTabs value={audience} onChange={setAudience} counts={audienceCounts} />
            </div>
          ) : null}
          {weightsConfigured && (tool === "add" || !FOCUSED_TOOLS.has(tool)) ? (
          <AssessmentList
            students={students}
            components={detail.components}
            query=""
            audience={audience}
            onAddAssessment={() => setAddOpen(true)}
            onSelect={(c, id) => {
              setEncodeCategory(c);
              setEncodeAssessmentId(id);
            }}
            onDeleted={(id) => {
              if (id === encodeAssessmentId) setEncodeAssessmentId("");
              onMutated();
            }}
          />
          ) : null}
          </div>
          ) : (
          <>
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => setEncodeAssessmentId("")}>
              <ArrowLeft size={16} aria-hidden />
              Assessments
            </Button>
          </div>
          <div className={view === "scores" ? undefined : styles.viewHidden}>
            <ScoreGrid
              queryKeyId={queryKeyId}
              sectionName={assignment.sectionName}
              students={students}
              components={detail.components}
              category={encodeCategory}
              selectedId={encodeAssessmentId}
              onChanged={onMutated}
            />
          </div>

          <div className={view === "finals" ? undefined : styles.viewHidden}>
            <FinalsCard
              assignmentId={assignment.id}
              students={students}
              onChanged={onMutated}
            />
          </div>
          </>
          )}
        </div>
        <aside
          className={`${styles.subjectsPanel} ${
            railCollapsed ? styles.subjectsPanelCollapsed : ""
          }`}
          aria-label="Gradebook tools"
          data-collapsed={railCollapsed || undefined}
        >
          <div className={styles.subjects}>
            <div
              className={`flex w-full items-center ${
                railCollapsed ? "justify-center" : "justify-end"
              }`}
            >
              <button
                type="button"
                onClick={toggleRail}
                aria-label={railCollapsed ? "Expand tools" : "Collapse tools"}
                aria-expanded={!railCollapsed}
                className={`group relative flex h-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:outline-none ${
                  railCollapsed ? "w-7" : "w-6"
                }`}
              >
                {railCollapsed ? (
                  <PanelRightOpen size={15} aria-hidden />
                ) : (
                  <PanelRightClose size={15} aria-hidden />
                )}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-1/2 right-full z-50 mr-2.5 -translate-y-1/2 translate-x-1 rounded-md border border-border bg-popover px-2 py-1 text-[12px] font-medium whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                >
                  {railCollapsed ? "Expand tools" : "Collapse tools"}
                </span>
              </button>
            </div>
            <WorkspaceToolNav
              value={tool}
              onChange={selectTool}
              unlockCount={unlockCount}
              collapsed={railCollapsed}
            />
          </div>
        </aside>
      </div>

      {/* Kept mounted so Radix can play the drawer's slide-out on close —
          unmounting it here would cut the exit animation off. */}
      <AddAssessmentOverlay
        open={addOpen}
        assignmentId={assignment.id}
        sectionName={assignment.sectionName}
        gradeLevel={assignment.gradeLevel}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          onMutated();
          refreshAcademic();
          setAddOpen(false);
        }}
      />
    </section>
  );
}

/**
 * Add-assessment drawer — the same right-hand sheet anatomy as the
 * administrator's schedule drawers (icon header, scrolling body, bordered
 * footer). The form itself owns the panel chrome.
 */
function AddAssessmentOverlay({
  open,
  assignmentId,
  sectionName,
  gradeLevel,
  onClose,
  onSaved,
}: {
  open: boolean;
  assignmentId: string;
  sectionName: string;
  gradeLevel: ClassDetail["assignment"]["gradeLevel"];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <SidePanel open={open} onClose={onClose} label="Add assessment" width="md">
      <AddAssessmentForm
        assignmentId={assignmentId}
        variant="drawer"
        sectionName={sectionName}
        gradeLevel={gradeLevel}
        onCancel={onClose}
        onSaved={onSaved}
      />
    </SidePanel>
  );
}

