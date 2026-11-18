"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  flexRender,
  type Column,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { PrincipalEmptyState } from "../../components/PrincipalEmptyCard";
import { useTerm } from "@/lib/term/TermContext";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { riskTone } from "@/lib/labels/status-tone";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { InsightCallout } from "@/components/ui/insight-callout";
import {
  Table,
  TableBody,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import type { BackendStudent, RiskFactor } from "@/services/principal/riskStudents.types";
import { fetchAllRiskStudents } from "@/services/principal/riskStudents.service";
import styles from "./HighRiskStudentsTable.module.css";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { useRiskFocus } from "./risk-focus";

const FACTOR_LABEL: Record<RiskFactor, string> = {
  Academic: "Academic",
  Attendance: "Attendance",
  Behavioral: "Anecdotal",
};

const FACTOR_ORDER: RiskFactor[] = ["Academic", "Attendance", "Behavioral"];

/** Same colour family the risk deck uses for each factor. */
const FACTOR_TONE: Record<RiskFactor, PillTone> = {
  Academic: "amber",
  Attendance: "green",
  Behavioral: "blue",
};

/**
 * Sortable column header — the label itself is the control (no chevron icon),
 * so the header row stays typographic; sorting is still keyboard-usable and
 * announced through `aria-sort` on the cell.
 */
function sortableHeader(label: string) {
  function SortableHeader({ column }: { column: Column<BackendStudent, unknown> }) {
    return (
      <button
        type="button"
        className={styles.sortBtn}
        onClick={column.getToggleSortingHandler()}
        title={`Sort by ${label.toLowerCase()}`}
        aria-label={`Sort by ${label.toLowerCase()}`}
      >
        {label}
      </button>
    );
  }
  return SortableHeader;
}

export function HighRiskStudentsTable() {
  const [query, setQuery] = usePersistentState<string>(
    "zentra.risk.highRisk.search",
    "",
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [page, setPage] = React.useState(1);
  const focus = useRiskFocus();

  const { activeTerm } = useTerm();
  const termId = activeTerm?.termId ?? null;
  const schoolYearId = activeTerm?.schoolYearId ?? null;
  // Whole risk roster, loaded once per term. Focus, search, sorting and
  // paging then run entirely in memory — nothing here fires a request.
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["risk-students-all", termId, schoolYearId],
    queryFn: fetchAllRiskStudents,
    staleTime: 5 * 60_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });

  const level = focus.level ?? "High";

  const levelRoster = React.useMemo(
    () => (data ?? []).filter((student) => student.riskLevel === level),
    [data, level],
  );

  const filtered = React.useMemo(() => {
    let rows = levelRoster;
    if (focus.factor) {
      rows = rows.filter((student) => student.factors[focus.factor as RiskFactor]);
    }
    if (focus.section) {
      rows = rows.filter((student) => student.section === focus.section);
    }
    const needle = query.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (student) =>
          student.name.toLowerCase().includes(needle) ||
          student.lrn.toLowerCase().includes(needle),
      );
    }
    return rows;
  }, [levelRoster, focus.factor, focus.section, query]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // A new focus narrows the roster; step back to the first page so the footer
  // label and the visible rows never disagree.
  React.useEffect(() => {
    setPage(1);
  }, [focus.level, focus.factor, focus.section]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const applySearch = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const columns = React.useMemo<ColumnDef<BackendStudent>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: sortableHeader("Student"),
        size: 240,
        minSize: 240,
        maxSize: 240,
        cell: ({ row }) => (
          <div className={styles.studentCell}>
            <StudentMascot
              name={row.original.name}
              seed={row.original.lrn}
              character={row.original.mascot ?? undefined}
              size={30}
            />
            <div className={styles.studentMeta}>
              <span className={styles.studentName}>{row.original.name}</span>
              <Pill tone="neutral" label="LRN" className="w-fit">
                {row.original.lrn}
              </Pill>
            </div>
          </div>
        ),
      },
      {
        id: "section",
        accessorFn: (row) => row.section,
        header: sortableHeader("Section"),
        size: 170,
        minSize: 170,
        maxSize: 170,
        cell: ({ row }) => (
          <Pill tone="green" label="Section">
            {row.original.section}
          </Pill>
        ),
      },
      {
        id: "risk",
        accessorFn: (row) => row.riskLevel,
        header: sortableHeader("Risk"),
        size: 120,
        minSize: 120,
        maxSize: 120,
        cell: ({ row }) => (
          <Pill tone={riskTone(row.original.riskLevel)} label="Risk level">
            {row.original.riskLevel}
          </Pill>
        ),
      },
      {
        // Sorts on the number of active factors, not the label text.
        id: "factors",
        accessorFn: (row) =>
          FACTOR_ORDER.filter((factor) => row.factors[factor]).length,
        header: sortableHeader("Factors"),
        size: 230,
        minSize: 230,
        maxSize: 230,
        cell: ({ row }) => (
          <span className={styles.factors}>
            {FACTOR_ORDER.filter((factor) => row.original.factors[factor]).map(
              (factor) => {
                const active = focus.factor === factor;
                return (
                  <Tooltip key={factor}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(styles.factorBtn, active && styles.factorBtnActive)}
                        aria-pressed={active}
                        aria-label={
                          active
                            ? `Stop focusing ${FACTOR_LABEL[factor]} factor`
                            : `Focus ${FACTOR_LABEL[factor]} factor`
                        }
                        onClick={() => focus.toggleFactor(factor)}
                      >
                        <Pill tone={FACTOR_TONE[factor]}>{FACTOR_LABEL[factor]}</Pill>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      <span className="font-medium">
                        {active
                          ? `Stop focusing ${FACTOR_LABEL[factor].toLowerCase()}`
                          : `Focus ${FACTOR_LABEL[factor].toLowerCase()} factor`}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                );
              },
            )}
          </span>
        ),
      },
    ],
    [focus],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getRowId: (row) => row.studentId,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      pagination: { pageIndex: safePage - 1, pageSize: PAGE_SIZE },
    },
  });

  const tableRows = table.getRowModel().rows;
  const headerGroups = table.getHeaderGroups();

  const focusNarrowed = total === 0 && (focus.factor !== null || focus.section !== null);
  const title = `${level} Risk Students`;

  return (
    <KanbanBoard
      title={title}
      icon={<ShieldCheck size={14} aria-hidden="true" />}
      description={
        <>
          {`${level}-risk learners${focus.section ? ` in ${focus.section}` : ""}${
            focus.factor ? ` flagged for ${focus.factor.toLowerCase()}` : ""
          } — click a factor pill to narrow the list.`}
        </>
      }
      actions={
        <>
          <Pill tone="green" label="Data source">
            Adviser-shared
          </Pill>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} aria-hidden />
            <Input
              className={styles.search}
              placeholder="Search name or LRN…"
              value={query}
              onChange={(event) => applySearch(event.target.value)}
              aria-label="Search at-risk students"
            />
          </div>
        </>
      }
      footer={
        <Pagination
          currentPage={safePage}
          totalItems={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      }
      className={styles.card}
    >
      <div className={`${styles.content} relative`}>
        {isError && !isPending ? (
          <div className={styles.empty} role="alert">
            <p>Couldn&apos;t load the at-risk students.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !isPending && levelRoster.length === 0 ? (
          <PrincipalEmptyState
            icon={ShieldCheck}
            title={`No ${level.toLowerCase()}-risk students`}
            hint={
              level === "Low"
                ? "No low-risk learners in the active term — every adviser-shared learner currently carries an at-risk flag."
                : `No ${level.toLowerCase()}-risk students in the active term. Flagged students will appear here once the risk engine detects them.`
            }
          />
        ) : !isPending && focusNarrowed ? (
          <div className={styles.noMatch}>
            <InsightCallout role="status" className={styles.noMatchCallout}>
              <strong>
                No {level.toLowerCase()}-risk learners match this focus.
              </strong>{" "}
              {focus.factor ? `${focus.factor} factor` : "Factor"} and{" "}
              {focus.section ?? "section"} are both applied — clear one to widen
              the list.
              <button type="button" className={styles.clearFocus} onClick={focus.clear}>
                <SlidersHorizontal size={12} aria-hidden="true" />
                Clear focus
              </button>
            </InsightCallout>
          </div>
        ) : !isPending && filtered.length === 0 ? (
          <div className={styles.noMatch}>
            <InsightCallout role="status" className={styles.noMatchCallout}>
              <strong>No students match “{query.trim()}”.</strong> Try a different
              name or LRN — or clear the search to see the whole list.
            </InsightCallout>
          </div>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className={`${styles.tableWrap} rounded-md border`}>
              <Table className="w-full table-fixed">
                <TableHeader className={styles.thead}>
                  {headerGroups.map((headerGroup) => (
                    <TableRow key={headerGroup.id} className={styles.headRow}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{ width: header.getSize() }}
                          aria-sort={
                            header.column.getIsSorted() === "asc"
                              ? "ascending"
                              : header.column.getIsSorted() === "desc"
                                ? "descending"
                                : undefined
                          }
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {isPending ? (
                    <SkeletonRows />
                  ) : tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className={styles.empty}>
                        No students on this page.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableRows.map((row, index) => (
                      <TableRow
                        key={row.id}
                        className={styles.rowIn}
                        style={{ animationDelay: `${60 + Math.min(index, 11) * 40}ms` }}
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </div>
    </KanbanBoard>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell>
            <div className={styles.studentCell}>
              <span className={styles.skelName} />
              <span className={styles.skelLrn} />
            </div>
          </TableCell>
          <TableCell>
            <span className={styles.skelCell} style={{ width: "50%" }} />
          </TableCell>
          <TableCell>
            <span className={styles.skelCell} style={{ width: "38%" }} />
          </TableCell>
          <TableCell>
            <span className={styles.factors}>
              <span className={styles.skelChip} />
              <span className={styles.skelChip} />
            </span>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
