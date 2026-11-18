"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  Copy,
  FileSearch,
  Loader2,
  Megaphone,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Input } from "@/components/ui/input";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { useAdviserAccessCheck } from "@/components/shared/adviser-access/adviser-access-check-context";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { AdviserAccessTableSkeleton } from "./AccessWorkbenchSkeleton";
import {
  formatRelativeTime,
  toBoardStudents,
  type AdviserAccessRequest,
  type BoardStudent,
  type BoardStudentState,
} from "@/components/shared/adviser-access/adviser-access-types";
import type { AdviserAccessDesk } from "@/components/shared/adviser-access/adviser-access-check-context";
import styles from "./adviser-access.module.css";

export type StatusFilter = "all" | BoardStudentState;

const STATE: Record<
  BoardStudent["state"],
  { label: string; tone: PillTone; icon: React.ReactNode }
> = {
  pendingChecking: {
    label: "Unchecked",
    tone: "neutral",
    icon: <CircleDashed size={11} aria-hidden />,
  },
  awaiting: {
    label: "Awaiting decision",
    tone: "blue",
    icon: <Clock size={11} aria-hidden />,
  },
  approved: {
    label: "Approved",
    tone: "green",
    icon: <CheckCircle2 size={11} aria-hidden />,
  },
  reported: {
    label: "Reported",
    tone: "red",
    icon: <Megaphone size={11} aria-hidden />,
  },
};


const BTN = "h-6 shrink-0 px-2 text-[12px] font-medium";
const PRIMARY_BTN = `${BTN} border border-transparent bg-primary text-primary-foreground hover:bg-primary/80`;
const GREEN_BTN = `${BTN} border border-transparent bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/30 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700`;
const RED_BTN = `${BTN} bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700`;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pendingChecking", label: "Unchecked" },
  { key: "awaiting", label: "Awaiting" },
  { key: "approved", label: "Approved" },
  { key: "reported", label: "Reported" },
];

/**
 * Registry adviser-access workbench: one flat, filterable learner table
 * across every pending request, with request scoping, status tabs, search,
 * sorting, bulk actions and expandable rows. Per-student actions come from the
 * shared adviser-access check context (same API surface as the shared table).
 * Only the desk differs between the G7–10 and G11–12 desks.
 */
export function AccessWorkbench({
  desk,
  requests,
  statusFilter,
  onStatusFilterChange,
  isFetching = false,
}: {
  desk: AdviserAccessDesk;
  requests: AdviserAccessRequest[];
  statusFilter: StatusFilter;
  onStatusFilterChange: (next: StatusFilter) => void;
  /** True while the desk's requests query is refetching in the background. */
  isFetching?: boolean;
}) {
  const {
    acting,
    checkingId,
    approvingLrns,
    reportingLrns,
    bulkApproving,
    bulkReporting,
    checkAll,
    approveAllAwaiting,
    reportAllAwaiting,
    approveLrn,
    reportMissing,
    isRowBusy,
  } = useAdviserAccessCheck();

  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const searchRef = React.useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere on the page.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const requestById = React.useMemo(
    () => new Map(requests.map((r) => [r.id, r])),
    [requests],
  );

  const allStudents = React.useMemo(() => toBoardStudents(requests), [requests]);

  // The workbench always lists every pending request's learners — clicking a
  // request card opens an overlay instead of scoping this table.
  const scoped = allStudents;

  const counts = React.useMemo(() => {
    const base: Record<StatusFilter, number> = {
      all: scoped.length,
      pendingChecking: 0,
      awaiting: 0,
      approved: 0,
      reported: 0,
    };
    for (const s of scoped) base[s.state] += 1;
    return base;
  }, [scoped]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = scoped.filter((s) => {
      if (statusFilter !== "all" && s.state !== statusFilter) return false;
      if (!q) return true;
      return `${s.name} ${s.lrn} ${s.gradeLevel} ${s.section} ${s.adviserName}`
        .toLowerCase()
        .includes(q);
    });
    return rows.sort(
      (a, b) => a.name.localeCompare(b.name) || a.lrn.localeCompare(b.lrn),
    );
  }, [scoped, statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = React.useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  // Page switches slice rows already in hand, so they paint instantly. Only a
  // switch that lands while the desk query is genuinely refetching waits on
  // data — then the rows are replaced by the table's loading mirror until the
  // fetch settles.
  const [awaitingPage, setAwaitingPage] = React.useState<number | null>(null);
  const goToPage = (next: number) => {
    if (isFetching) setAwaitingPage(next);
    setPage(next);
  };
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear once the refetch settles
    if (!isFetching && awaitingPage !== null) setAwaitingPage(null);
  }, [isFetching, awaitingPage]);
  const pageSkeleton = awaitingPage !== null && isFetching;

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp after filtering changes the page count
    setPage(1);
  }, [statusFilter, query]);

  const checking = checkingId !== null;
  const searching = query.trim().length > 0;

  const pendingRequestIds = React.useMemo(
    () => [...new Set(scoped.filter((s) => s.state === "pendingChecking").map((s) => s.requestId))],
    [scoped],
  );
  const awaitingMatchedIds = React.useMemo(
    () => [...new Set(scoped.filter((s) => s.state === "awaiting" && s.hasRecord).map((s) => s.requestId))],
    [scoped],
  );
  const awaitingMissing = React.useMemo(
    () =>
      scoped
        .filter((s) => s.state === "awaiting" && !s.hasRecord)
        .map((s) => ({ requestId: s.requestId, lrn: s.lrn })),
    [scoped],
  );

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyLrn = (lrn: string) => {
    void navigator.clipboard
      ?.writeText(lrn)
      .then(() => toast.success({ title: "LRN copied", description: lrn }))
      .catch(() => toast.error({ title: "Could not copy LRN" }));
  };

  return (
    <section className={styles.board} aria-label="Adviser access requests">
      <div className={styles.boardHead}>
        <div className={styles.boardTitleRow}>
          <span className={styles.boardTitle}>
            <FileSearch size={14} className={styles.boardTitleIcon} aria-hidden />
            Requests workbench
            <span className={styles.boardCount}>{counts.all}</span>
          </span>
          <div className={styles.bulkActions}>
            {pendingRequestIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className={PRIMARY_BTN}
                disabled={checking || acting}
                onClick={() => checkAll(desk, pendingRequestIds)}
                title="Run the SF10 check for every unchecked request"
              >
                {checking ? (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                ) : (
                  <FileSearch size={12} aria-hidden />
                )}
                {checking ? "Checking…" : `Check ${pendingRequestIds.length} request${pendingRequestIds.length === 1 ? "" : "s"}`}
              </Button>
            ) : null}
            {awaitingMatchedIds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className={GREEN_BTN}
                disabled={acting || checking}
                onClick={() => approveAllAwaiting(desk, awaitingMatchedIds)}
                title="Grant every student with a filed SF10 record"
              >
                {bulkApproving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                Approve all matched
              </Button>
            ) : null}
            {awaitingMissing.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className={RED_BTN}
                disabled={acting || checking}
                onClick={() => reportAllAwaiting(desk, awaitingMissing)}
                title="Report every student with no filed SF10 record"
              >
                {bulkReporting ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                Report all missing
              </Button>
            ) : null}
          </div>
        </div>

        <div className={styles.toolbar}>
          <FilterTabs
            label="Filter by decision status"
            options={STATUS_TABS.map((tab) => ({
              value: tab.key,
              label: tab.label,
              count: counts[tab.key],
            }))}
            value={statusFilter}
            onChange={onStatusFilterChange}
          />

          <div className={styles.toolbarRight}>
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} aria-hidden />
              <Input
                ref={searchRef}
                className={styles.search}
                placeholder="Search name, LRN, section, or adviser…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search adviser access requests"
              />
              {searching ? (
                <button
                  type="button"
                  className={styles.clearSearch}
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <X size={12} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex w-full justify-center py-6">
          <InsightCallout role="status">
            {searching
              ? `No learners match “${query.trim()}”.`
              : statusFilter !== "all"
                ? "No learners in this status."
                : "No adviser access requests awaiting your decision."}
          </InsightCallout>
        </div>
      ) : pageSkeleton ? (
        <AdviserAccessTableSkeleton rows={PAGE_SIZE} />
      ) : (
        <div className={styles.tableWrap}>
          <Table aria-label="Adviser access requests" className={styles.table}>
            <TableHeader className={styles.thead}>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>LRN</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Adviser</TableHead>
                <TableHead>SF10 record</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((s) => {
                const key = `${s.requestId}:${s.lrn}`;
                const state = STATE[s.state];
                const rowBusy = isRowBusy(s.lrn);
                const approving = approvingLrns.includes(s.lrn);
                const reporting = reportingLrns.includes(s.lrn);
                const req = requestById.get(s.requestId);
                const isOpen = expanded.has(key);
                return (
                  <React.Fragment key={key}>
                    <TableRow
                      className={`${styles.row} ${isOpen ? styles.rowOpen : ""}`}
                      data-state={s.state}
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggleExpanded(key)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpanded(key);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <button
                            type="button"
                            className={styles.expandBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(key);
                            }}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} request details for ${s.name}`}
                          >
                            <ChevronDown
                              size={13}
                              className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
                              aria-hidden
                            />
                          </button>
                          <StudentMascot
                            name={s.name}
                            seed={s.lrn}
                            character={s.mascot ?? undefined}
                            size={30}
                          />
                          <span className={styles.learnerName} title={s.name}>
                            {s.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={styles.lrnCell}>
                          <Pill tone="amber" label="LRN">
                            {s.lrn}
                          </Pill>
                          <button
                            type="button"
                            className={styles.copyBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyLrn(s.lrn);
                            }}
                            aria-label={`Copy LRN ${s.lrn}`}
                            title="Copy LRN"
                          >
                            <Copy size={11} aria-hidden />
                          </button>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Pill tone="neutral" label="Grade level">
                          {s.gradeLevel}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        <Pill tone="neutral" label="Section">
                          {s.section || "—"}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        <span className={styles.adviserName} title={s.adviserName}>
                          {s.adviserName}
                        </span>
                      </TableCell>
                      <TableCell>
                        {s.checkedAt ? (
                          <Pill tone={s.hasRecord ? "green" : "red"} label="SF10 record">
                            {s.hasRecord ? "Attached" : "Missing"}
                          </Pill>
                        ) : (
                          <Pill tone="neutral" label="SF10 record">
                            Not checked
                          </Pill>
                        )}
                      </TableCell>
                      <TableCell>
                        <Pill tone={state.tone} label="Decision status">
                          {state.icon}
                          {state.label}
                        </Pill>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {s.state === "pendingChecking" ? (
                          <Button
                            type="button"
                            size="sm"
                            className={PRIMARY_BTN}
                            disabled={checking || acting}
                            onClick={() => checkAll(desk, [s.requestId])}
                            title="Run the SF10 check for this request"
                          >
                            {checkingId === s.requestId ? (
                              <Loader2 size={12} className="animate-spin" aria-hidden />
                            ) : (
                              <FileSearch size={12} aria-hidden />
                            )}
                            {checkingId === s.requestId ? "Checking…" : "Check"}
                          </Button>
                        ) : s.state === "awaiting" ? (
                          s.hasRecord ? (
                            <Button
                              type="button"
                              size="sm"
                              className={GREEN_BTN}
                              disabled={rowBusy}
                              onClick={() => approveLrn(s.requestId, desk, s.lrn)}
                              aria-label={`Approve access for ${s.name}`}
                            >
                              {approving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                              {approving ? "Approving…" : "Approve"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className={RED_BTN}
                              disabled={rowBusy}
                              onClick={() => reportMissing(s.requestId, desk, s.lrn)}
                              aria-label={`Report ${s.name} as missing`}
                            >
                              {reporting ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                              {reporting ? "Reporting…" : "Report"}
                            </Button>
                          )
                        ) : (
                          <span className={styles.doneNote}>
                            {s.state === "approved" ? "Granted" : "Reported"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow className={styles.detailRow}>
                        <TableCell colSpan={8}>
                          <div className={styles.detailPanel}>
                            <div className={styles.detailGrid}>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Request</span>
                                <span className={styles.detailValue}>
                                  {req?.reason || "—"}
                                </span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Requested</span>
                                <span className={styles.detailValue}>
                                  {formatRelativeTime(s.requestedAt)}
                                  {req?.requestedAt
                                    ? ` (${new Date(req.requestedAt).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })})`
                                    : ""}
                                </span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>SF10 check</span>
                                <span className={styles.detailValue}>
                                  {s.checkedAt
                                    ? `Checked ${formatRelativeTime(s.checkedAt)}`
                                    : "Not run yet"}
                                </span>
                              </div>
                              <div className={styles.detailItem}>
                                <span className={styles.detailLabel}>Learner scope</span>
                                <span className={styles.detailValue}>
                                  {(req?.requestedLrns?.length ?? 0) > 0
                                    ? `${req?.requestedLrns?.length} LRNs selected by the adviser`
                                    : `Whole section, ${req?.affectedAdvisees.length ?? 0} advisees`}
                                </span>
                              </div>
                            </div>
                            {req ? (
                              <div className={styles.detailMeta}>
                                <Pill tone="neutral" label="Grade level">
                                  {req.gradeLevel}
                                </Pill>
                                <Pill tone="neutral" label="Section">
                                  {req.section}
                                </Pill>
                                <Pill tone="amber" label="Employee ID">
                                  {req.employeeId}
                                </Pill>
                                <span className={styles.detailHint}>
                                  {req.summary
                                    ? `${req.summary.has} attached, ${req.summary.missing} missing of ${req.summary.total}`
                                    : "Run the check to unlock approve per student."}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className={styles.boardFoot}>
          <span className={styles.resultLine}>
            Showing {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            {searching || statusFilter !== "all" ? " filtered" : ""} learners
          </span>
          <Pagination
            currentPage={safePage}
            totalItems={filtered.length}
            onPageChange={goToPage}
          />
        </div>
      ) : null}
    </section>
  );
}
