"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
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
import { BookOpen, Loader2, Users } from "lucide-react";
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
import { TeacherEmptyCard } from "../../components/TeacherEmptyCard";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/components/shared/pagination";
import { useAdvisoryRoster } from "@/services/teacher/advisory.service";
import type { AdviseeRow } from "@/services/teacher/advisory.types";
import { compareSurnameFirst, formatSurnameFirst } from "@/lib/names";
import listStyles from "../list/components/advisory-list.module.css";
import {
  AdvisoryGradesBoard,
  generalAverageOf,
} from "./components/AdvisoryGradesBoard";
import { StudentMascot } from "../referrals/components/StudentMascot";
import { AdvisoryStudentsSkeleton } from "./components/AdvisoryStudentsSkeleton";

/** Average pill tone — same thresholds as the subject-lane grade pills. */
function averageTone(value: number | null): "neutral" | "green" | "amber" | "red" {
  if (value === null) return "neutral";
  if (value >= 90) return "green";
  if (value >= 80) return "amber";
  return "red";
}

export default function TeacherAdvisoryStudentsPage() {
  const rosterQuery = useAdvisoryRoster();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const students = React.useMemo(
    () => rosterQuery.data?.students ?? [],
    [rosterQuery.data],
  );
  const sections = React.useMemo(
    () => rosterQuery.data?.advisorySections ?? [],
    [rosterQuery.data],
  );
  const subjects = React.useMemo(
    () =>
      [...(rosterQuery.data?.subjects ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [rosterQuery.data],
  );
  const sectionLabel = React.useMemo(
    () => sections.map((s) => s.name).join(", "),
    [sections],
  );

  const [sectionId, setSectionId] = React.useState<string>("all");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const filteredStudents = React.useMemo(() => {
    const inSection =
      sectionId === "all"
        ? students
        : students.filter((s) => {
            const sec = sections.find((x) => x.id === sectionId);
            return !sec || s.section === sec.name;
          });
    // Alphabetical by surname so the roster reads like the class record.
    return [...inSection].sort((a, b) => compareSurnameFirst(a.name, b.name));
  }, [students, sections, sectionId]);

  // Keep a valid selection as the roster loads / changes.
  React.useEffect(() => {
    if (filteredStudents.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && filteredStudents.some((s) => s.studentId === prev)
        ? prev
        : (highlightId &&
            filteredStudents.some((s) => s.studentId === highlightId)
            ? highlightId
            : filteredStudents[0]!.studentId),
    );
  }, [filteredStudents, highlightId]);

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
        cell: ({ row }) => {
          const value = generalAverageOf(row.original, subjects);
          return (
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
                    <Pill
                      className="h-6 max-w-full truncate leading-none"
                      tone="neutral"
                      label="LRN"
                      title={row.original.lrn}
                    >
                      {row.original.lrn}
                    </Pill>
                    {row.original.learnerType === "transferee" ? (
                      <Pill className="h-6 leading-none" tone="amber" label="Learner type">
                        Transferee
                      </Pill>
                    ) : null}
                  </span>
                  <Pill
                    className="h-6 shrink-0 leading-none tabular-nums"
                    tone={averageTone(value)}
                    label="General average"
                    title="Mean of the student's graded live subject averages"
                  >
                    {value === null ? "—" : value.toFixed(1)}
                  </Pill>
                </span>
              </div>
            </div>
          );
        },
      },
    ],
    [subjects],
  );

  const table = useReactTable({
    data: filteredStudents,
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

  // Jump to the page containing the highlighted student (from advisory list).
  React.useEffect(() => {
    if (!highlightId) return;
    const idx = filteredStudents.findIndex((s) => s.studentId === highlightId);
    if (idx < 0) return;
    const pageSize = table.getState().pagination.pageSize;
    table.setPageIndex(Math.floor(idx / pageSize));
  }, [highlightId, filteredStudents, table]);

  // Scroll the highlighted row into view after pagination settles.
  const pageIndex = table.getState().pagination.pageIndex;
  React.useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`student-row-${CSS.escape(highlightId)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, pageIndex, filteredStudents]);

  if (rosterQuery.isPending) {
    return <AdvisoryStudentsSkeleton />;
  }

  if (rosterQuery.isError) {
    return (
      <section aria-label="Advisory academics" className="flex min-w-0 flex-col gap-3">
        <TeacherEmptyCard
          centered
          icon={Users}
          title="No advisory section assigned"
          hint="No advisory section assigned, or it could not be loaded. Contact the school office."
          label="Advisory academics"
          action={
            <Button variant="outline" size="sm" onClick={() => rosterQuery.refetch()} disabled={rosterQuery.isFetching}>
              {rosterQuery.isFetching ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  <span aria-live="polite">Retrying</span>
                </>
              ) : (
                "Try again"
              )}
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section
      aria-label="Advisory academics"
      className={`${listStyles.pageLock} flex min-w-0 flex-col gap-3`}
    >
      {students.length === 0 ? (
        <div className="relative flex h-full min-h-[calc(100dvh-9rem)] w-full items-center justify-center">
          <InsightCallout role="status" className="w-full max-w-xl self-center text-left">
            <strong>No learners in your advisory section yet.</strong>{" "}
            {sectionLabel
              ? `${sectionLabel} has no enlisted learners this term.`
              : "Learners enlisted in your advisory section will appear here with their live grades."}
          </InsightCallout>
        </div>
      ) : (
        <div className={listStyles.panel} aria-label="Advisory academics board">
          <header className={listStyles.boardHead}>
            <span className={listStyles.boardIcon} aria-hidden>
              <BookOpen size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={listStyles.boardTitle}>Advisory academics</h2>
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
                      value={sectionId}
                      onValueChange={(v) => {
                        setSectionId(v);
                        setSelectedId(null);
                      }}
                    >
                      <SelectTrigger className="w-36 shrink-0" aria-label="Section">
                        <SelectValue placeholder="All sections" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sections</SelectItem>
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
                          const isSelected = row.original.studentId === selectedId;
                          const average = generalAverageOf(row.original, subjects);
                          return (
                            <TableRow
                              key={row.id}
                              id={`student-row-${row.original.studentId}`}
                              onClick={() => setSelectedId(row.original.studentId)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedId(row.original.studentId);
                                }
                              }}
                              tabIndex={0}
                              aria-selected={isSelected}
                              aria-label={
                                average === null
                                  ? `${row.original.name}, no grades yet — open subject breakdown`
                                  : `${row.original.name}, general average ${average.toFixed(1)} — open subject breakdown`
                              }
                              className={`${listStyles.row} ${isSelected ? listStyles.selected : ""} ${highlightId === row.original.studentId ? "bg-primary/10" : ""}`}
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
            <div className={listStyles.right} aria-label="Student grades">
              <AdvisoryGradesBoard
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
