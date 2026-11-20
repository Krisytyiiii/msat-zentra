"use client";

import { useMemo, useState } from "react";
import { BookOpen, BookPlus, Check, Lock, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { InsightCallout } from "@/components/ui/insight-callout";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Pill } from "@/components/ui/pill";
import type { ScheduleSubject } from "../page";
import { SubjectAddKanban } from "./subject-add-kanban";
import {
  SubjectDeleteConfirm,
  useSubjectDelete,
  type SubjectDeleteProgress,
} from "./subject-delete-kanban";
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

function gradeLabel(grade: string): string {
  return GRADES.find((g) => g.key === grade)?.label ?? grade;
}

function categoryLabel(category: string): string {
  return category === "ELECTIVE" ? "Elective" : "Core";
}

/** "Locked — used by 3 timetable slots, 1 teacher assignment, gradebook records". */
function lockReason(links: ScheduleSubject["links"]): string {
  if (!links) return "Locked — used by existing records";
  const parts: string[] = [];
  if (links.timetableEntries > 0) {
    parts.push(
      `${links.timetableEntries} timetable slot${links.timetableEntries === 1 ? "" : "s"}`,
    );
  }
  if (links.assignments > 0) {
    parts.push(
      `${links.assignments} teacher assignment${links.assignments === 1 ? "" : "s"}`,
    );
  }
  if (links.gradebook > 0) parts.push("gradebook records");
  return parts.length > 0
    ? `Locked — used by ${parts.join(", ")}`
    : "Locked — used by existing records";
}

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
            options={[
              { value: "all", label: "All grades" },
              ...GRADES.map((g) => ({ value: g.key, label: g.label })),
            ]}
            value={activeGrade ?? "all"}
            onChange={(next) => setActiveGrade(next === "all" ? null : next)}
          />
          <InputGroup className="w-60 max-w-full shrink-0 rounded-[16px]">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Find a subject or code…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Find a subject"
            />
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X aria-hidden />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
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

      {showGrid ? (
        pending ? (
          <div className={styles.grid} aria-busy="true" aria-label="Loading subjects">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="h-3.5 w-24 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                  <div className="h-5 w-16 shrink-0 rounded-md bg-muted" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-5 w-20 rounded-md bg-muted" />
                  <div className="h-5 w-20 rounded-md bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load subjects.
          </p>
        ) : subjects.length === 0 ? (
          <PageEmptyCallout
            action={
              <Button className="h-6 gap-1 px-2.5 text-[12px]" onClick={() => onAddOpenChange(true)}>
                <BookPlus size={12} aria-hidden />
                Add subject
              </Button>
            }
          >
            No subjects yet for this term — add the first one, then place it on a section&apos;s
            weekly timetable.
          </PageEmptyCallout>
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
          <div className={styles.grid} aria-label="Subjects">
            {filtered.map((s, index) => {
              const checked = deleteMode && selectedIds.includes(s.id);
              const locked = Boolean(s.locked);
              return (
                <article
                  key={s.id}
                  className={`${styles.card}${deleteMode && !locked ? " cursor-pointer" : ""}${
                    checked ? " border-red-500/50 bg-red-500/5 dark:bg-red-500/10" : ""
                  }`}
                  aria-label={`${s.name} subject`}
                  onClick={deleteMode && !locked ? () => toggleSelect(s.id) : undefined}
                  style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
                >
                  <header className={styles.cardHead}>
                    {deleteMode ? (
                      <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
                        <Checkbox
                          checked={checked}
                          disabled={locked}
                          onCheckedChange={() => toggleSelect(s.id)}
                          title={locked ? lockReason(s.links) : undefined}
                          aria-label={
                            locked
                              ? `${s.name} (${s.code}) is locked and cannot be deleted`
                              : `Select ${s.name} (${s.code}) for deletion`
                          }
                        />
                      </span>
                    ) : (
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground"
                        aria-hidden
                      >
                        <BookOpen size={16} />
                      </span>
                    )}
                    <div className={styles.cardId}>
                      <span className={styles.sectionName} title={s.name}>
                        {s.name}
                      </span>
                      <span className={styles.teacher}>{categoryLabel(s.category)} subject</span>
                    </div>
                    <Pill field="grade" className={styles.gradePill}>
                      {gradeLabel(s.gradeLevel)}
                    </Pill>
                  </header>

                  <div className={styles.metaRow}>
                    <Pill tone="green" label="Subject code">
                      {s.code}
                    </Pill>
                    <Pill
                      tone={s.category === "ELECTIVE" ? "sky" : "amber"}
                      label="Subject category"
                    >
                      {categoryLabel(s.category)}
                    </Pill>
                  </div>

                  {locked ? (
                    <p
                      className={`${styles.notice} ${styles.claimNotice} mt-auto`}
                      title={lockReason(s.links)}
                    >
                      <Lock size={11} aria-hidden />
                      <span className="min-w-0 truncate">{lockReason(s.links)}</span>
                    </p>
                  ) : (
                    <p className={`${styles.notice} ${styles.claimedNotice} mt-auto`}>
                      <Check size={11} aria-hidden />
                      <span className="min-w-0 truncate">Can be deleted — no records linked</span>
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )
      ) : null}
    </section>
  );
}
