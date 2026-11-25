"use client";

import { useMemo, useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InsightCallout } from "@/components/ui/insight-callout";
import { SearchField } from "@/components/ui/search-field";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import type { CatalogTeacher } from "./use-schedule-catalog";
import { EmptyActionCard } from "./schedule-empty-kanban";
import { TeacherAddKanban } from "./teacher-add-kanban";
import {
  TeacherDeleteConfirm,
  useTeacherDelete,
  type TeacherDeleteProgress,
} from "./teacher-delete-kanban";
import type { TeacherCreateProgress } from "./use-add-teachers";
import { TeacherWorkspaceTable } from "./teacher-workspace-table";
// One card kit for both desks: the teacher board reads exactly like the
// administrator's subject board.
import styles from "@/app/principal/academics/assign/components/sections-kanban.module.css";

interface Props {
  teachers: CatalogTeacher[];
  pending?: boolean;
  loadError?: boolean;
  /** Retained for callers; the catalog no longer renders its own close action. */
  onBack?: () => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  /** Hide the list — form card only. */
  showList?: boolean;
  /** Creation progress reporter (page renders the dock outside the kanban). */
  onCreateProgress?: (p: TeacherCreateProgress | null) => void;
  /** Deletion progress reporter (page renders the dock outside the kanban). */
  onDeleteProgress?: (p: TeacherDeleteProgress | null) => void;
}

/**
 * The administrator's teacher catalog. Same board as the subject catalog:
 * header, account scope + search row, then a data table with the columns that
 * matter when picking a name for a weekly grid.
 */
export function TeacherCatalogKanban({
  teachers,
  pending,
  loadError,
  addOpen,
  onAddOpenChange,
  showList = true,
  onCreateProgress,
  onDeleteProgress,
}: Props) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "linked" | "name_only">("all");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowDeleteTarget, setRowDeleteTarget] = useState<CatalogTeacher | null>(null);
  const { deleteTeachers } = useTeacherDelete(onDeleteProgress);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      teachers.filter((t) => {
        if (scope === "linked" && !t.linked) return false;
        if (scope === "name_only" && t.linked) return false;
        if (!needle) return true;
        return (
          t.name.toLowerCase().includes(needle) ||
          (t.code ?? "").toLowerCase().includes(needle) ||
          (t.linkedName ?? "").toLowerCase().includes(needle)
        );
      }),
    [teachers, scope, needle],
  );

  const selected = useMemo(
    () => teachers.filter((t) => !t.locked && selectedIds.includes(t.id)),
    [teachers, selectedIds],
  );

  const toggleSelect = (id: string) => {
    // A name with linked data is locked — its box never ticks.
    if (teachers.find((t) => t.id === id)?.locked) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDeleteOpen = () => {
    // Delete mode puts a checkbox on every teacher row; the add form stays shut.
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
    // Re-check the lock at confirm time: a name may have gained a slot since
    // it was ticked.
    const targets = selected.filter((t) => !t.locked);
    setConfirmOpen(false);
    setDeleteMode(false);
    setSelectedIds([]);
    void deleteTeachers(targets);
  };

  const filtersActive = scope !== "all" || needle.length > 0;
  const boardEmpty = !pending && !loadError && teachers.length === 0;
  const deletableCount = teachers.filter((t) => !t.locked).length;

  const headerActions = deleteMode ? (
    <>
      <Button
        variant="secondary"
        onClick={handleDeleteCancel}
        className="h-6 gap-1 px-2 text-[12px]"
      >
        Cancel
      </Button>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={selected.length === 0}
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
        disabled={deletableCount === 0 || (addOpen && !showList)}
        title={
          deletableCount === 0
            ? "Every name is already used by a record and is locked"
            : addOpen && !showList
              ? "Close the add-teacher form to delete"
              : "Delete a teacher"
        }
        className="h-6 gap-1 px-2 text-[12px]"
      >
        <Trash2 size={12} aria-hidden />
        Delete teacher
      </Button>
      <Button onClick={() => onAddOpenChange(true)} className="h-6 gap-1 px-2 text-[12px]">
        <UserPlus size={12} aria-hidden />
        Add teacher
      </Button>
    </>
  );

  return (
    <section className={styles.board} aria-label="Teachers">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <Users size={16} />
            </span>
            <h2 className={styles.title}>Teachers</h2>
          </div>
          <p className={styles.subtitle}>
            {deleteMode
              ? "Tick the box on each name you want to delete. Names already used in a timetable or linked to an account are locked."
              : "Teacher names are shared by every section timetable — add the name here, then pick it in a slot."}
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
            label="Filter teachers by account state"
            variant="tags"
            options={[
              { value: "all", label: "All teachers", tone: "neutral" },
              { value: "name_only", label: "Name only", tone: "neutral" },
              { value: "linked", label: "With account", tone: "neutral" },
            ]}
            value={scope}
            onChange={(next) => setScope(next as "all" | "linked" | "name_only")}
          />
          <SearchField
            className="w-60"
            placeholder="Find a name or code…"
            value={q}
            onChange={setQ}
            aria-label="Find a teacher"
          />
        </div>
      ) : null}

      {addOpen && !deleteMode ? (
        <TeacherAddKanban onClose={() => onAddOpenChange(false)} onProgress={onCreateProgress} />
      ) : null}

      {confirmOpen && selected.length > 0 ? (
        <TeacherDeleteConfirm
          teachers={selected}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}

      {rowDeleteTarget ? (
        <TeacherDeleteConfirm
          teachers={[rowDeleteTarget]}
          onCancel={() => setRowDeleteTarget(null)}
          onConfirm={() => {
            const target = rowDeleteTarget;
            setRowDeleteTarget(null);
            void deleteTeachers([target]);
          }}
        />
      ) : null}

      {showList ? (
        pending ? (
          <div
            className="overflow-x-auto rounded-lg border border-border bg-card"
            aria-busy="true"
            aria-label="Loading teachers"
          >
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  {["Teacher", "Code", "Account", "Timetable slots", "Availability"].map((label) => (
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
                          <ShimmerSkeleton className="h-7 w-7 shrink-0 rounded-full" />
                          <div className="flex flex-col gap-1">
                            <ShimmerSkeleton className="h-3.5 w-28" />
                            <ShimmerSkeleton className="h-3 w-20" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <ShimmerSkeleton className="h-3 w-16" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <ShimmerSkeleton className="h-5 w-20 rounded-md" />
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <ShimmerSkeleton className="h-3 w-14" />
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
            Could not load teachers.
          </p>
        ) : teachers.length === 0 ? (
          <div className="flex min-h-[calc(100dvh-16rem)] items-center justify-center py-8">
            <EmptyActionCard
              icon={Users}
              title="No teachers yet"
              description="Teacher names are shared by every section timetable. Add the first name, then pick it in a slot."
              actions={[
                {
                  title: "Add teacher",
                  description: "Type one or more names — the system gives each one a code",
                  icon: UserPlus,
                  accent: "text-amber-500",
                  onClick: () => onAddOpenChange(true),
                },
              ]}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center">
            <InsightCallout role="status" className="w-fit max-w-full">
              <strong>No teachers match these filters.</strong>{" "}
              {filtersActive ? "Try another scope or search." : "Use Add teacher to create one."}
            </InsightCallout>
          </div>
        ) : (
          <TeacherWorkspaceTable
            teachers={filtered}
            deleteMode={deleteMode}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onDelete={setRowDeleteTarget}
          />
        )
      ) : null}
    </section>
  );
}
