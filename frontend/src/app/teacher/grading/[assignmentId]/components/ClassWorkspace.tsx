"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus, Scale } from "lucide-react";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { Pill } from "@/components/ui/pill";
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

  const selectedAssessment = React.useMemo(
    () =>
      detail.components
        .flatMap((c) => c.assessments.map((a) => ({ ...a, type: c.type as ComponentType })))
        .find((a) => a.id === encodeAssessmentId) ?? null,
    [detail.components, encodeAssessmentId],
  );

  const weightsConfigured = detail.components.some((c) => (c.weight ?? 0) > 0);
  const unlockCount = students.filter(
    (s) => s.final != null && s.final.lockStatus === "unlocked" && s.final.computedAverage != null,
  ).length;
  const subjectLabel = `${assignment.subjectName} (${assignment.subjectCode}) — ${assignment.sectionName}`;

  return (
    <section className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.subjectsPanel} aria-label="Gradebook tools">
          <div className={styles.subjects}>
            <WorkspaceToolNav
              value={tool}
              onChange={selectTool}
              unlockCount={unlockCount}
            />
          </div>
        </aside>
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
              <AudienceTabs value={audience} onChange={setAudience} />
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
              <AudienceTabs value={audience} onChange={setAudience} />
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
      </div>

      {addOpen ? (
        <AddAssessmentOverlay
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
      ) : null}
    </section>
  );
}

/**
 * Add-assessment overlay — portaled to `document.body` (no transformed
 * ancestor can trap it) and the same card language as the tab panels.
 */
function AddAssessmentOverlay({
  assignmentId,
  sectionName,
  gradeLevel,
  onClose,
  onSaved,
}: {
  assignmentId: string;
  sectionName: string;
  gradeLevel: ClassDetail["assignment"]["gradeLevel"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add assessment"
        className="w-full max-w-xl"
      >
        <KanbanBoard
          title="Add assessment"
          icon={
            <span className="text-amber-500" aria-hidden>
              <Plus size={14} />
            </span>
          }
          actions={
            <span className="flex items-center gap-1.5">
              <Pill tone="green" label="Section">
                {sectionName}
              </Pill>
              <Pill tone="blue" label="Grade level">
                Grade {gradeLabel(gradeLevel)}
              </Pill>
            </span>
          }
          description="New quiz, activity, or exam for this class."
          className="bg-card shadow-2xl"
        >
          <AddAssessmentForm assignmentId={assignmentId} onSaved={onSaved} />
        </KanbanBoard>
      </div>
    </div>,
    document.body,
  );
}
