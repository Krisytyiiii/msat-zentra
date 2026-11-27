"use client";

import * as React from "react";
import { useLiveQuery } from "@/lib/api/live";
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
import { CalendarClock, Eye, Loader2, Users } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
import { SidePanel } from "@/components/ui/side-panel";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { Pill } from "@/components/ui/pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdvisoryRoster } from "@/services/teacher/advisory.service";
import { compareSurnameFirst, formatSurnameFirst } from "@/lib/names";
import assign from "@/app/principal/academics/assign/components/section-assignments.module.css";
import cascade from "@/components/shared/desk-cascade.module.css";
import listStyles from "../list/components/advisory-list.module.css";
import {
  AdvisoryAttendanceBoard,
  attendanceOverall,
  type AttendanceMatrixStudent,
  type AttendanceMatrixSubject,
} from "./components/AdvisoryAttendanceBoard";
import { StudentMascot } from "../referrals/components/StudentMascot";
import { AdvisoryAttendanceSkeleton } from "./components/AdvisoryAttendanceSkeleton";

interface SectionSubjectMatrix {
  sectionId: string;
  sectionName: string;
  termId: string;
  subjects: AttendanceMatrixSubject[];
  students: AttendanceMatrixStudent[];
}

type RiskLevel = "Low" | "Moderate" | "High";

interface AttendanceRow {
  student: AttendanceMatrixStudent;
  /** Overall risk level from the advisory roster (not attendance-only). */
  riskLevel: RiskLevel;
  avg: number | null;
  /** Present meetups / elapsed meetups across every subject. */
  presentMeetups: number;
  totalMeetups: number;
  /** Subjects that already have attendance marks. */
  trackedSubjects: number;
}

export default function AdvisoryAttendancePage() {
  const rosterQuery = useAdvisoryRoster();
  const { activeTerm } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  const sections = React.useMemo(
    () => rosterQuery.data?.advisorySections ?? [],
    [rosterQuery.data],
  );
  const [sectionId, setSectionId] = React.useState<string | undefined>(undefined);
  const resolvedSectionId = sectionId ?? sections[0]?.id;

  const matrixQuery = useLiveQuery<SectionSubjectMatrix>({
    queryKey: ["attendance-section-matrix", resolvedSectionId, termKey],
    queryFn: async () => {
      const params = new URLSearchParams({ sectionId: resolvedSectionId as string });
      const { data } = await apiClient.get<SectionSubjectMatrix>(
        `/api/attendance/section-subject-matrix?${params.toString()}`,
      );
      return data;
    },
    enabled: !!resolvedSectionId,
    retry: false,
  });

  const subjects = React.useMemo(
    () => matrixQuery.data?.subjects ?? [],
    [matrixQuery.data],
  );
  const students = React.useMemo(
    () => matrixQuery.data?.students ?? [],
    [matrixQuery.data],
  );
  const sectionLabel = React.useMemo(
    () => matrixQuery.data?.sectionName ?? sections.map((s) => s.name).join(", "),
    [matrixQuery.data, sections],
  );

  // Overall risk level per learner — read off the live advisory roster, not
  // the attendance matrix (risk also weighs grades and anecdotal records).
  const riskByStudentId = React.useMemo(() => {
    const map = new Map<string, RiskLevel>();
    for (const student of rosterQuery.data?.students ?? []) {
      map.set(student.studentId, student.riskLevel);
    }
    return map;
  }, [rosterQuery.data]);

  // Alphabetical by surname so the roster reads like the class record.
  const rows = React.useMemo<AttendanceRow[]>(
    () =>
      students
        .map((student) => {
          let presentMeetups = 0;
          let totalMeetups = 0;
          let trackedSubjects = 0;
          for (const subject of subjects) {
            presentMeetups += student.presentMeetups?.[subject.id] ?? 0;
            totalMeetups += student.meetups?.[subject.id] ?? 0;
            if (typeof student.rates[subject.id] === "number") trackedSubjects += 1;
          }
          return {
            student,
            riskLevel: riskByStudentId.get(student.studentId) ?? "Low",
            avg: attendanceOverall(student.rates, subjects.length),
            presentMeetups,
            totalMeetups,
            trackedSubjects,
          };
        })
        .sort((a, b) => compareSurnameFirst(a.student.name, b.student.name)),
    [students, subjects, riskByStudentId],
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /** The per-subject attendance drawer opened by a row click / eye action. */
  const [insightOpen, setInsightOpen] = React.useState(false);

  // Keep a valid selection as the section data loads / changes.
  React.useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && rows.some((r) => r.student.studentId === prev)
        ? prev
        : rows[0]!.student.studentId,
    );
  }, [rows]);

  const selectedStudent = React.useMemo(
    () => students.find((s) => s.studentId === selectedId) ?? null,
    [students, selectedId],
  );

  const selectedSection = React.useMemo(
    () => sections.find((s) => s.id === resolvedSectionId) ?? null,
    [sections, resolvedSectionId],
  );

  function openInsight(studentId: string) {
    setSelectedId(studentId);
    setInsightOpen(true);
  }

  const columns = React.useMemo<ColumnDef<AttendanceRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => `${formatSurnameFirst(row.student.name)} ${row.student.lrn}`,
        header: "Student",
        size: 250,
        minSize: 230,
        maxSize: 300,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <StudentMascot
              name={row.original.student.name}
              seed={row.original.student.lrn}
              character={row.original.student.mascot ?? undefined}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <span
                className="block truncate text-[13px] font-semibold text-primary"
                title={row.original.student.name}
              >
                {formatSurnameFirst(row.original.student.name)}
              </span>
              <span className="mt-0.5 flex max-w-full items-center gap-1.5">
                <span
                  className="block min-w-0 truncate font-mono text-[12px] tabular-nums text-muted-foreground"
                  title={`LRN ${row.original.student.lrn}`}
                >
                  {row.original.student.lrn}
                </span>
                {row.original.student.learnerType === "transferee" ? (
                  <Pill className="h-6 shrink-0 leading-none" tone="amber" label="Learner type">
                    Transferee
                  </Pill>
                ) : null}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: "risk",
        accessorKey: "riskLevel",
        header: "Risk",
        size: 100,
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
        id: "present",
        accessorFn: (row) => row.avg ?? -1,
        header: "Present rate",
        size: 150,
        minSize: 130,
        cell: ({ row }) => {
          const avg = row.original.avg;
          if (avg === null) {
            return <span className="text-[12px] text-muted-foreground">No marks</span>;
          }
          const pct = Math.round(avg * 100);
          return (
            <span className="flex items-center gap-2" aria-label={`Present rate ${pct}%`}>
              <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full ${
                    pct < 75 ? "bg-red-500" : pct < 90 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </span>
              <span className="text-[12px] font-medium tabular-nums">{pct}%</span>
            </span>
          );
        },
      },
      {
        id: "meetups",
        accessorFn: (row) => row.presentMeetups,
        header: "Meetups",
        size: 130,
        minSize: 110,
        cell: ({ row }) => {
          const { presentMeetups, totalMeetups } = row.original;
          if (totalMeetups === 0) {
            return <span className="text-[12px] text-muted-foreground">—</span>;
          }
          return (
            <span className="text-[12px] tabular-nums text-foreground">
              {presentMeetups} of {totalMeetups} present
            </span>
          );
        },
      },
      {
        id: "subjects",
        accessorFn: (row) => row.trackedSubjects,
        header: "Subjects",
        size: 120,
        minSize: 100,
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {row.original.trackedSubjects} of {subjects.length} with marks
          </span>
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
              aria-label={`Open ${row.original.student.name}'s attendance by subject`}
              title="Open attendance breakdown"
              onClick={() => openInsight(row.original.student.studentId)}
            >
              <Eye size={13} aria-hidden />
            </Button>
          </div>
        ),
      },
    ],
    [subjects.length],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.student.studentId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
  });

  const loading = rosterQuery.isPending || matrixQuery.isPending;

  if (loading) {
    return <AdvisoryAttendanceSkeleton />;
  }

  if (rosterQuery.isError || sections.length === 0) {
    return (
      <section aria-label="Advisory attendance" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center">
          <div className={`${assign.card} w-full max-w-md`}>
            <span className={assign.glowClip} aria-hidden="true">
              <span className={assign.cardGlow} />
            </span>
            <div className="relative flex flex-col items-center gap-2 py-6 text-center">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"
                aria-hidden="true"
              >
                <Users size={24} className="text-muted-foreground" />
              </span>
              <p className="font-medium">No advisory section</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Advisory attendance appears here once a section is assigned to you.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (matrixQuery.isError) {
    return (
      <section aria-label="Advisory attendance" className="flex min-w-0 flex-col gap-3">
        <div className={assign.card}>
          <span className={assign.glowClip} aria-hidden="true">
            <span className={assign.cardGlow} />
          </span>
          <div className="relative flex flex-col items-center gap-2 py-6 text-center">
            <p role="alert" className="font-medium">
              Could not load advisory attendance.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => matrixQuery.refetch()}
              disabled={matrixQuery.isFetching}
            >
              {matrixQuery.isFetching ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  <span aria-live="polite">Retrying</span>
                </>
              ) : (
                "Try again"
              )}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Advisory attendance" className="flex min-w-0 flex-col gap-3">
      {rows.length === 0 ? (
        <div className="relative flex h-full min-h-[calc(100dvh-9rem)] w-full items-center justify-center">
          <InsightCallout role="status" className="w-full max-w-xl self-center text-left">
            <strong>No advisory students yet.</strong>{" "}
            {sectionLabel
              ? `${sectionLabel} has no enlisted learners this term.`
              : "Students enlisted in your advisory section will appear here."}
          </InsightCallout>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col" aria-label="Advisory attendance board">
            <header className={listStyles.boardHead}>
              <span className={listStyles.boardIcon} aria-hidden>
                <CalendarClock size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className={listStyles.boardTitle}>Advisory attendance</h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <TeacherSearchField
                  className="w-56 shrink-0 sm:w-64"
                  placeholder="Search students…"
                  value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
                  onChange={(next) => table.getColumn("name")?.setFilterValue(next)}
                  aria-label="Filter students"
                />
                {sections.length > 1 ? (
                  <Select
                    value={resolvedSectionId ?? ""}
                    onValueChange={(v) => {
                      setSectionId(v);
                      setSelectedId(null);
                    }}
                  >
                    <SelectTrigger className="w-36 shrink-0" aria-label="Section">
                      <SelectValue placeholder="Select a section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            </header>

            <div className={listStyles.body}>
              <div className={listStyles.tableWrap}>
                <Table className={`${cascade.table} w-full table-fixed`}>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-muted/50 [&>th]:border-t-0">
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
                        const isSelected = row.original.student.studentId === selectedId;
                        const pct =
                          row.original.avg === null ? null : Math.round(row.original.avg * 100);
                        return (
                          <TableRow
                            key={row.id}
                            style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
                            onClick={() => openInsight(row.original.student.studentId)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openInsight(row.original.student.studentId);
                              }
                            }}
                            tabIndex={0}
                            aria-selected={isSelected}
                            aria-label={`${row.original.student.name}, ${
                              pct === null ? "no attendance marks" : `${pct} percent present`
                            } — open subject breakdown`}
                            className={`${listStyles.row} ${isSelected ? listStyles.selected : ""}`}
                          >
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
                        <TableCell colSpan={columns.length} className="h-40 whitespace-normal">
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
          selectedStudent
            ? `${selectedStudent.name} — attendance by subject`
            : "Attendance by subject"
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
                {selectedStudent
                  ? formatSurnameFirst(selectedStudent.name)
                  : "Attendance by subject"}
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
                      {matrixQuery.data?.sectionName || selectedSection?.name || "—"}
                    </span>
                  </span>
                  <span aria-hidden className="text-border">
                    |
                  </span>
                  <span>
                    Grade level:{" "}
                    <span className="font-medium text-foreground">
                      {selectedSection?.gradeLevel
                        ? selectedSection.gradeLevel.replace(/^G/, "Grade ")
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
            <AdvisoryAttendanceBoard student={selectedStudent} subjects={subjects} bare />
          </div>
        </div>
      </SidePanel>
    </section>
  );
}
