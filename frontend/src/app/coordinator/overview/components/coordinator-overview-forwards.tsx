"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarPlus,
  History,
  Loader2,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pill, type PillTone } from "@/components/ui/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  admCaseStatusVariant,
  consultReviewerLabel,
  deriveAdmCaseStatus,
  friendlyActionType,
  latestActionFallback,
} from "@/services/coordinator/labels";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import { toSlug } from "@/lib/slug";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import type { HistoryTarget } from "../../components/CaseHistoryDialog";
import { historyTargetFor } from "../../components/CaseHistoryDialog";
import { CoordinatorEmptyState } from "../../components/CoordinatorEmptyCard";
import { isBookableRow } from "../../referrals/components/coordinator-referrals-interpretation";
import { CoordinatorReferralDetailOverlay } from "../../referrals/components/coordinator-referral-detail-overlay";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import styles from "./coordinator-overview-forwards.module.css";

interface CoordinatorOverviewForwardsProps {
  rows: AdmCaseRow[];
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  now: number;
  bookPendingId: string | null;
  onRetry: () => void;
  onHistory: (target: HistoryTarget) => void;
  onBook: (row: AdmCaseRow) => void;
}

// Badge variants from `admCaseStatusVariant` mapped onto the shared pill tones.
const STATUS_TONE: Record<
  ReturnType<typeof admCaseStatusVariant>,
  PillTone
> = {
  amber: "amber",
  success: "green",
  default: "blue",
  destructive: "red",
  secondary: "violet",
  outline: "neutral",
  red: "red",
};

function Num({ children }: { children: React.ReactNode }) {
  return <span className={styles.interpretNum}>{children}</span>;
}

function buildInterpretation(rows: AdmCaseRow[], now: number): React.ReactNode {
  if (rows.length === 0) {
    return "No consultation hand-offs are waiting — intake is clear.";
  }
  const elapsedList = rows
    .map((r) => msSinceDate(r.endorsedAt ?? r.datePrepared, now))
    .filter((v): v is number => v !== null);
  const oldest =
    elapsedList.length > 0 ? formatElapsedShort(Math.max(...elapsedList)) : null;
  const nurse = rows.filter((r) => r.consultReviewer === "nurse").length;
  const guidance = rows.length - nurse;
  const mix =
    nurse > 0 && guidance > 0 ? (
      <>
        {" "}
        (<Num>{nurse}</Num> from the Nurse, <Num>{guidance}</Num> from Guidance)
      </>
    ) : nurse > 0 ? (
      " (all from the Nurse)"
    ) : (
      " (all from Guidance)"
    );
  return (
    <>
      <Num>{rows.length}</Num> pending forward{rows.length === 1 ? "" : "s"}{" "}
      waiting for a learner profile{mix}.
      {oldest ? (
        <>
          {" "}
          Longest waiting <Num>{oldest}</Num> ago.
        </>
      ) : null}
    </>
  );
}

/**
 * Priority queue — the command center's working surface. Case cards flow in
 * the same flat, responsive glass grid as the teacher student-overview
 * sections: header, a divided metric strip, facts, then the actions the desk
 * actually uses (book a meeting, track the case).
 */
export function CoordinatorOverviewForwards({
  rows,
  isPending,
  isError,
  isRefetching,
  now,
  bookPendingId,
  onRetry,
  onHistory,
  onBook,
}: CoordinatorOverviewForwardsProps) {
  const [page, setPage] = React.useState(1);
  const [detailTarget, setDetailTarget] = React.useState<AdmCaseRow | null>(
    null,
  );
  const [view, setView] = usePersistentState<"grid" | "table">(
    "zentra.coordinator.overview.forwards.view.v2",
    "table",
  );
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const isEmpty = !isPending && !isError && rows.length === 0;

  return (
    <section className={styles.queue} aria-label="Priority case queue">
      <header className={styles.queueHead}>
        <div className={styles.queueHeading}>
          <span className={styles.queueIcon} aria-hidden="true">
            <Share2 size={15} />
          </span>
          <div className={styles.queueTitleBlock}>
            <h2 className={styles.queueTitle}>Needs you next</h2>
            <p className={styles.queueSub}>
              Consultation hand-offs from Nurse and Guidance waiting for your
              learner profile.
            </p>
          </div>
        </div>
        <div className={styles.queueActions}>
          <FilterTabs
            label="Switch queue layout"
            variant="tags"
            options={[
              { value: "grid", label: "Grid", tone: "amber" },
              { value: "table", label: "Table", tone: "blue" },
            ]}
            value={view}
            onChange={setView}
          />
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
          >
            <Link href="/coordinator/referrals">See all</Link>
          </Button>
        </div>
      </header>

      {isPending ? (
        <ShimmerGroup>
          {view === "table" ? (
            <div className={styles.tableSkeleton} aria-busy="true" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className={styles.skelRow}>
                  <Skeleton className={styles.skelRowName} />
                  <Skeleton className={styles.skelRowSm} />
                  <Skeleton className={styles.skelRowMd} />
                  <Skeleton className={styles.skelRowSm} />
                  <Skeleton className={styles.skelRowSm} />
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.cardGrid} aria-busy="true" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={styles.skelCard}>
                  <div className={styles.skelCardHead}>
                    <Skeleton className={styles.skelLine} />
                    <Skeleton className={styles.skelAvatar} />
                  </div>
                  <div className={styles.skelMetrics}>
                    <Skeleton className={styles.skelMetric} />
                    <Skeleton className={styles.skelMetric} />
                  </div>
                  <Skeleton className={styles.skelFact} />
                </div>
              ))}
            </div>
          )}
        </ShimmerGroup>
      ) : isError ? (
        <div className={styles.errorBlock} role="alert">
          <p className={styles.errorText}>
            We couldn&apos;t load the latest forwards — your summary above is
            still current.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isRefetching}
            onClick={onRetry}
          >
            {isRefetching ? (
              <Loader2 className={styles.spin} aria-hidden="true" />
            ) : null}
            {isRefetching ? "Loading…" : "Try again"}
          </Button>
        </div>
      ) : isEmpty ? (
        <CoordinatorEmptyState
          icon={History}
          title="No pending forwards"
          hint="New consultation hand-offs will appear here once filed."
        />
      ) : (
        <>
          {view === "table" ? (
            <div className={styles.tableWrap}>
              <Table aria-label="Pending ADM forwards">
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Waiting</TableHead>
                    <TableHead>Latest</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r, index) => {
                    const elapsed = msSinceDate(r.endorsedAt ?? r.datePrepared, now);
                    const caseStatus = deriveAdmCaseStatus(
                      r.stage,
                      r.eligibilityStatus,
                      r.approvedBy,
                      r.referralStatus,
                    );
                    const reviewer = consultReviewerLabel(r.consultReviewer);
                    const bookingThis = bookPendingId === r.id;
                    const bookable = isBookableRow(r);
                    const closedRow =
                      r.referralStatus === "dismissed" ||
                      r.referralStatus === "resolved";
                    const detailsHref = `/coordinator/referrals/${encodeURIComponent(r.id)}`;
                    const lastAction = r.lastActionType
                      ? {
                          label: friendlyActionType(r.lastActionType),
                          at: r.lastActionAt,
                        }
                      : latestActionFallback(r);
                    const lastMs =
                      lastAction?.at != null ? msSinceDate(lastAction.at, now) : null;
                    const gradeValue = r.grade?.replace(/^Grade\s+/i, "") ?? "—";
                    const openDetails = () => router.push(detailsHref);

                    return (
                      <TableRow
                        key={r.id}
                        className={styles.row}
                        style={{ animationDelay: `${40 + Math.min(index, 11) * 30}ms` }}
                        tabIndex={0}
                        aria-label={`Open record for ${r.student}`}
                        onClick={() => setDetailTarget(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetailTarget(r);
                          }
                        }}
                      >
                        <TableCell>
                          <div className={styles.learnerCell}>
                            <StudentMascot name={r.student} seed={r.lrn} size={28} />
                            <span className={styles.learnerMeta}>
                              <span className={styles.learnerName} title={r.student}>
                                {r.student}
                              </span>
                              <span className={styles.learnerLrn}>{r.lrn}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Pill tone="blue" field="grade">
                            {gradeValue}
                          </Pill>
                        </TableCell>
                        <TableCell>
                          <Pill
                            tone={STATUS_TONE[admCaseStatusVariant(caseStatus.key)]}
                            label="Status"
                          >
                            {caseStatus.label}
                          </Pill>
                        </TableCell>
                        <TableCell className={styles.cellText}>{reviewer}</TableCell>
                        <TableCell className="tabular-nums">
                          {elapsed === null ? "—" : formatElapsedShort(elapsed)}
                        </TableCell>
                        <TableCell>
                          <span className={styles.updateCell}>
                            <span className={styles.updateLabel}>
                              {lastAction?.label ?? "No activity"}
                            </span>
                            {lastMs !== null ? (
                              <span className={styles.updateAt}>
                                {formatElapsedShort(lastMs)} ago
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className={styles.actionsCell}>
                          <div
                            className={styles.actions}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {r.meeting == null ? (
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={bookingThis || !bookable}
                                title={
                                  bookable
                                    ? "Book a parent meeting for this case"
                                    : closedRow
                                      ? "This referral was cancelled/resolved — meetings can no longer be booked"
                                      : "Meetings can only be booked before certification"
                                }
                                onClick={() => onBook(r)}
                              >
                                {bookingThis ? (
                                  <Loader2 className={styles.spin} aria-hidden="true" />
                                ) : (
                                  <CalendarPlus className="size-3.5" aria-hidden="true" />
                                )}
                                {bookingThis ? "Booking…" : "Book"}
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={openDetails}
                            >
                              Open
                              <ArrowUpRight className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={styles.trackBtn}
                              aria-label={`Track case for ${r.student}`}
                              title="Track case"
                              onClick={() => onHistory(historyTargetFor(r))}
                            >
                              <History aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
          <ul className={styles.cardGrid} aria-label="Pending ADM forwards">
            {pageRows.map((r) => {
              const elapsed = msSinceDate(r.endorsedAt ?? r.datePrepared, now);
              const caseStatus = deriveAdmCaseStatus(
                r.stage,
                r.eligibilityStatus,
                r.approvedBy,
                r.referralStatus,
              );
              const reviewer = consultReviewerLabel(r.consultReviewer);
              const bookingThis = bookPendingId === r.id;
              const bookable = isBookableRow(r);
              const closedRow =
                r.referralStatus === "dismissed" ||
                r.referralStatus === "resolved";
              // Exact case id, not the name slug — duplicate learner-name cases
              // must not land on a sibling case file.
              const detailsHref = `/coordinator/referrals/${encodeURIComponent(r.id)}`;
              const lastAction = r.lastActionType
                ? {
                    label: friendlyActionType(r.lastActionType),
                    at: r.lastActionAt,
                  }
                : latestActionFallback(r);
              const lastMs =
                lastAction?.at != null ? msSinceDate(lastAction.at, now) : null;
              const gradeValue = r.grade?.replace(/^Grade\s+/i, "") ?? "—";

              const openDetails = () => router.push(detailsHref);

              return (
                <li key={r.id} className={styles.cardItem}>
                  <GlassCard className={styles.glassWrap}>
                    <div
                      className={styles.card}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open details for ${r.student}`}
                      onClick={openDetails}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetails();
                        }
                      }}
                    >
                      <div className={styles.cardHead}>
                        <div className={styles.cardHeading}>
                          <span className={styles.cardName} title={r.student}>
                            {r.student}
                          </span>
                          <span className={styles.cardMetaRow}>
                            <Pill
                              tone={
                                STATUS_TONE[admCaseStatusVariant(caseStatus.key)]
                              }
                              className="shrink-0 rounded-md"
                              label="Status"
                            >
                              {caseStatus.label}
                            </Pill>
                          </span>
                        </div>
                        <span className={styles.cardAvatar} aria-hidden="true">
                          <StudentMascot name={r.student} seed={r.lrn} size={26} />
                        </span>
                      </div>

                      <div className={styles.cardMetrics}>
                        <span className={styles.cardMetric}>
                          <span className={styles.cardMetricLabel}>Waiting</span>
                          <span className={`${styles.cardMetricValue} tabular-nums`}>
                            {elapsed === null ? "—" : formatElapsedShort(elapsed)}
                          </span>
                          <span className={styles.cardMetricHint}>
                            since endorsement
                          </span>
                        </span>
                        <span className={styles.cardMetric}>
                          <span className={styles.cardMetricLabel}>Grade</span>
                          <span className={`${styles.cardMetricValue} tabular-nums`}>
                            {gradeValue}
                          </span>
                          <span className={styles.cardMetricHint}>
                            learner level
                          </span>
                        </span>
                      </div>

                      <div className={styles.cardFacts}>
                        <span className={styles.cardFact}>
                          <span className={styles.cardFactLabel}>From</span>
                          <span className={styles.cardFactValue} title={reviewer}>
                            {reviewer}
                          </span>
                        </span>
                        <span className={styles.cardFact}>
                          <span className={styles.cardFactLabel}>Latest</span>
                          <span
                            className={styles.cardFactValue}
                            title={lastAction?.label}
                          >
                            {lastAction?.label ?? "No activity"}
                            {lastMs !== null ? (
                              <span className={styles.cardFactAt}>
                                {" · "}
                                {formatElapsedShort(lastMs)} ago
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </div>

                      <div
                        className={styles.cardActions}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <span className={styles.cardLrnPill}>
                          <Pill field="lrn" className="rounded-md">
                            {r.lrn}
                          </Pill>
                        </span>
                        <span className={styles.endActions}>
                          {r.meeting == null ? (
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={bookingThis || !bookable}
                              title={
                                bookable
                                  ? "Book a parent meeting for this case"
                                  : closedRow
                                    ? "This referral was cancelled/resolved — meetings can no longer be booked"
                                    : "Meetings can only be booked before certification"
                              }
                              onClick={() => onBook(r)}
                            >
                              {bookingThis ? (
                                <Loader2
                                  className={styles.spin}
                                  aria-hidden="true"
                                />
                              ) : (
                                <CalendarPlus
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              {bookingThis ? "Booking…" : "Book"}
                            </Button>
                          ) : null}
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={styles.cardMenuBtn}
                                  aria-label={`Track case for ${r.student}`}
                                  onClick={() => onHistory(historyTargetFor(r))}
                                >
                                  <History aria-hidden />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" sideOffset={6}>
                                Track case
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={openDetails}
                          >
                            Open
                            <ArrowRight className="size-3.5" aria-hidden />
                          </Button>
                        </span>
                      </div>
                    </div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
          )}

          {rows.length > PAGE_SIZE ? (
            <Pagination
              currentPage={safePage}
              totalItems={rows.length}
              onPageChange={setPage}
            />
          ) : null}

          <div className={styles.footerSlot}>
            <InsightCallout className={styles.interpretation}>
              <span className={styles.interpretationLabel}>
                What it means ·{" "}
              </span>
              {buildInterpretation(rows, now)}
            </InsightCallout>
          </div>
        </>
      )}

      <CoordinatorReferralDetailOverlay
        row={detailTarget}
        now={now}
        bookPendingId={bookPendingId}
        onClose={() => setDetailTarget(null)}
        onHistory={(target) => {
          setDetailTarget(null);
          onHistory(target);
        }}
        onBook={(row) => {
          setDetailTarget(null);
          onBook(row);
        }}
      />
    </section>
  );
}
