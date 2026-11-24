"use client";

import * as React from "react";
import { useLiveQuery } from "@/lib/api/live";
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
import { CalendarClock, Loader2, Users } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useTerm } from "@/lib/term/TermContext";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
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
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { useAdvisoryRoster } from "@/services/teacher/advisory.service";
import { compareSurnameFirst, formatSurnameFirst } from "@/lib/names";
import assign from "@/app/principal/academics/assign/components/section-assignments.module.css";
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

interface AttendanceRow {
  student: AttendanceMatrixStudent;
  avg: number | null;
}

/** Present-rate pill tone — same thresholds as the attendance board. */
function presentTone(rate: number | null): "neutral" | "green" | "amber" | "red" {
  if (rate === null) return "neutral";
  if (rate >= 0.9) return "green";
  if (rate >= 0.75) return "amber";
  return "red";
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

  // Alphabetical by surname so the roster reads like the class record.
  const rows = React.useMemo<AttendanceRow[]>(
    () =>
      students
        .map((student) => ({
          student,
          avg: attendanceOverall(student.rates, subjects.length),
        }))
        .sort((a, b) => compareSurnameFirst(a.student.name, b.student.name)),
    [students, subjects.length],
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

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

  const columns = React.useMemo<ColumnDef<AttendanceRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => `${formatSurnameFirst(row.student.name)} ${row.student.lrn}`,
        header: "Student",
        size: 250,
        minSize: 230,
        maxSize: 300,
        cell: ({ row }) => {
          const pct =
            row.original.avg === null ? null : Math.round(row.original.avg * 100);
          return (
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
                <span className="mt-1 flex max-w-full items-center justify-between gap-1.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Pill
                      className="h-6 max-w-full truncate leading-none"
                      tone="neutral"
                      label="LRN"
                      title={row.original.student.lrn}
                    >
                      {row.original.student.lrn}
                    </Pill>
                    {row.original.student.learnerType === "transferee" ? (
                      <Pill className="h-6 leading-none" tone="amber" label="Learner type">
                        Transferee
                      </Pill>
                    ) : null}
                  </span>
                  <Pill
                    className="h-6 shrink-0 leading-none tabular-nums"
                    tone={presentTone(row.original.avg)}
                    label="Present rate"
                  >
                    {pct === null ? "—" : `${pct}%`}
                  </Pill>
                </span>
              </div>
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.student.studentId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
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
    <section
      aria-label="Advisory attendance"
      className={`${listStyles.pageLock} flex min-w-0 flex-col gap-3`}
    >
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
        <div className={listStyles.panel} aria-label="Advisory attendance board">
          <header className={listStyles.boardHead}>
            <span className={listStyles.boardIcon} aria-hidden>
              <CalendarClock size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={listStyles.boardTitle}>Advisory attendance</h2>
            </div>
          </header>

          <div className={listStyles.split}>
            <div className={listStyles.left}>
              <section className={listStyles.lane} aria-label="Advisory list lane">
                <header className={listStyles.laneHead}>
                  <span className={listStyles.laneDot} style={{ background: "#f59e0b" }} aria-hidden />
                  <h3 className={listStyles.laneTitle}>Advisory list</h3>
                </header>
                <div className={listStyles.toolbar}>
                  <TeacherSearchField
                    className="w-full min-w-0 flex-1"
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

                <div className={listStyles.tableWrap}>
                  <Table className="w-full table-fixed">
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
                        table.getRowModel().rows.map((row) => {
                          const isSelected =
                            row.original.student.studentId === selectedId;
                          const pct =
                            row.original.avg === null
                              ? null
                              : Math.round(row.original.avg * 100);
                          return (
                            <TableRow
                              key={row.id}
                              onClick={() => setSelectedId(row.original.student.studentId)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedId(row.original.student.studentId);
                                }
                              }}
                              tabIndex={0}
                              aria-selected={isSelected}
                              aria-label={`${row.original.student.name}, ${pct === null ? "no attendance marks" : `${pct} percent present`} — open subject breakdown`}
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
                <Pagination
                  currentPage={table.getState().pagination.pageIndex + 1}
                  totalItems={table.getFilteredRowModel().rows.length}
                  onPageChange={(p) => table.setPageIndex(p - 1)}
                />
              </section>
            </div>
            <div className={listStyles.right} aria-label="Student attendance">
              <AdvisoryAttendanceBoard
                student={selectedStudent}
                subjects={subjects}
                bare
              />
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
