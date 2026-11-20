"use client";

import { useMemo, useState } from "react";
import { Check, Lock, Search, Trash2, UserPlus, Users, X } from "lucide-react";
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
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import type { CatalogTeacher } from "./use-schedule-catalog";
import { TeacherAddKanban } from "./teacher-add-kanban";
import {
  TeacherDeleteConfirm,
  useTeacherDelete,
  type TeacherDeleteProgress,
} from "./teacher-delete-kanban";
import type { TeacherCreateProgress } from "./use-add-teachers";
// One card kit for both desks: the teacher board reads exactly like the
// administrator's section board.
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

/** "linked account, 2 timetable slots" — what keeps a name locked. */
function teacherLockLabel(teacher: CatalogTeacher): string {
  const parts: string[] = [];
  if (teacher.linked) parts.push("a linked account");
  const slots = teacher.links?.timetableEntries ?? 0;
  if (slots > 0) parts.push(`${slots} timetable slot${slots === 1 ? "" : "s"}`);
  const grants = teacher.links?.termGrants ?? 0;
  if (grants > 0) parts.push(`${grants} term grant${grants === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "existing records";
}

/**
 * The administrator's teacher catalog. Same card board as the section desk:
 * header, account scope + search row, then one card per teacher name with its
 * code, account state and delete lock.
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
    // Delete mode puts a checkbox on every teacher card; the add form stays shut.
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
            options={[
              { value: "all", label: "All teachers" },
              { value: "name_only", label: "Name only" },
              { value: "linked", label: "With account" },
            ]}
            value={scope}
            onChange={(next) => setScope(next as "all" | "linked" | "name_only")}
          />
          <InputGroup className="w-60 max-w-full shrink-0 rounded-[16px]">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Find a name or code…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              aria-label="Find a teacher"
            />
            {q ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => setQ("")}
                >
                  <X aria-hidden />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
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

      {showList ? (
        pending ? (
          <div className={styles.grid} aria-busy="true" aria-label="Loading teachers">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />
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
            Could not load teachers.
          </p>
        ) : teachers.length === 0 ? (
          <PageEmptyCallout
            action={
              <Button
                className="h-6 gap-1 px-2.5 text-[12px]"
                onClick={() => onAddOpenChange(true)}
              >
                <UserPlus size={12} aria-hidden />
                Add teacher
              </Button>
            }
          >
            No teachers yet — add the first name so it can be picked in timetable slots.
          </PageEmptyCallout>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center">
            <InsightCallout role="status" className="w-fit max-w-full">
              <strong>No teachers match these filters.</strong>{" "}
              {filtersActive ? "Try another scope or search." : "Use Add teacher to create one."}
            </InsightCallout>
          </div>
        ) : (
          <div className={styles.grid} aria-label="Teachers">
            {filtered.map((t, index) => {
              const checked = deleteMode && selectedIds.includes(t.id);
              const locked = Boolean(t.locked);
              return (
                <article
                  key={t.id}
                  className={`${styles.card}${deleteMode && !locked ? " cursor-pointer" : ""}${
                    checked ? " border-red-500/50 bg-red-500/5 dark:bg-red-500/10" : ""
                  }`}
                  aria-label={`${t.name} teacher`}
                  onClick={deleteMode && !locked ? () => toggleSelect(t.id) : undefined}
                  style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
                >
                  <header className={styles.cardHead}>
                    {deleteMode ? (
                      <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
                        <Checkbox
                          checked={checked}
                          disabled={locked}
                          onCheckedChange={() => toggleSelect(t.id)}
                          title={locked ? `Locked — used by ${teacherLockLabel(t)}` : undefined}
                          aria-label={
                            locked
                              ? `${t.name} is locked and cannot be deleted`
                              : `Select ${t.name} for deletion`
                          }
                        />
                      </span>
                    ) : (
                      <StudentMascot name={t.name} seed={t.id} size={36} />
                    )}
                    <div className={styles.cardId}>
                      <span className={styles.sectionName} title={t.name}>
                        {t.name}
                      </span>
                      <span className={styles.teacher} title={t.linkedName ?? undefined}>
                        {t.linkedName ?? <span className={styles.teacherNone}>Name only</span>}
                      </span>
                    </div>
                    {t.code ? (
                      <Pill tone="amber" label="Teacher code" className={styles.gradePill}>
                        {t.code}
                      </Pill>
                    ) : (
                      <Pill tone="neutral" label="Teacher code" className={styles.gradePill}>
                        No code
                      </Pill>
                    )}
                  </header>

                  <div className={styles.metaRow}>
                    {t.linked ? (
                      <Pill tone="green" label="Account">
                        <Check size={11} aria-hidden />
                        Linked
                      </Pill>
                    ) : (
                      <Pill tone="neutral" label="Account">
                        Name only
                      </Pill>
                    )}
                    {t.links && t.links.timetableEntries > 0 ? (
                      <Pill tone="blue" label="Timetable slots">
                        {t.links.timetableEntries} slot
                        {t.links.timetableEntries === 1 ? "" : "s"}
                      </Pill>
                    ) : null}
                  </div>

                  {locked ? (
                    <p
                      className={`${styles.notice} ${styles.claimNotice} mt-auto`}
                      title={`Locked — used by ${teacherLockLabel(t)}`}
                    >
                      <Lock size={11} aria-hidden />
                      <span className="min-w-0 truncate">
                        Locked — used by {teacherLockLabel(t)}
                      </span>
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
