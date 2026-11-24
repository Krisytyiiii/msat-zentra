"use client";

import * as React from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArchiveRestore,
  CalendarClock,
  KanbanSquare,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useTeacherInvalidate } from "../../components/use-teacher-invalidate";
import { markSelfNotified } from "@/lib/realtime/teacherChannel";
import { Button } from "@/components/ui/button";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { FormOverlay } from "./components/form-overlay";
import { useDock } from "@/components/dock/dock-store";
import { Input } from "@/components/ui/input";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pill } from "@/components/ui/pill";
import { GlassCard } from "@/components/ui/glass-card";
import { Checkbox } from "@/components/ui/checkbox";
import { InsightCallout } from "@/components/ui/insight-callout";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { Pagination } from "@/components/shared/pagination";
import {
  useAdvisoryListRoster,
  useArchivedAdvisoryStudents,
} from "@/services/teacher/advisory.service";
import type { AdviseeRow, AdvisoryRoster, ArchivedAdvisee } from "@/services/teacher/advisory.types";
import { compareSurnameFirst, formatSurnameFirst } from "@/lib/names";
import { formatManilaDateLong } from "@/lib/labels/datetime";
import { riskBadgeVariant } from "@/lib/risk/status";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { AdvisoryInsightBoard } from "./components/advisory-insight-board";
import { AdvisoryListSkeleton } from "./components/advisory-list-skeleton";
import { StudentMascot } from "../referrals/components/StudentMascot";
import listStyles from "./components/advisory-list.module.css";

function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function TeacherAdvisoryListPage() {
  const rosterQuery = useAdvisoryListRoster();
  const queryClient = useQueryClient();
  const invalidateTeacher = useTeacherInvalidate();
  const students = React.useMemo(
    () =>
      [...(rosterQuery.data?.students ?? [])].sort((a, b) =>
        compareSurnameFirst(a.name, b.name),
      ),
    [rosterQuery.data],
  );
  const sectionLabel = React.useMemo(
    () => (rosterQuery.data?.advisorySections ?? []).map((s) => s.name).join(", "),
    [rosterQuery.data],
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Keep a valid selection as the roster loads / changes.
  React.useEffect(() => {
    if (students.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && students.some((s) => s.studentId === prev) ? prev : students[0]!.studentId,
    );
  }, [students]);

  const selectedStudent = React.useMemo(
    () => students.find((s) => s.studentId === selectedId) ?? null,
    [students, selectedId],
  );

  const columns = React.useMemo<ColumnDef<AdviseeRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => `${formatSurnameFirst(row.name)} ${row.lrn}`,
        header: "Student",
        size: 250,
        minSize: 230,
        maxSize: 300,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <StudentMascot
              name={row.original.name}
              seed={row.original.lrn}
              character={row.original.mascot ?? undefined}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <span
                className="block truncate text-[13px] font-semibold text-primary"
                title={row.original.name}
              >
                {formatSurnameFirst(row.original.name)}
              </span>
              <span className="mt-1 flex max-w-full items-center justify-between gap-1.5">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Pill className="h-6 leading-none" tone="neutral" label="LRN">
                    {row.original.lrn}
                  </Pill>
                  {row.original.learnerType === "transferee" ? (
                    <Pill className="h-6 leading-none" tone="amber" label="Learner type">
                      Transferee
                    </Pill>
                  ) : null}
                </span>
                <Pill
                  className="h-6 shrink-0 leading-none"
                  tone={riskBadgeVariant(row.original.riskLevel)}
                  label="Risk level"
                >
                  {row.original.riskLevel}
                </Pill>
              </span>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: students,
    columns,
    getRowId: (row) => row.studentId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    state: { sorting, columnFilters },
  });

  // A newly enlisted / restored learner can land on any page of the sorted
  // roster — jump the table to whichever page now holds the selection so the
  // add is visible without paging or reloading.
  const selectedPageIndex = React.useMemo(() => {
    if (!selectedId) return null;
    const idx = table
      .getFilteredRowModel()
      .rows.findIndex((r) => r.original.studentId === selectedId);
    return idx < 0 ? null : Math.floor(idx / PAGE_SIZE);
  }, [selectedId, students, table]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (selectedPageIndex === null) return;
    if (table.getState().pagination.pageIndex !== selectedPageIndex) {
      table.setPageIndex(selectedPageIndex);
    }
  }, [selectedPageIndex, table]);

  const advisorySections = React.useMemo(
    () => rosterQuery.data?.advisorySections ?? [],
    [rosterQuery.data],
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const [addName, setAddName] = React.useState("");
  const [addLrn, setAddLrn] = React.useState("");
  const [addSectionId, setAddSectionId] = React.useState("");
  /** Transferees start their attendance window on the enlistment date. */
  const [addLearnerType, setAddLearnerType] = React.useState<"regular" | "transferee">(
    "regular",
  );
  const [addError, setAddError] = React.useState<string | null>(null);
  const dock = useDock();
  const dockTaskRef = React.useRef<string | null>(null);
  const editDockTaskRef = React.useRef<string | null>(null);

  const [editTarget, setEditTarget] = React.useState<AdviseeRow | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editArmed, setEditArmed] = React.useState(false);
  /** Briefing overlay shown the first time edit mode is armed. */
  const [editIntroOpen, setEditIntroOpen] = React.useState(false);
  /** The one student ticked in edit mode (edit is single-select). */
  const [editSelected, setEditSelected] = React.useState<Set<string>>(new Set());
  const [editName, setEditName] = React.useState("");
  const [editLrn, setEditLrn] = React.useState("");
  const [editError, setEditError] = React.useState<string | null>(null);

  function enterEditMode() {
    exitRemoveMode();
    setEditSelected(new Set());
    setEditArmed(true);
    setEditIntroOpen(true);
  }

  function exitEditMode() {
    setEditArmed(false);
    setEditIntroOpen(false);
    setEditSelected(new Set());
  }

  /** Edit is one student at a time — ticking another swaps the selection. */
  function toggleEditSelected(studentId: string) {
    setEditSelected((prev) => (prev.has(studentId) ? new Set() : new Set([studentId])));
  }

  function openEdit(row: AdviseeRow) {
    setSelectedId(row.studentId);
    setEditName(row.name);
    setEditLrn(row.lrn);
    setEditError(null);
    setEditTarget(row);
    setEditOpen(true);
  }

  /** Opens the editor for the single ticked student. */
  function startEditSelected() {
    const target = students.find((s) => editSelected.has(s.studentId));
    if (!target) return;
    openEdit(target);
  }

  /** Row click: normally inspects; while a rail tool is armed it ticks the row. */
  function handleRowClick(row: AdviseeRow) {
    setSelectedId(row.studentId);
    if (removeArmed) {
      toggleRemoveSelected(row.studentId);
      return;
    }
    if (editArmed) toggleEditSelected(row.studentId);
  }

  const editMutation = useMutation({
    mutationFn: async (payload: {
      studentId: string;
      fullName: string;
      lrn: string;
    }) => {
      const { data } = await apiClient.patch<{ studentId: string; name: string; lrn: string }>(
        `/api/teacher/advisory/roster/${encodeURIComponent(payload.studentId)}`,
        { fullName: payload.fullName, lrn: payload.lrn },
      );
      return data;
    },
    onError: (err) => {
      const message = getErrorMessage(err, "Could not save this student.");
      setEditError(message);
      if (editDockTaskRef.current) {
        dock.failTask(editDockTaskRef.current, message);
        editDockTaskRef.current = null;
      }
      // Reopen so the edited values are not lost.
      setEditOpen(true);
      toast.error({ title: "Could not update student", description: message });
    },
    onSuccess: (_data, payload) => {
      setSelectedId(payload.studentId);
      if (editDockTaskRef.current) {
        dock.completeTask(
          editDockTaskRef.current,
          `${payload.fullName} (${payload.lrn}) saved.`,
        );
        editDockTaskRef.current = null;
      }
      toast.success({
        title: "Student updated",
        description: `${payload.fullName} · LRN ${payload.lrn}`,
      });

      // Edit is one student at a time — leaving the overlay ends edit mode.
      exitEditMode();
    },
    onSettled: () => {
      invalidateTeacher.advisory();
    },
  });

  const editSaving = editMutation.isPending;

  function handleEditStudent() {
    if (!editTarget || editSaving) return;
    const fullName = editName.trim();
    const lrn = editLrn.trim();
    if (!fullName || !lrn) {
      setEditError("Name and LRN are both required.");
      return;
    }
    if (!/^\d{12}$/.test(lrn)) {
      setEditError("LRN must be exactly 12 digits (numbers only).");
      return;
    }
    setEditError(null);

    // Close first, then report the request in the shared Dock (bottom-right).
    setEditOpen(false);
    editDockTaskRef.current = dock.startTask({
      kind: "generic",
      title: "Updating student",
      description: `${fullName} · ${lrn}`,
    });
    editMutation.mutate({ studentId: editTarget.studentId, fullName, lrn });
  }

  // --- Remove (soft delete) + restore ---------------------------------------
  // Removing only hides the learner from this adviser's list (an
  // AdviserArchivedStudent row). Grades, attendance, anecdotal records and
  // referrals are never touched, so restoring brings the history back.
  const archivedQuery = useArchivedAdvisoryStudents();
  const [removeArmed, setRemoveArmed] = React.useState(false);
  /** Instruction card that covers the board the first time remove mode opens. */
  const [removeIntroOpen, setRemoveIntroOpen] = React.useState(false);
  /** Ticked students in remove mode (studentId keys). */
  const [removeSelected, setRemoveSelected] = React.useState<Set<string>>(new Set());
  const [removeTargets, setRemoveTargets] = React.useState<AdviseeRow[]>([]);
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  /** Ticked archived learners in the restore overlay (archiveId keys). */
  const [restoreSelected, setRestoreSelected] = React.useState<Set<string>>(new Set());
  const removeDockTaskRef = React.useRef<string | null>(null);
  const restoreDockTaskRef = React.useRef<string | null>(null);

  function enterRemoveMode() {
    setEditArmed(false);
    setRemoveSelected(new Set());
    setRemoveArmed(true);
    setRemoveIntroOpen(true);
  }

  function exitRemoveMode() {
    setRemoveArmed(false);
    setRemoveIntroOpen(false);
    setRemoveSelected(new Set());
  }

  function toggleRemoveSelected(studentId: string) {
    setRemoveSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  // Drop ticks for rows that left the roster (optimistic remove / refetch).
  React.useEffect(() => {
    setRemoveSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(students.map((s) => s.studentId));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [students]);

  const removeMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      await Promise.all(
        studentIds.map((studentId) =>
          apiClient.delete<{ archived: boolean }>(
            `/api/teacher/advisory/roster/${encodeURIComponent(studentId)}`,
          ),
        ),
      );
    },
    // The rows leave the list immediately; a failed request puts them back.
    onMutate: async (studentIds) => {
      const root = ["advisory-students"] as const;
      await queryClient.cancelQueries({ queryKey: root });
      const previous = queryClient.getQueriesData<AdvisoryRoster>({ queryKey: root });
      const removing = new Set(studentIds);
      queryClient.setQueriesData<AdvisoryRoster>({ queryKey: root }, (current) =>
        current
          ? {
              ...current,
              students: current.students.filter((s) => !removing.has(s.studentId)),
            }
          : current,
      );
      return { previous };
    },
    onError: (err, _studentIds, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      const message = getErrorMessage(err, "Could not remove this student.");
      if (removeDockTaskRef.current) {
        dock.failTask(removeDockTaskRef.current, message);
        removeDockTaskRef.current = null;
      }
      toast.error({ title: "Could not remove student", description: message });
    },
    onSuccess: (_data, studentIds) => {
      if (selectedId && studentIds.includes(selectedId)) setSelectedId(null);
      exitRemoveMode();
      if (removeDockTaskRef.current) {
        dock.completeTask(
          removeDockTaskRef.current,
          "Archived from your advisory list — restore any time from Archived students.",
        );
        removeDockTaskRef.current = null;
      }
      toast.success({
        title:
          studentIds.length === 1
            ? "Student removed"
            : `${studentIds.length} students removed`,
        description: "Hidden from your advisory list. Their records are kept — restore any time.",
      });
    },
    onSettled: () => {
      invalidateTeacher.advisory();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (archiveIds: string[]) => {
      await Promise.all(
        archiveIds.map((archiveId) =>
          apiClient.post<{ restored: boolean }>(
            `/api/teacher/advisory/archived/${encodeURIComponent(archiveId)}/restore`,
          ),
        ),
      );
    },
    // Optimistically drop the rows from the Removed students board.
    onMutate: async (archiveIds) => {
      const root = ["advisory-students-archived"] as const;
      await queryClient.cancelQueries({ queryKey: root });
      const previous = queryClient.getQueriesData<{ students: ArchivedAdvisee[] }>({
        queryKey: root,
      });
      const restoring = new Set(archiveIds);
      queryClient.setQueriesData<{ students: ArchivedAdvisee[] }>(
        { queryKey: root },
        (current) =>
          current
            ? {
                ...current,
                students: current.students.filter((s) => !restoring.has(s.archiveId)),
              }
            : current,
      );
      return { previous };
    },
    onError: (err, _archiveIds, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      const message = getErrorMessage(err, "Could not restore this student.");
      if (restoreDockTaskRef.current) {
        dock.failTask(restoreDockTaskRef.current, message);
        restoreDockTaskRef.current = null;
      }
      toast.error({ title: "Could not restore student", description: message });
    },
    onSuccess: (_data, archiveIds) => {
      // The overlay already closed on confirm; just report the result.
      if (restoreDockTaskRef.current) {
        dock.completeTask(restoreDockTaskRef.current, "Student restored to the advisory list.");
        restoreDockTaskRef.current = null;
      }
      toast.success({
        title:
          archiveIds.length === 1 ? "Student restored" : `${archiveIds.length} students restored`,
        description: "Back on your advisory list.",
      });
    },
    onSettled: () => {
      invalidateTeacher.advisory();
    },
  });

  const removeSaving = removeMutation.isPending;

  function handleRemoveStudents() {
    if (removeTargets.length === 0 || removeSaving) return;
    const targets = removeTargets;
    setRemoveOpen(false);
    removeDockTaskRef.current = dock.startTask({
      kind: "generic",
      title:
        targets.length === 1 ? "Removing student" : `Removing ${targets.length} students`,
      description: targets.map((t) => `${t.name} · ${t.lrn}`).join(", "),
    });
    removeMutation.mutate(targets.map((t) => t.studentId));
  }

  /** Checkboxes are live in either rail tool (remove or edit). */
  const selectionMode: "remove" | "edit" | null = removeArmed
    ? "remove"
    : editArmed
      ? "edit"
      : null;
  const activeSelected = selectionMode === "remove" ? removeSelected : editSelected;
  const selectionCount = selectionMode === "remove" ? removeSelected.size : editSelected.size;

  /** Ticked on the current page — the header checkbox ticks the whole page. */
  const pageRowIds = table.getRowModel().rows.map((r) => r.original.studentId);
  const selectedOnPage = pageRowIds.filter((id) => activeSelected.has(id)).length;
  const allOnPageSelected = pageRowIds.length > 0 && selectedOnPage === pageRowIds.length;
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected;

  function togglePageSelection() {
    const setSelected = removeArmed ? setRemoveSelected : setEditSelected;
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRowIds.forEach((id) => next.delete(id));
      else pageRowIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleSelectedId(studentId: string) {
    if (removeArmed) toggleRemoveSelected(studentId);
    else toggleEditSelected(studentId);
  }

  // Drop ticks for rows that left the roster (optimistic remove / refetch).
  React.useEffect(() => {
    setEditSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(students.map((s) => s.studentId));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [students]);

  function handleRestoreStudents(targets: ArchivedAdvisee[]) {
    if (targets.length === 0 || restoreMutation.isPending) return;
    // Close on confirm: the optimistic update already drops the rows, so the
    // overlay would otherwise sit there empty while the requests settle.
    setRestoreOpen(false);
    setRestoreSelected(new Set());
    restoreDockTaskRef.current = dock.startTask({
      kind: "generic",
      title: targets.length === 1 ? "Restoring student" : `Restoring ${targets.length} students`,
      description: targets.map((t) => t.name).join(", "),
    });
    restoreMutation.mutate(targets.map((t) => t.archiveId));
  }

  function toggleRestoreSelected(archiveId: string) {
    setRestoreSelected((prev) => {
      const next = new Set(prev);
      if (next.has(archiveId)) next.delete(archiveId);
      else next.add(archiveId);
      return next;
    });
  }

  const archivedStudents = archivedQuery.data?.students ?? [];
  // Ticks are read against the live list only (restored learners leave the
  // board on the next refetch), so no effect has to prune the selection.
  const restoreSelectedCount = archivedStudents.filter((s) =>
    restoreSelected.has(s.archiveId),
  ).length;
  const allArchivedSelected =
    archivedStudents.length > 0 && restoreSelectedCount === archivedStudents.length;

  function toggleAllArchived() {
    setRestoreSelected(
      allArchivedSelected ? new Set() : new Set(archivedStudents.map((s) => s.archiveId)),
    );
  }

  function openAdd() {
    setAddName("");
    setAddLrn("");
    setAddSectionId(advisorySections[0]?.id ?? "");
    setAddLearnerType("regular");
    setAddError(null);
    setAddOpen(true);
  }

  const enlistMutation = useMutation({
    mutationFn: async (payload: {
      fullName: string;
      lrn: string;
      sectionId?: string;
      learnerType: "regular" | "transferee";
    }) => {
      const { data } = await apiClient.post<{ studentId?: string }>("/api/teacher/advisory/roster", payload);
      return data;
    },
    // Show the new advisee immediately — the refetch on settle only reconciles
    // the server-assigned id, never the row's presence.
    onMutate: async (payload) => {
      const root = ["advisory-students"] as const;
      await queryClient.cancelQueries({ queryKey: root });
      const previous = queryClient.getQueriesData<AdvisoryRoster>({ queryKey: root });
      const optimisticId = `pending:${payload.lrn}`;
      queryClient.setQueriesData<AdvisoryRoster>({ queryKey: root }, (current) => {
        if (!current) return current;
        if (current.students.some((s) => s.lrn === payload.lrn)) return current;
        const section =
          current.advisorySections.find((s) => s.id === payload.sectionId) ??
          current.advisorySections[0];
        const row: AdviseeRow = {
          studentId: optimisticId,
          name: payload.fullName,
          lrn: payload.lrn,
          mascot: null,
          birthdate: null,
          gender: null,
          section: section?.name ?? "",
          riskLevel: "Low",
          flags: [],
          attendanceRate: 1,
          anecdotalCount: 0,
          confidentialityTiers: [],
          hasOpenFlag: false,
          openFlagCount: 0,
          hasAccount: false,
          learnerType: payload.learnerType,
          admExempt: false,
          grades: [],
          liveGrades: [],
        };
        return { ...current, students: [...current.students, row] };
      });
      setSelectedId(optimisticId);
      return { previous };
    },
    onError: (err, _payload, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      const message = getErrorMessage(err, "Could not enlist this student.");
      setAddError(message);
      if (dockTaskRef.current) {
        dock.failTask(dockTaskRef.current, message);
        dockTaskRef.current = null;
      }
      // Bring the form back so the entered name/LRN are not lost.
      setAddOpen(true);
      toast.error({ title: "Could not enlist student", description: message });
    },
    onSuccess: (data, payload) => {
      const optimisticId = `pending:${payload.lrn}`;
      const newId = data?.studentId;
      if (newId) {
        // Swap the placeholder id for the real one so the selection survives
        // the roster refetch — and put the learner back if a refetch that
        // started before this write resolved replaced the cache without them.
        setSelectedId(newId);
        queryClient.setQueriesData<AdvisoryRoster>(
          { queryKey: ["advisory-students"] },
          (current) => {
            if (!current) return current;
            const present = current.students.some(
              (s) => s.studentId === newId || s.lrn === payload.lrn,
            );
            if (present) {
              return {
                ...current,
                students: current.students.map((s) =>
                  s.studentId === optimisticId ? { ...s, studentId: newId } : s,
                ),
              };
            }
            const section =
              current.advisorySections.find((s) => s.id === payload.sectionId) ??
              current.advisorySections[0];
            const row: AdviseeRow = {
              studentId: newId,
              name: payload.fullName,
              lrn: payload.lrn,
              mascot: null,
              birthdate: null,
              gender: null,
              section: section?.name ?? "",
              riskLevel: "Low",
              flags: [],
              attendanceRate: 1,
              anecdotalCount: 0,
              confidentialityTiers: [],
              hasOpenFlag: false,
              openFlagCount: 0,
              hasAccount: false,
              learnerType: payload.learnerType,
              admExempt: false,
              grades: [],
              liveGrades: [],
            };
            return { ...current, students: [...current.students, row] };
          },
        );
      }
      const rosterId = newId?.startsWith("roster:") ? newId.slice("roster:".length) : undefined;
      if (rosterId) markSelfNotified(rosterId);
      if (dockTaskRef.current) {
        dock.completeTask(
          dockTaskRef.current,
          `${payload.fullName} added to your advisory section.`,
        );
        dockTaskRef.current = null;
      }
      toast.success({
        title: "Student enlisted",
        description: `${payload.fullName} was added to your advisory section.`,
      });
    },
    onSettled: () => {
      invalidateTeacher.advisory();
    },
  });

  const addSaving = enlistMutation.isPending;

  function handleAddStudent() {
    if (addSaving) return;
    const fullName = addName.trim();
    const lrn = addLrn.trim();
    if (!fullName || !lrn) {
      setAddError("Name and LRN are both required.");
      return;
    }
    if (!/^\d{12}$/.test(lrn)) {
      setAddError("LRN must be exactly 12 digits (numbers only).");
      return;
    }
    setAddError(null);

    // Close first, then report the request in the shared Dock (bottom-right).
    setAddOpen(false);
    dockTaskRef.current = dock.startTask({
      kind: "generic",
      title: "Enlisting student",
      description: `${fullName} · ${lrn}`,
    });
    enlistMutation.mutate({
      fullName,
      lrn,
      learnerType: addLearnerType,
      ...(addSectionId ? { sectionId: addSectionId } : {}),
    });
  }

  if (rosterQuery.isPending) {
    return <AdvisoryListSkeleton />;
  }

  if (rosterQuery.isError) {
    return (
      <section aria-label="Advisory list" className="flex min-w-0 flex-col gap-3">
        <p role="alert" className="text-sm text-destructive">
          No advisory section assigned, or it could not be loaded. Contact the school
          office.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Advisory list"
      className={`${listStyles.pageLock} flex min-w-0 flex-col gap-3`}
    >
      {students.length === 0 ? (
        <div className="flex h-full min-h-[calc(100dvh-9rem)] w-full flex-col items-center justify-center gap-3">
          <InsightCallout role="status" className="w-full max-w-xl self-center text-left">
            <strong>No advisory students yet.</strong>{" "}
            {sectionLabel
              ? `${sectionLabel} has no enlisted learners this term.`
              : "Students enlisted in your advisory section will appear here."}
          </InsightCallout>
          <div className="flex items-center justify-center gap-2">
            {archivedStudents.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="px-2 text-xs"
                onClick={() => { setRestoreSelected(new Set()); setRestoreOpen(true); }}
              >
                <ArchiveRestore size={14} aria-hidden />
                Archived students
              </Button>
            ) : null}
            <Button size="sm" className="px-2 text-xs" onClick={openAdd}>
              <UserPlus size={14} aria-hidden />
              Add student
            </Button>
          </div>
        </div>
      ) : (
        <div className={listStyles.boardLayout}>
          <div className={listStyles.panel} aria-label="Advisory board">
          <header className={listStyles.boardHead}>
            <span className={listStyles.boardIcon} aria-hidden>
              <KanbanSquare size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={listStyles.boardTitle}>Advisory board</h2>
            </div>
            <div className={listStyles.pageActions}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="px-2 text-xs"
                onClick={() => { setRestoreSelected(new Set()); setRestoreOpen(true); }}
              >
                <ArchiveRestore size={14} aria-hidden />
                Archive{archivedStudents.length > 0 ? ` (${archivedStudents.length})` : ""}
              </Button>
              <Button
                size="sm"
                className="shrink-0 px-2 text-xs"
                onClick={openAdd}
              >
                <UserPlus size={14} aria-hidden />
                Add student
              </Button>
            </div>
          </header>

          <div className={listStyles.split}>
            <div className={listStyles.left}>
              <section className={listStyles.lane} aria-label="Advisory list lane">
                <header className={listStyles.laneHead}>
                  <span className={listStyles.laneDot} style={{ background: "#f59e0b" }} aria-hidden />
                  <h3 className={listStyles.laneTitle}>Advisory list</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant={editArmed ? "secondary" : "outline"}
                      className={editArmed ? "text-amber-600 dark:text-amber-400" : ""}
                      onClick={() => {
                        if (editArmed) exitEditMode();
                        else enterEditMode();
                      }}
                      aria-pressed={editArmed}
                      aria-expanded={editArmed && editIntroOpen}
                      aria-label={editArmed ? "Stop editing" : "Edit a student"}
                      title={editArmed ? "Stop editing" : "Edit"}
                    >
                      <Pencil size={14} aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant={removeArmed ? "secondary" : "outline"}
                      className={
                        removeArmed
                          ? "border-red-600 bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
                          : "border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                      }
                      onClick={() => {
                        exitEditMode();
                        if (removeArmed) exitRemoveMode();
                        else enterRemoveMode();
                      }}
                      aria-pressed={removeArmed}
                      aria-expanded={removeArmed && removeIntroOpen}
                      aria-label={removeArmed ? "Stop removing" : "Remove students"}
                      title={removeArmed ? "Stop removing" : "Remove"}
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </div>
                </header>
                <div className={listStyles.toolbar}>
                  <TeacherSearchField
                    className="w-full min-w-0 flex-1"
                    placeholder="Search students…"
                    value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                    onChange={(next) => table.getColumn("name")?.setFilterValue(next)}
                    aria-label="Filter students"
                  />
                </div>

                {selectionMode ? (
                  <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted-foreground">
                      {selectionCount === 0
                        ? removeArmed
                          ? "Tick the students to remove."
                          : "Tick one student to edit."
                        : removeArmed
                          ? `${selectionCount} selected`
                          : "1 selected"}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={removeArmed ? exitRemoveMode : exitEditMode}
                      >
                        Cancel
                      </Button>
                      {removeArmed ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 shrink-0 bg-red-600 px-2 text-xs text-white hover:bg-red-700 disabled:bg-red-600/60 disabled:text-white/80 dark:bg-red-600 dark:text-white dark:hover:bg-red-700 dark:disabled:bg-red-600/60 dark:disabled:text-white/80"
                          disabled={removeSelected.size === 0 || removeSaving}
                          onClick={() => {
                            const targets = students.filter((s) =>
                              removeSelected.has(s.studentId),
                            );
                            if (targets.length === 0) return;
                            setRemoveTargets(targets);
                            setRemoveOpen(true);
                          }}
                        >
                          <Trash2 size={14} aria-hidden />
                          Remove selected
                          <span className="inline-block w-7 text-right tabular-nums">
                            {removeSelected.size > 0 ? `(${removeSelected.size})` : ""}
                          </span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 shrink-0 px-2 text-xs"
                          disabled={editSelected.size !== 1 || editSaving}
                          onClick={startEditSelected}
                        >
                          <Pencil size={14} aria-hidden />
                          Edit student
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className={listStyles.tableWrap}>
                <Table className="w-full table-fixed">
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-muted/50 [&>th]:border-t-0">
                        {removeArmed ? (
                          <TableHead className="h-10 w-10">
                            <Checkbox
                              checked={
                                allOnPageSelected
                                  ? true
                                  : someOnPageSelected
                                    ? "indeterminate"
                                    : false
                              }
                              onCheckedChange={() => togglePageSelection()}
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Select every student on this page"
                            />
                          </TableHead>
                        ) : editArmed ? (
                          <TableHead className="h-10 w-10" aria-hidden />
                        ) : null}
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            style={{ width: header.getSize() }}
                            onClick={header.column.getToggleSortingHandler()}
                            className="h-10 cursor-pointer truncate whitespace-nowrap select-none"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row) => {
                        const isSelected = row.original.studentId === selectedId;
                        return (
                          <TableRow
                            key={row.id}
                            onClick={() => handleRowClick(row.original)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleRowClick(row.original);
                              }
                            }}
                            tabIndex={0}
                            aria-selected={isSelected}
                            aria-label={
                              removeArmed
                                ? `${row.original.name} — tick to select for removal`
                                : editArmed
                                  ? `${row.original.name} — tick to select for editing`
                                  : `${row.original.name} — open insight`
                            }
                            className={`${listStyles.row} ${isSelected ? listStyles.selected : ""}`}
                          >
                            {selectionMode ? (
                              <TableCell className="w-10">
                                <Checkbox
                                  checked={activeSelected.has(row.original.studentId)}
                                  onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={() =>
                                    toggleSelectedId(row.original.studentId)
                                  }
                                  aria-label={`Select ${row.original.name} for ${selectionMode === "remove" ? "removal" : "editing"}`}
                                />
                              </TableCell>
                            ) : null}
                            {row.getVisibleCells().map((cell) => (
                              <TableCell
                                key={cell.id}
                                style={{ width: cell.column.getSize() }}
                                className="truncate"
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={columns.length + (selectionMode ? 1 : 0)}
                          className="h-40 whitespace-normal"
                        >
                          <div className="flex w-full justify-center">
                            <InsightCallout role="status" className="w-full max-w-xl text-left">
                              {searchEmptyMessage(
                                (table.getColumn("name")?.getFilterValue() as string) ?? "",
                                "students",
                              )}
                            </InsightCallout>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
                <Pagination
                  currentPage={table.getState().pagination.pageIndex + 1}
                  totalItems={table.getFilteredRowModel().rows.length}
                  onPageChange={(p) => table.setPageIndex(p - 1)}
                />
              </section>
            </div>
            <div className={listStyles.right} aria-label="Student insight">
              <AdvisoryInsightBoard student={selectedStudent} bare />
            </div>
          </div>

          </div>

        </div>
      )}

      <KanbanOverlay
        open={editArmed && editIntroOpen}
        onClose={exitEditMode}
        width="sm"
        title="Edit student"
        icon={
          <span className="text-amber-500" aria-hidden>
            <Pencil size={14} />
          </span>
        }
        description="Correct learners' names or LRNs straight from the list."
        footer={
          <div className="flex items-center justify-end gap-1.5 px-1 pb-1">
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setEditIntroOpen(false)}
              autoFocus
            >
              Start editing
            </Button>
          </div>
        }
      >
        <p className="px-1 text-xs text-muted-foreground">
          Tick the student to edit, then press{" "}
          <strong className="text-foreground">Edit student</strong> in the list
          toolbar. One learner at a time — names and LRNs only, LRNs stay 12
          digits.
        </p>
      </KanbanOverlay>

      <KanbanOverlay
        open={removeArmed && removeIntroOpen}
        onClose={exitRemoveMode}
        width="sm"
        title="Remove students"
        icon={
          <span className="text-red-500" aria-hidden>
            <Trash2 size={14} />
          </span>
        }
        description="Soft delete — the learner is only hidden from your advisory list."
        footer={
          <div className="flex items-center justify-end gap-1.5 px-1 pb-1">
            <Button
              type="button"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setRemoveIntroOpen(false)}
              autoFocus
            >
              Start selecting
            </Button>
          </div>
        }
      >
        <ol className="list-inside list-decimal space-y-1.5 px-1 text-xs text-muted-foreground">
          <li>
            Tick the checkbox on the left of every student you want to remove from
            this list.
          </li>
          <li>
            Press <strong className="text-foreground">Remove selected</strong> in
            the list toolbar, then confirm.
          </li>
          <li>
            Grades, attendance, anecdotal records and referrals stay intact —
            nothing is deleted.
          </li>
          <li>
            Restore any archived learner later from{" "}
            <strong className="text-foreground">Archived students</strong>.
          </li>
        </ol>
      </KanbanOverlay>

      <FormOverlay
        open={addOpen}
        onClose={() => {
          if (!addSaving) setAddOpen(false);
        }}
        label="Add student"
        widthClassName="max-w-md"
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <header className="flex items-start gap-2.5 border-b border-border px-4 py-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
              aria-hidden
            >
              <UserPlus size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                Add student
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Enlist a student into your advisory section
                {advisorySections.length === 1 && advisorySections[0]
                  ? ` (${advisorySections[0].name})`
                  : ""}
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!addSaving) setAddOpen(false);
              }}
              disabled={addSaving}
              aria-label="Close add student"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddStudent();
            }}
          >
            <div className="flex max-h-[60dvh] min-w-0 flex-col gap-3 overflow-y-auto px-4 py-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="advisory-add-name">Full name</Label>
                <Input
                  id="advisory-add-name"
                  className="h-8 text-[13px]"
                  value={addName}
                  onChange={(e) => {
                    setAddName(e.target.value);
                    setAddError(null);
                  }}
                  placeholder="e.g. Juan Garcia"
                  maxLength={120}
                  autoFocus
                  autoComplete="off"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="advisory-add-lrn">LRN</Label>
                <Input
                  id="advisory-add-lrn"
                  className="h-8 text-[13px]"
                  value={addLrn}
                  onChange={(e) => {
                    // Digits only — a DepEd LRN is exactly 12 numbers.
                    setAddLrn(e.target.value.replace(/\D/g, "").slice(0, 12));
                    setAddError(null);
                  }}
                  placeholder="12-digit LRN"
                  inputMode="numeric"
                  pattern="[0-9]{12}"
                  autoComplete="off"
                  maxLength={12}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <Label>Learner type</Label>
                <div
                  role="radiogroup"
                  aria-label="Learner type"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {(
                    [
                      {
                        value: "regular" as const,
                        label: "Regular student",
                        hint: "Attendance is rated from the start of the term.",
                      },
                      {
                        value: "transferee" as const,
                        label: "Transferee",
                        hint: "Attendance starts on the day this student is enlisted, not the term start.",
                      },
                    ]
                  ).map((option) => {
                    const active = addLearnerType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={addSaving}
                        onClick={() => setAddLearnerType(option.value)}
                        className={`flex flex-col items-start gap-1 rounded-md border px-2.5 py-2 text-left transition-colors ${
                          active
                            ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        <span className="text-xs font-semibold">{option.label}</span>
                        <span className="text-[12px] leading-tight">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {advisorySections.length > 1 ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="advisory-add-section">Section</Label>
                  <Select value={addSectionId} onValueChange={setAddSectionId}>
                    <SelectTrigger id="advisory-add-section" className="w-full">
                      <SelectValue placeholder="Pick a section" />
                    </SelectTrigger>
                    <SelectContent>
                      {advisorySections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {addError ? (
                <p role="alert" className="text-[12px] leading-snug text-destructive">
                  {addError}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button
                type="submit"
                disabled={addSaving}
                aria-busy={addSaving || undefined}
                className="h-6 gap-1.5 px-2.5 text-[12px]"
              >
                {addSaving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    <span aria-live="polite">Enlisting…</span>
                  </>
                ) : (
                  "Enlist student"
                )}
              </Button>
            </div>
          </form>
        </div>
      </FormOverlay>

      <KanbanOverlay
        open={editOpen && editTarget !== null}
        onClose={() => {
          if (!editSaving) setEditOpen(false);
        }}
        dismissable={!editSaving}
        busy={editSaving}
        width="sm"
        title="Edit student"
        icon={
          <span className="text-primary" aria-hidden>
            <Pencil size={14} />
          </span>
        }
        description="Correct the learner's name or LRN. The LRN stays 12 digits, numbers only."
        footer={
          <div className="flex items-center justify-end gap-1.5 px-1 pb-1">
            <Button
              type="button"
              size="sm"
              className="h-6 px-3 text-xs"
              onClick={() => void handleEditStudent()}
              disabled={editSaving}
              aria-busy={editSaving || undefined}
              autoFocus
            >
              {editSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  <span aria-live="polite">Saving…</span>
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-3 px-1">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="advisory-edit-name">Full name</Label>
            <Input
              id="advisory-edit-name"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setEditError(null);
              }}
              placeholder="e.g. Juan Garcia"
              maxLength={120}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="advisory-edit-lrn">LRN</Label>
            <Input
              id="advisory-edit-lrn"
              value={editLrn}
              onChange={(e) => {
                // Digits only — a DepEd LRN is exactly 12 numbers.
                setEditLrn(e.target.value.replace(/\D/g, "").slice(0, 12));
                setEditError(null);
              }}
              placeholder="12-digit LRN"
              inputMode="numeric"
              pattern="[0-9]{12}"
              autoComplete="off"
              maxLength={12}
            />
          </div>
          {editTarget?.hasAccount ? (
            <p className="text-xs text-muted-foreground">
              This learner has an account — the name and LRN on it change too.
            </p>
          ) : null}
          {editError ? (
            <p role="alert" className="text-sm text-destructive">
              {editError}
            </p>
          ) : null}
        </div>
      </KanbanOverlay>
      <KanbanOverlay
        open={removeOpen && removeTargets.length > 0}
        onClose={() => {
          if (!removeSaving) setRemoveOpen(false);
        }}
        dismissable={!removeSaving}
        busy={removeSaving}
        width="sm"
        title={
          removeTargets.length === 1
            ? "Remove student"
            : `Remove ${removeTargets.length} students`
        }
        icon={
          <span className="text-destructive" aria-hidden>
            <Trash2 size={14} />
          </span>
        }
        description="Hide these learners from your advisory list. Nothing is deleted."
        footer={
          <div className="flex items-center justify-end gap-1.5 px-1 pb-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => setRemoveOpen(false)}
              disabled={removeSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 shrink-0 bg-red-600 px-3 text-xs text-white hover:bg-red-700 disabled:bg-red-600/60 disabled:text-white/80 dark:bg-red-600 dark:text-white dark:hover:bg-red-700 dark:disabled:bg-red-600/60 dark:disabled:text-white/80"
              onClick={() => void handleRemoveStudents()}
              disabled={removeSaving}
              aria-busy={removeSaving || undefined}
              autoFocus
            >
              {removeSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  <span aria-live="polite">Removing…</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} aria-hidden />
                  {removeTargets.length === 1
                    ? "Remove student"
                    : `Remove ${removeTargets.length} students`}
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-2 px-1">
          {/* Compact row cards for the remove confirmation list. */}
          <ul
            className={`${listStyles.thinScrollbar} flex max-h-48 min-w-0 flex-col gap-2 overflow-y-auto pr-1`}
          >
            {removeTargets.map((target) => (
              <li
                key={target.studentId}
                className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
              >
                <StudentMascot
                  name={target.name}
                  seed={target.lrn}
                  character={target.mascot ?? undefined}
                  size={28}
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-primary">
                    {formatSurnameFirst(target.name)}
                  </span>
                  <span className="mt-1 flex max-w-full flex-wrap items-center gap-1">
                    <Pill tone="neutral" label="LRN">
                      {target.lrn}
                    </Pill>
                    {target.section ? (
                      <Pill tone="neutral" label="Section">
                        {target.section}
                      </Pill>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            This is a soft delete. The learners are only hidden from your advisory
            list — grades, attendance, anecdotal records and referrals are kept,
            and you can restore them any time from{" "}
            <strong>Archived students</strong>.
          </p>
        </div>
      </KanbanOverlay>

      <KanbanOverlay
        open={restoreOpen}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreSelected(new Set());
        }}
        width="lg"
        title="Archived students"
        icon={
          <span className="text-primary" aria-hidden>
            <ArchiveRestore size={14} />
          </span>
        }
        description="Learners you archived from your advisory list. Restoring brings back their full record history."
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {restoreSelectedCount > 0
                ? `${restoreSelectedCount} selected`
                : "Click a card to tick it"}
            </span>
            <Button
              type="button"
              size="sm"
              className="gap-1"
              disabled={restoreSelectedCount === 0 || restoreMutation.isPending}
              onClick={() =>
                handleRestoreStudents(
                  archivedStudents.filter((s) => restoreSelected.has(s.archiveId)),
                )
              }
            >
              {restoreMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <RotateCcw size={14} aria-hidden />
              )}
              Restore selected{restoreSelectedCount > 0 ? ` (${restoreSelectedCount})` : ""}
            </Button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-2 px-1">
          {archivedQuery.isPending ? (
            <ShimmerGroup>
              <div
                className="flex min-w-0 flex-col gap-2"
                role="status"
                aria-label="Loading archived students"
              >
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className={listStyles.archiveCard} aria-hidden>
                    <div className={listStyles.archiveCardHead}>
                      <ShimmerSkeleton className="size-4 rounded" />
                      <ShimmerSkeleton className="size-8 rounded-full" />
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                        <ShimmerSkeleton className="h-3.5 w-3/4 rounded" />
                        <ShimmerSkeleton className="h-5 w-28 rounded-md" />
                      </div>
                    </div>
                    <div className={listStyles.archiveCardFoot}>
                      <ShimmerSkeleton className="h-3 w-32 rounded" />
                      <ShimmerSkeleton className="h-6 w-20 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </ShimmerGroup>
          ) : archivedStudents.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No students archived yet. Archiving a student from the advisory
              list keeps them here for restoring.
            </p>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={allArchivedSelected}
                  onCheckedChange={toggleAllArchived}
                  aria-label="Select all archived students"
                />
                Select all ({archivedStudents.length})
              </label>
              {archivedStudents.map((entry) => {
                const checked = restoreSelected.has(entry.archiveId);
                const restoring =
                  restoreMutation.isPending &&
                  !!restoreMutation.variables?.includes(entry.archiveId);
                return (
                  <GlassCard
                    key={entry.archiveId}
                    intensity={4}
                    className="min-w-0"
                  >
                    <article
                      className={`${listStyles.archiveCard}${
                        checked ? ` ${listStyles.archiveCardSelected}` : ""
                      }`}
                      aria-label={`${entry.name}, ${entry.lrn}`}
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      onClick={() => toggleRestoreSelected(entry.archiveId)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleRestoreSelected(entry.archiveId);
                        }
                      }}
                    >
                      <header className={listStyles.archiveCardHead}>
                        <span
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleRestoreSelected(entry.archiveId)}
                            aria-label={`Select ${entry.name} for restoring`}
                          />
                        </span>
                        <StudentMascot
                          name={entry.name}
                          seed={entry.lrn}
                          character={entry.mascot ?? undefined}
                          size={32}
                        />
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                          <p
                            className={listStyles.archiveCardName}
                            title={entry.name}
                          >
                            {formatSurnameFirst(entry.name)}
                          </p>
                          <span className="flex max-w-full flex-wrap items-center gap-1">
                            <Pill label="LRN" className="tabular-nums">
                              {entry.lrn}
                            </Pill>
                          </span>
                        </div>
                      </header>
                      <div className={listStyles.archiveCardFoot}>
                        <span className={listStyles.archiveCardMeta}>
                          <CalendarClock size={12} aria-hidden />
                          Archived {formatManilaDateLong(entry.archivedAt)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRestoreStudents([entry]);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          disabled={restoreMutation.isPending}
                        >
                          {restoring ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                          ) : (
                            <RotateCcw size={14} aria-hidden />
                          )}
                          Restore
                        </Button>
                      </div>
                    </article>
                  </GlassCard>
                );
              })}
            </>
          )}
        </div>
      </KanbanOverlay>

    </section>
  );
}
