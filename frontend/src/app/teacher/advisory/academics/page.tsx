"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
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
import { BookOpen, Eye, Loader2, Users } from "lucide-react";
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
import { TeacherEmptyCard } from "../../components/TeacherEmptyCard";
import { useAdvisoryRoster } from "@/services/teacher/advisory.service";
import type { AdviseeRow } from "@/services/teacher/advisory.types";
import { compareSurnameFirst, formatSurnameFirst } from "@/lib/names";
import { useTerm } from "@/lib/term/TermContext";
import cascade from "@/components/shared/desk-cascade.module.css";
import listStyles from "../list/components/advisory-list.module.css";
import {
  AdvisoryGradesBoard,
  generalAverageOf,
  gradeOf,
} from "./components/AdvisoryGradesBoard";
import { StudentMascot } from "../referrals/components/StudentMascot";
import { AdvisoryStudentsSkeleton } from "./components/AdvisoryStudentsSkeleton";

type RiskLevel = "Low" | "Moderate" | "High";

export default function TeacherAdvisoryStudentsPage() {
  const rosterQuery = useAdvisoryRoster();
  const { activeTerm } = useTerm();
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
  /** The per-subject grades drawer opened by a row click / eye action. */
  const [insightOpen, setInsightOpen] = React.useState(false);

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

  const selectedGradeLevel = React.useMemo(() => {
    if (!selectedStudent?.section) return null;
    return sections.find((s) => s.name === selectedStudent.section)?.gradeLevel ?? null;
  }, [selectedStudent, sections]);

  // Scroll the highlighted row into view (arriving from the advisory list).
  React.useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`student-row-${CSS.escape(highlightId)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, filteredStudents]);

  function openInsight(studentId: string) {
    setSelectedId(studentId);
    setInsightOpen(true);
  }

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
              <span className="mt-0.5 flex max-w-full items-center gap-1.5">
                <span
                  className="block min-w-0 truncate font-mono text-[12px] tabular-nums text-muted-foreground"
                  title={`LRN ${row.original.lrn}`}
                >
                  {row.original.lrn}
                </span>
                {row.original.learnerType === "transferee" ? (
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
          const level: RiskLevel = row.original.riskLevel;
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
        id: "average",
        accessorFn: (row) => generalAverageOf(row, subjects) ?? -1,
        header: "General average",
        size: 150,
        minSize: 130,
        cell: ({ row }) => {
          const average = generalAverageOf(row.original, subjects);
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
        id: "subjects",
        accessorFn: (row) =>
          subjects.filter((subject) => gradeOf(row, subject.name) !== null).length,
        header: "Subjects",
        size: 130,
        minSize: 110,
        cell: ({ row }) => {
          const graded = subjects.filter(
            (subject) => gradeOf(row.original, subject.name) !== null,
          ).length;
          return (
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {graded} of {subjects.length} with grades
            </span>
          );
        },
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
              aria-label={`Open ${row.original.name}'s grades by subject`}
              title="Open grades breakdown"
              onClick={() => openInsight(row.original.studentId)}
            >
              <Eye size={13} aria-hidden />
            </Button>
          </div>
        ),
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
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, columnFilters },
  });

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
    <section aria-label="Advisory academics" className="flex min-w-0 flex-col gap-3">
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
        <div className="flex min-w-0 flex-col" aria-label="Advisory academics board">
          <header className={listStyles.boardHead}>
            <span className={listStyles.boardIcon} aria-hidden>
              <BookOpen size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={listStyles.boardTitle}>Advisory academics</h2>
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
                      const isSelected = row.original.studentId === selectedId;
                      const average = generalAverageOf(row.original, subjects);
                      return (
                        <TableRow
                          key={row.id}
                          style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
                          id={`student-row-${row.original.studentId}`}
                          onClick={() => openInsight(row.original.studentId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openInsight(row.original.studentId);
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
          </div>
        </div>
      )}

      <SidePanel
        open={insightOpen && selectedStudent !== null}
        onClose={() => setInsightOpen(false)}
        label={
          selectedStudent ? `${selectedStudent.name} — grades by subject` : "Grades by subject"
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
                {selectedStudent ? formatSurnameFirst(selectedStudent.name) : "Grades by subject"}
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
            <AdvisoryGradesBoard student={selectedStudent} subjects={subjects} bare />
          </div>
        </div>
      </SidePanel>
    </section>
  );
}
