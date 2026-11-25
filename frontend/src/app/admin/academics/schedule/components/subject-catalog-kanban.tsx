"use client";

import { useMemo, useState } from "react";
import { BookOpen, BookPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InsightCallout } from "@/components/ui/insight-callout";
import { SearchField } from "@/components/ui/search-field";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { EmptyActionCard } from "./schedule-empty-kanban";
import type { ScheduleSubject } from "../page";
import { SubjectAddKanban } from "./subject-add-kanban";
import { SubjectEditKanban } from "./subject-edit-kanban";
import { TemplateFormOverlay } from "./TemplateFormOverlay";
import {
  SubjectDeleteConfirm,
  useSubjectDelete,
  type SubjectDeleteProgress,
} from "./subject-delete-kanban";
import {
  SubjectWorkspaceTable,
  categoryLabel,
} from "./subject-workspace-table";
import type { SubjectCreateProgress } from "./use-add-subjects";
// One card kit for both desks: the subject board reads exactly like the
// administrator's section board.
import styles from "@/app/principal/academics/assign/components/sections-kanban.module.css";

const GRADES = [
  { key: "G7", label: "Grade 7" },
  { key: "G8", label: "Grade 8" },
  { key: "G9", label: "Grade 9" },
  { key: "G10", label: "Grade 10" },
  { key: "G11", label: "Grade 11" },
  { key: "G12", label: "Grade 12" },
] as const;

interface Props {
  subjects: ScheduleSubject[];
  pending?: boolean;
  loadError?: boolean;
  /** Retained for callers; the catalog no longer renders its own close action. */
  onBack?: () => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  /** Hide the grade grid — form card only (used when Add subject was picked directly). */
  showGrid?: boolean;
  /** Creation progress reporter (page renders the dock outside the kanban). */
  onCreateProgress?: (p: SubjectCreateProgress | null) => void;
  /** Deletion progress reporter (page renders the dock outside the kanban). */
  onDeleteProgress?: (p: SubjectDeleteProgress | null) => void;
}

/**
 * The administrator's subject catalog. Same card board as the section desk
 * (`sections-board`): header, grade scope + search row, then one card per
 * subject — code, grade level and category are the metadata that matter when
 * placing it on a weekly grid.
 */
export function SubjectCatalogKanban({
  subjects,
  pending,
  loadError,
  addOpen,
  onAddOpenChange,
  showGrid = true,
  onCreateProgress,
  onDeleteProgress,
}: Props) {
  const gradeRank = useMemo(() => {
    const map = new Map<string, number>();
    GRADES.forEach((g, i) => map.set(g.key, i));
    return map;
  }, []);

  const [activeGrade, setActiveGrade] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = subjects.filter((s) => {
      if (activeGrade && s.gradeLevel !== activeGrade) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        categoryLabel(s.category).toLowerCase().includes(needle)
      );
    });
    return [...list].sort((a, b) => {
      const rank = (gradeRank.get(a.gradeLevel) ?? 99) - (gradeRank.get(b.gradeLevel) ?? 99);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    });
  }, [subjects, activeGrade, needle, gradeRank]);

  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowDeleteTarget, setRowDeleteTarget] = useState<ScheduleSubject | null>(null);
  const [editTarget, setEditTarget] = useState<ScheduleSubject | null>(null);
  const { deleteSubjects, deleting } = useSubjectDelete(onDeleteProgress);

  const selected = useMemo(
    () => subjects.filter((s) => !s.locked && selectedIds.includes(s.id)),
    [subjects, selectedIds],
  );

  const toggleSelect = (id: string) => {
    // A linked subject is locked — its box never ticks.
    if (subjects.find((s) => s.id === id)?.locked) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDeleteOpen = () => {
    // Delete mode puts a checkbox on every subject card; the add form stays shut.
    onAddOpenChange(false);
    setSelectedIds([]);
    setConfirmOpen(false);
    setDeleteMode(true);
  };

  const handleDeleteCancel = () => {
    setDeleteMode(false);
    setSelectedIds([]);
    setConfirmOpen(false);
  };

  const handleDeleteConfirm = () => {
    // Re-check the lock at confirm time: a subject may have gained a
    // timetable/gradebook link since it was ticked.
    const targets = selected.filter((s) => !s.locked);
    setConfirmOpen(false);
    setDeleteMode(false);
    setSelectedIds([]);
    void deleteSubjects(targets);
  };

  const filtersActive = activeGrade != null || needle.length > 0;
  const boardEmpty = !pending && !loadError && subjects.length === 0;
  const deletableCount = subjects.filter((s) => !s.locked).length;

  const headerActions = deleteMode ? (
    <>
      <Button
        variant="secondary"
        onClick={handleDeleteCancel}
        disabled={deleting}
        className="h-6 gap-1 px-2 text-[12px]"
      >
        Cancel
      </Button>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={selected.length === 0 || deleting}
        className="h-6 gap-1 border-transparent bg-red-600 px-2 text-[12px] text-white hover:bg-red-700 hover:text-white dark:border-transparent dark:bg-red-600 dark:text-white dark:hover:bg-red-700 dark:hover:text-white"
      >
        <Trash2 size={12} aria-hidden />
        Delete{selected.length > 0 ? ` (${selected.length})` : ""}
      </Button>
    </>
  ) : (
    <>
      <Button
        variant="secondary"
        onClick={handleDeleteOpen}
        disabled={deletableCount === 0 || (addOpen && !showGrid)}
        title={
          deletableCount === 0
            ? "Every subject is already used by a record and is locked"
            : addOpen && !showGrid
              ? "Close the add-subject form to delete"
              : "Delete a subject"
        }
        className="h-6 gap-1 px-2 text-[12px]"
      >
        <Trash2 size={12} aria-hidden />
        Delete subject
      </Button>
      <Button onClick={() => onAddOpenChange(true)} className="h-6 gap-1 px-2 text-[12px]">
        <BookPlus size={12} aria-hidden />
        Add subject
      </Button>
    </>
  );

  return (
    <section className={styles.board} aria-label="Subjects">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <BookOpen size={16} />
            </span>
            <h2 className={styles.title}>Subjects</h2>
          </div>
          <p className={styles.subtitle}>
            {deleteMode
              ? "Tick the box on each subject you want to delete. Subjects already used by a timetable or gradebook record are locked."
              : "Each subject is created for a grade level — it becomes pickable on that grade's section timetables."}
          </p>
        </div>
        {!boardEmpty ? (
          <div className={styles.headerActions}>
            {deleteMode && selected.length > 0 ? (
              <span className="mr-1 text-xs text-muted-foreground" aria-live="polite">
                {selected.length} selected
              </span>
            ) : null}
            {headerActions}
          </div>
        ) : null}
      </header>

      {!boardEmpty && !loadError && !pending ? (
        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter subjects by grade"
            variant="tags"
            options={[
              { value: "all", label: "All grades", tone: "neutral" },
              ...GRADES.map((g) => ({ value: g.key, label: g.label, tone: "neutral" as const })),
            ]}
            value={activeGrade ?? "all"}
            onChange={(next) => setActiveGrade(next === "all" ? null : next)}
          />
          <SearchField
            className="w-60"
            placeholder="Find a subject or code…"
            value={query}
            onChange={setQuery}
            aria-label="Find a subject"
          />
        </div>
      ) : null}

      {addOpen && !deleteMode ? (
        <SubjectAddKanban onClose={() => onAddOpenChange(false)} onProgress={onCreateProgress} />
      ) : null}

      {confirmOpen && selected.length > 0 ? (
        <SubjectDeleteConfirm
          subjects={selected}
          pending={deleting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}

      {rowDeleteTarget ? (
        <SubjectDeleteConfirm
          subjects={[rowDeleteTarget]}
          pending={deleting}
          onCancel={() => setRowDeleteTarget(null)}
          onConfirm={() => {
            const target = rowDeleteTarget;
            setRowDeleteTarget(null);
            void deleteSubjects([target]);
          }}
        />
      ) : null}

      <TemplateFormOverlay
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        label={editTarget ? `Edit ${editTarget.name}` : "Edit subject"}
        variant="drawer"
      >
        {editTarget ? (
          <SubjectEditKanban
            key={editTarget.id}
            subject={editTarget}
            onClose={() => setEditTarget(null)}
          />
        ) : null}
      </TemplateFormOverlay>

      {showGrid ? (
        pending ? (
          <div
            className="overflow-x-auto rounded-lg border border-border bg-card"
            aria-busy="true"
            aria-label="Loading subjects"
          >
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  {["Subject", "Grade", "Category", "Code", "Availability"].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-4 py-2.5 text-left text-[12px] font-medium tracking-[0.02em] whitespace-nowrap text-muted-foreground"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ShimmerGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex items-center gap-2">
                          <ShimmerSkeleton className="h-7 w-7 shrink-0 rounded-md" />
                          <ShimmerSkeleton className="h-3.5 w-28" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <ShimmerSkeleton className="h-3 w-16" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <ShimmerSkeleton className="h-5 w-16 rounded-md" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <ShimmerSkeleton className="h-5 w-20 rounded-md" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <ShimmerSkeleton className="h-3 w-24" />
                      </td>
                    </tr>
                  ))}
                </ShimmerGroup>
              </tbody>
            </table>
          </div>
        ) : loadError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load subjects.
          </p>
        ) : subjects.length === 0 ? (
          <div className="flex min-h-[calc(100dvh-16rem)] items-center justify-center py-8">
            <EmptyActionCard
              icon={BookOpen}
              title="No subjects yet"
              description="Each subject is created for a grade level and gets its code automatically. Add the first one, then place it on a section's weekly timetable."
              actions={[
                {
                  title: "Add subject",
                  description: "Choose grade levels, categories and subject names",
                  icon: BookPlus,
                  accent: "text-amber-500",
                  onClick: () => onAddOpenChange(true),
                },
              ]}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center">
            <InsightCallout role="status" className="w-fit max-w-full">
              <strong>No subjects match these filters.</strong>{" "}
              {filtersActive
                ? "Try another grade or search."
                : "Use Add subject to create one."}
            </InsightCallout>
          </div>
        ) : (
          <SubjectWorkspaceTable
            subjects={filtered}
            deleteMode={deleteMode}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onEdit={setEditTarget}
            onDelete={setRowDeleteTarget}
          />
        )
      ) : null}
    </section>
  );
}
