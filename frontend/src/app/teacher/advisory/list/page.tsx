"use client";

import * as React from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
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
  Eye,
  KanbanSquare,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useTeacherInvalidate } from "../../components/use-teacher-invalidate";
import { markSelfNotified } from "@/lib/realtime/teacherChannel";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { MessageOverlay } from "@/components/ui/message-overlay";
import { SidePanel } from "@/components/ui/side-panel";
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
import { GlassCard } from "@/components/ui/glass-card";
import { Checkbox } from "@/components/ui/checkbox";
import { InsightCallout } from "@/components/ui/insight-callout";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import {
  useAdvisoryRoster,
  useArchivedAdvisoryStudents,
} from "@/services/teacher/advisory.service";
import type { AdviseeRow, AdvisoryRoster, ArchivedAdvisee } from "@/services/teacher/advisory.types";
import { compareSurnameFirst, formatSurnameFirst } from "@/lib/names";
import { formatManilaDateLong } from "@/lib/labels/datetime";
import { useTerm } from "@/lib/term/TermContext";
import cascade from "@/components/shared/desk-cascade.module.css";
import { AdvisoryInsightBoard } from "./components/advisory-insight-board";
import { AdvisoryListSkeleton } from "./components/advisory-list-skeleton";
import { StudentMascot } from "../referrals/components/StudentMascot";
import listStyles from "./components/advisory-list.module.css";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";

function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Live general average — same figure the insight board shows. */
function adviseeAverage(row: AdviseeRow): number | null {
  const live = row.liveGrades
    .map((g) => g.average)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  if (live.length > 0) return live.reduce((a, b) => a + b, 0) / live.length;
  const finals = row.grades
    .map((g) => g.transmutedGrade ?? g.computedAverage)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (finals.length > 0) return finals.reduce((a, b) => a + b, 0) / finals.length;
  return null;
}


/** Placeholder row for an enlist that has not come back from the server yet. */
function optimisticAdvisee(
  studentId: string,
  name: string,
  lrn: string,
  sectionName: string,
  learnerType: "regular" | "transferee",
): AdviseeRow {
  return {
    studentId,
    name,
    lrn,
    mascot: null,
    birthdate: null,
    gender: null,
    section: sectionName,
    riskLevel: "Low",
    flags: [],
    attendanceRate: 1,
    anecdotalCount: 0,
    confidentialityTiers: [],
    hasOpenFlag: false,
    openFlagCount: 0,
    hasAccount: false,
    learnerType,
    admExempt: false,
    grades: [],
    liveGrades: [],
  };
}


/** One row per learner; a single submit enlists them all (admin-section parity). */
const MAX_ADD_ROWS = 12;

/** Same field shell the admin section creator uses, so the two drawers match. */
const ADD_INPUT_CLASS =
  "h-8 rounded-lg border-input bg-transparent px-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/25 dark:bg-transparent";

export default function TeacherAdvisoryListPage() {
  // The board renders risk, attendance, grades and records per row, so it reads
  // the full roster (the identity-only `view=list` feed has no metrics).
  const rosterQuery = useAdvisoryRoster();
  const queryClient = useQueryClient();
  const invalidateTeacher = useTeacherInvalidate();
  const { activeTerm } = useTerm();
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
  /** Risk-lane filter (the table's "risk" column filter, driven by the tabs). */
  const [riskScope, setRiskScope] = React.useState<"all" | "Low" | "Moderate" | "High">("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /** The student detail drawer opened by a row click / eye action. */
  const [insightOpen, setInsightOpen] = React.useState(false);

  const riskCounts = React.useMemo(() => {
    const counts: Record<string, number> = { Low: 0, Moderate: 0, High: 0 };
    for (const student of students) {
      counts[student.riskLevel] = (counts[student.riskLevel] ?? 0) + 1;
    }
    return counts;
  }, [students]);

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
        minSize: 220,
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
              <span
                className="mt-0.5 block max-w-full truncate font-mono text-[12px] tabular-nums text-muted-foreground"
                title={`LRN ${row.original.lrn}`}
              >
                {row.original.lrn}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: "risk",
        accessorKey: "riskLevel",
        header: "Risk",
        size: 110,
        minSize: 90,
        cell: ({ row }) => {
          const level = row.original.riskLevel;
          const color =
            level === "High"
              ? "text-red-600 dark:text-red-400"
              : level === "Moderate"
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400";
          return (
            <span className={`text-[12px] font-semibold ${color}`} title={`Risk level: ${level}`}>
              {level}
            </span>
          );
        },
      },
      {
        id: "attendance",
        accessorKey: "attendanceRate",
        header: "Attendance",
        size: 140,
        minSize: 120,
        cell: ({ row }) => {
          const pct = Math.round(row.original.attendanceRate * 100);
          return (
            <span
              className="flex items-center gap-2"
              aria-label={`Attendance ${pct}%`}
            >
              <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full ${pct < 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </span>
              <span className="text-[12px] font-medium tabular-nums">{pct}%</span>
            </span>
          );
        },
      },
      {
        id: "average",
        accessorFn: (row) => adviseeAverage(row) ?? -1,
        header: "Average",
        size: 100,
        minSize: 90,
        cell: ({ row }) => {
          const average = adviseeAverage(row.original);
          if (average === null) {
            return <span className="text-[12px] text-muted-foreground">No grades</span>;
          }
          return (
            <span
              className={`text-[12px] font-semibold tabular-nums ${
                average < 75 ? "text-red-600 dark:text-red-400" : "text-foreground"
              }`}
            >
              {average.toFixed(1)}
            </span>
          );
        },
      },
      {
        id: "anecdotal",
        accessorKey: "anecdotalCount",
        header: "Anecdotal",
        size: 110,
        minSize: 100,
        cell: ({ row }) =>
          row.original.anecdotalCount > 0 ? (
            <span className="text-[12px] text-foreground">
              {row.original.anecdotalCount} filed
            </span>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        size: 50,
        minSize: 44,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Open ${row.original.name}'s insight`}
              title="Open student insight"
              onClick={() => {
                setSelectedId(row.original.studentId);
                setInsightOpen(true);
              }}
            >
              <Eye size={13} aria-hidden />
            </Button>
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
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
  });

  const advisorySections = React.useMemo(
    () => rosterQuery.data?.advisorySections ?? [],
    [rosterQuery.data],
  );
  const selectedGradeLevel = React.useMemo(() => {
    if (!selectedStudent?.section) return null;
    return (
      advisorySections.find((s) => s.name === selectedStudent.section)?.gradeLevel ?? null
    );
  }, [selectedStudent, advisorySections]);
  const [addOpen, setAddOpen] = React.useState(false);
  /** One row per learner; a single submit enlists them all. */
  const [addRows, setAddRows] = React.useState<Array<{ name: string; lrn: string }>>([
    { name: "", lrn: "" },
  ]);
  const [addSectionId, setAddSectionId] = React.useState("");
  /** Transferees start their attendance window on the enlistment date. */
  const [addLearnerType, setAddLearnerType] = React.useState<"regular" | "transferee">(
    "regular",
  );
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addSaving, setAddSaving] = React.useState(false);
  const dock = useDock();
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

  /** Row click: normally opens the insight drawer; while a rail tool is armed it ticks the row. */
  function handleRowClick(row: AdviseeRow) {
    setSelectedId(row.studentId);
    if (removeArmed) {
      toggleRemoveSelected(row.studentId);
      return;
    }
    if (editArmed) {
      toggleEditSelected(row.studentId);
      return;
    }
    setInsightOpen(true);
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
    setAddRows([{ name: "", lrn: "" }]);
    setAddSectionId(advisorySections[0]?.id ?? "");
    setAddLearnerType("regular");
    setAddError(null);
    setAddOpen(true);
  }

  const setAddRow = (index: number, patch: Partial<{ name: string; lrn: string }>) =>
    setAddRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addRow = () =>
    setAddRows((prev) => (prev.length >= MAX_ADD_ROWS ? prev : [...prev, { name: "", lrn: "" }]));
  const removeAddRow = (index: number) =>
    setAddRows((prev) =>
      prev.length === 1 ? [{ name: "", lrn: "" }] : prev.filter((_, i) => i !== index),
    );

  const addFilledRows = React.useMemo(
    () =>
      addRows
        .map((row) => ({ fullName: row.name.trim(), lrn: row.lrn.trim() }))
        .filter((row) => row.fullName || row.lrn),
    [addRows],
  );

  const addDuplicateLrn = React.useMemo(() => {
    const seen = new Set<string>();
    for (const row of addFilledRows) {
      if (!row.lrn) continue;
      if (seen.has(row.lrn)) return row.lrn;
      seen.add(row.lrn);
    }
    return null;
  }, [addFilledRows]);

  const addSectionLabel =
    advisorySections.find((s) => s.id === addSectionId)?.name ??
    advisorySections[0]?.name ??
    "your advisory section";

  /**
   * Enlist every filled row. Confirming closes at once — the board paints the
   * new learners optimistically and the shared Dock reports the batch; failures
   * are reported there (and in a toast) per learner.
   */
  async function handleAddStudents() {
    if (addSaving) return;
    const filled = addFilledRows;
    if (filled.length === 0) {
      setAddError("Add at least one student.");
      return;
    }
    const incomplete = filled.find((row) => !row.fullName || !row.lrn);
    if (incomplete) {
      setAddError(
        incomplete.fullName
          ? `${incomplete.fullName} needs a 12-digit LRN.`
          : "Every row needs both a full name and an LRN.",
      );
      return;
    }
    const badLrn = filled.find((row) => !/^\d{12}$/.test(row.lrn));
    if (badLrn) {
      setAddError(`LRN for ${badLrn.fullName} must be exactly 12 digits (numbers only).`);
      return;
    }
    if (addDuplicateLrn) {
      setAddError(`LRN ${addDuplicateLrn} appears twice — each student must be different.`);
      return;
    }

    setAddError(null);
    setAddOpen(false);
    setAddSaving(true);

    const total = filled.length;
    const sectionId = addSectionId;
    const learnerType = addLearnerType;
    const section = advisorySections.find((s) => s.id === sectionId) ?? advisorySections[0];
    const sectionName = section?.name ?? "advisory section";
    const taskId = dock.startTask({
      kind: "generic",
      title:
        total === 1 ? `Enlisting ${filled[0].fullName}…` : `Enlisting ${total} students…`,
      description: `${sectionName} · ${total} learner${total === 1 ? "" : "s"}`,
      total,
    });

    // Show every new advisee immediately; the refetch on settle reconciles the
    // server-assigned ids, never the rows' presence.
    const root = ["advisory-students"] as const;
    await queryClient.cancelQueries({ queryKey: root });
    const optimisticIds = new Map<string, string>();
    queryClient.setQueriesData<AdvisoryRoster>({ queryKey: root }, (current) => {
      if (!current) return current;
      const additions: AdviseeRow[] = [];
      for (const row of filled) {
        if (current.students.some((s) => s.lrn === row.lrn)) continue;
        const optimisticId = `pending:${row.lrn}`;
        optimisticIds.set(row.lrn, optimisticId);
        additions.push(
          optimisticAdvisee(optimisticId, row.fullName, row.lrn, sectionName, learnerType),
        );
      }
      return additions.length > 0
        ? { ...current, students: [...current.students, ...additions] }
        : current;
    });

    const failed: string[] = [];
    const failedLrns = new Set<string>();
    let settled = 0;
    for (const row of filled) {
      try {
        const { data } = await apiClient.post<{ studentId?: string }>(
          "/api/teacher/advisory/roster",
          {
            fullName: row.fullName,
            lrn: row.lrn,
            learnerType,
            ...(sectionId ? { sectionId } : {}),
          },
        );
        const newId = data?.studentId;
        const optimisticId = optimisticIds.get(row.lrn);
        if (newId) {
          // Swap the placeholder id for the real one — or put the learner back
          // if a refetch that started before this write resolved dropped them.
          queryClient.setQueriesData<AdvisoryRoster>({ queryKey: root }, (current) => {
            if (!current) return current;
            const present = current.students.some(
              (s) => s.studentId === newId || s.lrn === row.lrn,
            );
            if (!present) {
              return {
                ...current,
                students: [
                  ...current.students,
                  optimisticAdvisee(newId, row.fullName, row.lrn, sectionName, learnerType),
                ],
              };
            }
            return {
              ...current,
              students: current.students.map((s) =>
                s.studentId === optimisticId ? { ...s, studentId: newId } : s,
              ),
            };
          });
          const rosterId = newId.startsWith("roster:")
            ? newId.slice("roster:".length)
            : undefined;
          if (rosterId) markSelfNotified(rosterId);
        }
      } catch (err) {
        failed.push(`${row.fullName} — ${getErrorMessage(err, "not enlisted")}`);
        failedLrns.add(row.lrn);
      }
      settled += 1;
      dock.updateTask(taskId, {
        progress: { done: settled, total },
        description: `${settled}/${total} saved · ${sectionName}`,
      });
    }

    // Never keep a placeholder for a learner the server refused.
    if (failedLrns.size > 0) {
      queryClient.setQueriesData<AdvisoryRoster>({ queryKey: root }, (current) => {
        if (!current) return current;
        return {
          ...current,
          students: current.students.filter(
            (s) => !(failedLrns.has(s.lrn) && s.studentId.startsWith("pending:")),
          ),
        };
      });
    }

    setAddSaving(false);
    invalidateTeacher.advisory();

    if (failed.length > 0) {
      const message = failed.join(" · ");
      dock.failTask(taskId, message);
      toast.error({
        title:
          failed.length === 1
            ? "One student was not enlisted"
            : `${failed.length} students were not enlisted`,
        description: message,
      });
      return;
    }

    dock.completeTask(
      taskId,
      `${total} student${total === 1 ? "" : "s"} · ${sectionName}`,
    );
    toast.success({
      title: total === 1 ? "Student enlisted" : `${total} students enlisted`,
      description: `${filled.map((row) => row.fullName).join(", ")} added to your ${sectionName === "advisory section" ? "advisory section" : sectionName}.`,
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
    <section aria-label="Advisory list" className="flex min-w-0 flex-col gap-3">
      {students.length === 0 ? (
        <div className="flex h-full min-h-[calc(100dvh-9rem)] w-full items-center justify-center py-6">
          <div className="w-full max-w-md">
            <article
              className={scheduleCardStyles.card}
              aria-label="No advisory students yet"
            >
              <header className={cardStyles.cardHead}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Users size={16} aria-hidden />
                </span>
                <div className={cardStyles.cardId}>
                  <span className={cardStyles.sectionName}>No advisory students yet</span>
                  <span className={cardStyles.teacher}>
                    {sectionLabel || "Your advisory section"}
                  </span>
                </div>
              </header>
              <p className={scheduleCardStyles.progressLine}>
                {sectionLabel
                  ? `${sectionLabel} has no enlisted learners this term.`
                  : "Students enlisted in your advisory section will appear here."}
              </p>
              <div className={cardStyles.cardActions}>
                {archivedStudents.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 gap-1 bg-card px-2 text-[12px] text-foreground"
                    onClick={() => {
                      setRestoreSelected(new Set());
                      setRestoreOpen(true);
                    }}
                  >
                    <ArchiveRestore size={12} aria-hidden />
                    Archived students
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  className="h-6 shrink-0 gap-1 px-2 text-[12px]"
                  onClick={openAdd}
                >
                  <UserPlus size={12} aria-hidden />
                  Add student
                </Button>
              </div>
            </article>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col" aria-label="Advisory board">
            <header className={listStyles.boardHead}>
              <span className={listStyles.boardIcon} aria-hidden>
                <KanbanSquare size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className={listStyles.boardTitle}>Advisory list</h2>
              </div>
              <div className={listStyles.pageActions}>
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

            <div className={listStyles.body}>
              <div className={listStyles.toolbar}>
                <FilterTabs
                  label="Filter students by risk level"
                  variant="tags"
                  options={[
                    {
                      value: "all" as const,
                      label: "All students",
                      count: students.length,
                      tone: "neutral" as const,
                    },
                    {
                      value: "Low" as const,
                      label: "Low",
                      count: riskCounts.Low ?? 0,
                      tone: "green" as const,
                    },
                    {
                      value: "Moderate" as const,
                      label: "Moderate",
                      count: riskCounts.Moderate ?? 0,
                      tone: "amber" as const,
                    },
                    {
                      value: "High" as const,
                      label: "High",
                      count: riskCounts.High ?? 0,
                      tone: "red" as const,
                    },
                  ]}
                  value={riskScope}
                  onChange={(next) => {
                    setRiskScope(next);
                    table.getColumn("risk")?.setFilterValue(next === "all" ? undefined : next);
                  }}
                />
                <TeacherSearchField
                  className="ml-auto w-56 shrink-0 sm:w-64"
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
                <Table className={`${cascade.table} w-full table-fixed`}>
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
                      table.getRowModel().rows.map((row, index) => {
                        const isSelected = row.original.studentId === selectedId;
                        return (
                          <TableRow
                            key={row.id}
                            style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
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
            </div>
        </div>
      )}

      <SidePanel
        open={insightOpen && selectedStudent !== null}
        onClose={() => setInsightOpen(false)}
        label={
          selectedStudent ? `${selectedStudent.name} — student insight` : "Student insight"
        }
        width="3xl"
        showCloseButton
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3">
            {selectedStudent ? (
              <StudentMascot
                name={selectedStudent.name}
                seed={selectedStudent.lrn}
                character={selectedStudent.mascot ?? undefined}
                size={36}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
                {selectedStudent ? formatSurnameFirst(selectedStudent.name) : "Student insight"}
              </h2>
              {selectedStudent ? (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                  <span>
                    LRN:{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {selectedStudent.lrn}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">
                    |
                  </span>
                  <span>
                    Section:{" "}
                    <span className="font-medium text-foreground">
                      {selectedStudent.section || "—"}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">
                    |
                  </span>
                  <span>
                    Grade level:{" "}
                    <span className="font-medium text-foreground">
                      {selectedGradeLevel
                        ? selectedGradeLevel.replace(/^G/, "Grade ")
                        : "—"}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">
                    |
                  </span>
                  <span>
                    Term:{" "}
                    <span className="font-medium text-foreground">
                      {activeTerm ? `Term ${activeTerm.termNumber}` : "—"}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">
                    |
                  </span>
                  <span>
                    School year:{" "}
                    <span className="font-medium text-foreground">
                      {activeTerm?.schoolYearName ?? "—"}
                    </span>
                  </span>
                </p>
              ) : null}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <AdvisoryInsightBoard student={selectedStudent} bare />
          </div>
        </div>
      </SidePanel>

      {editArmed && editIntroOpen ? (
        <MessageOverlay
          width="sm"
          tone="warning"
          icon={<Pencil size={16} aria-hidden />}
          title="Edit student"
          description="Correct a learner's name or LRN without leaving the advisory list."
          detail="Tick one student, then press Edit student. Names and LRNs only — an LRN stays 12 digits and is saved to the linked account too."
          onDismiss={exitEditMode}
          actions={
            <Button
              type="button"
              size="sm"
              className="px-3 text-[12px]"
              onClick={() => setEditIntroOpen(false)}
              autoFocus
            >
              Start editing
            </Button>
          }
        />
      ) : null}

      {removeArmed && removeIntroOpen ? (
        <MessageOverlay
          width="sm"
          tone="danger"
          icon={<Trash2 size={16} aria-hidden />}
          title="Remove students"
          description="Soft delete — the learner is only hidden from your advisory list."
          detail="Grades, attendance, anecdotal records and referrals stay intact. Any learner can be restored from Archived students at any time."
          onDismiss={exitRemoveMode}
          actions={
            <Button
              type="button"
              size="sm"
              className="px-3 text-[12px]"
              onClick={() => setRemoveIntroOpen(false)}
              autoFocus
            >
              Start selecting
            </Button>
          }
        />
      ) : null}

      <FormOverlay
        open={addOpen}
        onClose={() => {
          if (!addSaving) setAddOpen(false);
        }}
        label="Add students"
        variant="drawer"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
          <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
              aria-hidden
            >
              <UserPlus size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                Add students
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Enlist one or more learners into {addSectionLabel} in one pass.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!addSaving) setAddOpen(false);
              }}
              disabled={addSaving}
              aria-label="Close add students"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddStudents();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-foreground">Students</span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={addRow}
                    disabled={addRows.length >= MAX_ADD_ROWS}
                    aria-label="Add another student"
                    title="Add another student"
                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Plus size={14} aria-hidden />
                  </Button>
                </div>
                <div className="flex flex-col">
                  {addRows.map((row, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 border-t border-amber-500/40 py-2 first:border-t-0 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Input
                          className={ADD_INPUT_CLASS}
                          placeholder="Full name, e.g. Juan Garcia"
                          value={row.name}
                          onChange={(e) => {
                            setAddRow(index, { name: e.target.value });
                            setAddError(null);
                          }}
                          maxLength={120}
                          autoFocus={index === 0}
                          autoComplete="off"
                          aria-label={`Full name ${index + 1}`}
                        />
                        <Input
                          className={ADD_INPUT_CLASS}
                          placeholder="12-digit LRN"
                          value={row.lrn}
                          onChange={(e) => {
                            // Digits only — a DepEd LRN is exactly 12 numbers.
                            setAddRow(index, {
                              lrn: e.target.value.replace(/\D/g, "").slice(0, 12),
                            });
                            setAddError(null);
                          }}
                          inputMode="numeric"
                          pattern="[0-9]{12}"
                          autoComplete="off"
                          maxLength={12}
                          aria-label={`LRN ${index + 1}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAddRow(index)}
                        aria-label={`Cancel student ${index + 1}`}
                        className="mt-1.5 shrink-0 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground hover:underline hover:underline-offset-2"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Every filled row is enlisted for {addSectionLabel}. Leave a row empty to skip it.
                </p>
                {addDuplicateLrn ? (
                  <p role="alert" className="text-[12px] leading-snug text-destructive">
                    LRN {addDuplicateLrn} appears twice — each student must be different.
                  </p>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <Label>Learner type</Label>
                <div role="radiogroup" aria-label="Learner type" className="grid grid-cols-2 gap-2">
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

              <div className="mt-auto flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                <UserPlus size={13} aria-hidden className="mt-0.5 shrink-0 text-amber-500" />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  A transferee&apos;s attendance window opens on enlistment day. Names and LRNs must
                  be unique — an existing learner is matched by LRN instead of duplicated.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Button
                type="submit"
                disabled={addSaving || addFilledRows.length === 0}
                aria-busy={addSaving || undefined}
                className="h-6 gap-1.5 px-2.5 text-[12px]"
              >
                {addSaving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    <span aria-live="polite">Enlisting…</span>
                  </>
                ) : addFilledRows.length > 1 ? (
                  `Enlist ${addFilledRows.length} students`
                ) : (
                  "Enlist student"
                )}
              </Button>
            </div>
          </form>
        </div>
      </FormOverlay>

      <FormOverlay
        open={editOpen && editTarget !== null}
        onClose={() => {
          if (!editSaving) setEditOpen(false);
        }}
        label="Edit student"
        variant="drawer"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
          <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
              aria-hidden
            >
              <Pencil size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                Edit student
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Correct the learner&apos;s name or LRN. The LRN stays 12 digits, numbers only.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!editSaving) setEditOpen(false);
              }}
              disabled={editSaving}
              aria-label="Close edit student"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="advisory-edit-name">Full name</Label>
              <Input
                id="advisory-edit-name"
                className={ADD_INPUT_CLASS}
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
                className={ADD_INPUT_CLASS}
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

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
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
        </div>
      </FormOverlay>
      <FormOverlay
        open={removeOpen && removeTargets.length > 0}
        onClose={() => {
          if (!removeSaving) setRemoveOpen(false);
        }}
        label={
          removeTargets.length === 1
            ? "Remove student"
            : `Remove ${removeTargets.length} students`
        }
        variant="drawer"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
          <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-500"
              aria-hidden
            >
              <Trash2 size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                {removeTargets.length === 1
                  ? "Remove student"
                  : `Remove ${removeTargets.length} students`}
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Hide these learners from your advisory list. Nothing is deleted.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!removeSaving) setRemoveOpen(false);
              }}
              disabled={removeSaving}
              aria-label="Close remove students"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {/* Compact row cards for the remove confirmation list. */}
            <ul className={`${listStyles.thinScrollbar} flex min-w-0 flex-col gap-2`}>
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
                    <span className="mt-0.5 block text-[12px] tabular-nums text-muted-foreground">
                      {target.lrn}
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

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
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
        </div>
      </FormOverlay>

      <FormOverlay
        open={restoreOpen}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreSelected(new Set());
        }}
        label="Archived students"
        variant="drawer"
        drawerWidth="lg"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
          <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500"
              aria-hidden
            >
              <ArchiveRestore size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight text-foreground">
                Archived students
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Learners you archived from your advisory list. Restoring brings back their
                full record history.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setRestoreOpen(false);
                setRestoreSelected(new Set());
              }}
              aria-label="Close archived students"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
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
                          <span className="block text-[12px] tabular-nums text-muted-foreground">
                            {entry.lrn}
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

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
            <span className="text-[12px] text-muted-foreground">
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
        </div>
      </FormOverlay>

    </section>
  );
}
