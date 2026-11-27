"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  Lock,
  PenLine,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyActionCard } from "@/components/shared/empty-action-card";
import { format } from "date-fns";
import { COMPONENT_LABELS, COMPONENT_NAMES } from "@/services/teacher/grading.compute";
import { useDeleteAssessmentSave } from "./delete-assessment-save-context";
import type {
  ClassAssessment,
  ClassComponent,
  ClassStudent,
  ComponentType,
} from "@/services/teacher/grading.types";
import emptyStyles from "@/components/schedule/schedule-empty.module.css";
import cardStyles from "../../components/GradebookCards.module.css";
import styles from "./AssessmentList.module.css";

const DOT: Record<string, string> = {
  WRITTEN_WORK: "bg-blue-500",
  PERFORMANCE_TASK: "bg-amber-500",
  EXAM: "bg-red-500",
};

const CATEGORY_COLOR: Record<string, string> = {
  WRITTEN_WORK: "#3b82f6",
  PERFORMANCE_TASK: "#f59e0b",
  EXAM: "#ef4444",
};

const CATEGORY_ICON = {
  WRITTEN_WORK: PenLine,
  PERFORMANCE_TASK: ClipboardList,
  EXAM: FileText,
} as const;

type Props = {
  students: ClassStudent[];
  components: ClassComponent[];
  query: string;
  audience: "regular" | "adm";
  onSelect: (category: ComponentType, assessmentId: string) => void;
  onDeleted: (assessmentId: string) => void;
  /** Opens the Add assessment tool (rendered in the empty states). */
  onAddAssessment?: () => void;
};

export function AssessmentList({ students, components, query, audience, onSelect, onDeleted, onAddAssessment }: Props) {
  const [pendingDelete, setPendingDelete] = React.useState<{
    assessment: ClassAssessment;
    type: ComponentType;
  } | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const { deleteAssessmentFlow } = useDeleteAssessmentSave();

  const groups = components.map((c) => ({
    type: c.type,
    assessments: [...c.assessments]
      .filter((a) => a.audience === audience)
      .filter((a) =>
        a.title.toLowerCase().includes(query.trim().toLowerCase()),
      )
      .sort(
        (a, b) => +new Date(b.dateGiven) - +new Date(a.dateGiven),
      ),
  }));
  const total = groups.reduce((n, g) => n + g.assessments.length, 0);
  const unfilteredTotal = components.reduce((n, c) => n + c.assessments.length, 0);
  const audienceTotal = components.reduce(
    (n, c) => n + c.assessments.filter((a) => a.audience === audience).length,
    0,
  );

  const poolOf = (a: ClassAssessment) =>
    a.audience === "adm"
      ? students.filter((s) => s.isAdm)
      : students.filter((s) => !s.isAdm);

  const scoredOf = (a: ClassAssessment) =>
    poolOf(a).filter((s) => a.scores[s.id] != null).length;

  const handleDelete = async () => {
    if (!pendingDelete || deletingId) return;
    const { assessment, type } = pendingDelete;
    const { id } = assessment;
    // Close the question right away and hand the work to the shared dock so
    // the user can keep grading instead of watching a blocking overlay.
    setPendingDelete(null);
    setDeletingId(id);
    const given = new Date(assessment.dateGiven);
    const pills = [
      COMPONENT_LABELS[type],
      `${assessment.maxScore} max`,
      Number.isNaN(given.getTime()) ? assessment.dateGiven : format(given, "MM/dd/yyyy"),
    ];
    // The dock opens this tick inside the provider and keeps running even
    // if the user navigates away mid-flight.
    const result = await deleteAssessmentFlow(id, { title: assessment.title, pills });
    setDeletingId(null);
    if (result.ok) onDeleted(id);
  };

  if (unfilteredTotal === 0) {
    // Empty stage: the shared action card (same language as the admin desks),
    // centered in the content area with the one action that fills it.
    return (
      <div className={emptyStyles.emptyWrap}>
        <EmptyActionCard
          icon={ClipboardList}
          title="No assessments yet"
          description="Create the first quiz, activity, or exam for this class so its scores can be encoded."
          actions={
            onAddAssessment
              ? [
                  {
                    title: "Add assessment",
                    description: "New quiz, activity, or exam for this class",
                    icon: Plus,
                    accent: "text-amber-500",
                    onClick: onAddAssessment,
                  },
                ]
              : []
          }
        />
      </div>
    );
  }

  return (
    <>
    <div className="flex min-w-0 flex-1 flex-col" aria-label="Select assessment">
      {audienceTotal === 0 ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center">
          <EmptyActionCard
            icon={ClipboardList}
            title={`No ${audience === "adm" ? "ADM" : "regular"} assessments yet`}
            description={`This class has no ${audience === "adm" ? "ADM" : "regular"} assessments in the selected term. Switch the type above or add one.`}
            actions={
              onAddAssessment
                ? [
                    {
                      title: "Add assessment",
                      description: "New quiz, activity, or exam for this class",
                      icon: Plus,
                      accent: "text-amber-500",
                      onClick: onAddAssessment,
                    },
                  ]
                : []
            }
          />
        </div>
      ) : total === 0 ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center">
          <InsightCallout className="text-center">
            No assessments match &quot;{query.trim()}&quot;.
          </InsightCallout>
        </div>
      ) : null}
      <div className="mt-2 min-w-0">
      <div className="flex flex-col gap-4">
      {groups.map((g, secIdx) =>
        g.assessments.length === 0 ? null : (
          <section
            key={g.type}
            aria-label={COMPONENT_NAMES[g.type]}
            className={`${styles.section} min-w-0`}
            style={{ animationDelay: `${secIdx * 70}ms` }}
          >
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[g.type]}`} aria-hidden />
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{COMPONENT_NAMES[g.type]}</h2>
            </div>
            <ul className={`${styles.row} grid min-w-0 gap-2 pb-1 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]`}>
              {g.assessments.map((a, cardIdx) => {
                const scored = scoredOf(a);
                const poolSize = poolOf(a).length;
                const busy = deletingId === a.id;
                const pct = poolSize > 0 ? Math.round((scored / poolSize) * 100) : 0;
                const complete = poolSize > 0 && scored >= poolSize;
                const Icon =
                  CATEGORY_ICON[g.type as keyof typeof CATEGORY_ICON] ?? ClipboardList;
                const accent = CATEGORY_COLOR[g.type] ?? "#f59e0b";
                return (
                  <li
                    key={a.id}
                    className={`min-w-0 ${styles.item}`}
                    style={{ animationDelay: `${secIdx * 70 + Math.min(cardIdx, 8) * 35}ms` }}
                  >
                    <article
                      className={`${cardStyles.card} h-full ${complete ? cardStyles.cardComplete : ""}`}
                      aria-label={`${a.title}, ${a.audience === "adm" ? "ADM" : "Regular"}, ${a.maxScore} max`}
                    >
                      <header className={cardStyles.cardHead}>
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40"
                          style={{ color: accent }}
                          aria-hidden
                        >
                          <Icon size={18} />
                        </span>
                        <div className={cardStyles.cardId}>
                          <span className={cardStyles.subjectName} title={a.title}>
                            {a.title}
                          </span>
                          <span
                            className={cardStyles.section}
                            title={`${a.audience === "adm" ? "ADM" : "Regular"} · Added ${a.createdAt}`}
                          >
                            {a.audience === "adm" ? "ADM" : "Regular"} · Added {a.createdAt}
                          </span>
                        </div>
                        <span className={cardStyles.gradeText}>{a.maxScore} max</span>
                      </header>

                      <div className={cardStyles.metaRow}>
                        {complete ? (
                          <span className={cardStyles.statusText} data-tone="green">
                            <Check size={12} aria-hidden />
                            Fully encoded
                          </span>
                        ) : scored > 0 ? (
                          <span className={cardStyles.statusText} data-tone="amber">
                            Encoding in progress
                          </span>
                        ) : (
                          <span className={cardStyles.statusText} data-tone="neutral">
                            Not started
                          </span>
                        )}
                      </div>

                      <div
                        className={cardStyles.progress}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        aria-label={`${scored} of ${poolSize} scored`}
                      >
                        <span
                          className={`${cardStyles.progressFill} ${complete ? cardStyles.progressDone : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className={cardStyles.linksRow}>
                        <span className={cardStyles.linkStat}>
                          <ClipboardList size={11} aria-hidden />
                          {a.maxScore} max
                        </span>
                        <span className={cardStyles.linkStat}>
                          <Users size={11} aria-hidden />
                          {poolSize} student{poolSize === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className={cardStyles.cardActions}>
                        <span className={cardStyles.hint}>
                          {scored > 0 ? (
                            <>
                              <Lock size={11} aria-hidden />
                              <span>Locked — scores encoded</span>
                            </>
                          ) : (
                            <span>No scores encoded yet</span>
                          )}
                        </span>
                        {scored === 0 ? (
                          <button
                            type="button"
                            onClick={() => setPendingDelete({ assessment: a, type: g.type })}
                            disabled={busy}
                            aria-label={`Delete ${a.title}`}
                            title="Delete assessment"
                            className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-muted hover:text-red-500"
                          >
                            {busy ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden />
                            ) : (
                              <Trash2 size={14} aria-hidden />
                            )}
                          </button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          className="h-6 gap-1 bg-card px-2 text-[12px] text-foreground"
                          onClick={() => onSelect(g.type, a.id)}
                          aria-label={`Encode scores for ${a.title}`}
                        >
                          Encode scores
                          <ChevronRight size={12} aria-hidden />
                        </Button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
      </div>
      </div>
    </div>

      {pendingDelete ? (
        <ConfirmDialog
          tone="danger"
          title="Delete assessment?"
          description={`"${pendingDelete.assessment.title}" will be permanently removed from this class.`}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          pending={deletingId === pendingDelete.assessment.id}
          onCancel={() => {
            if (!deletingId) setPendingDelete(null);
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </>
  );
}
