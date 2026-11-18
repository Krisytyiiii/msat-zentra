"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarPlus,
  Clock,
  History,
  Loader2,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import type { HistoryTarget } from "../../components/CaseHistoryDialog";
import { historyTargetFor } from "../../components/CaseHistoryDialog";
import { CoordinatorEmptyState } from "../../components/CoordinatorEmptyCard";
import { isBookableRow } from "../../referrals/components/coordinator-referrals-interpretation";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import styles from "./coordinator-overview-forwards.module.css";

interface CoordinatorOverviewForwardsProps {
  rows: AdmCaseRow[];
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  now: number;
  bookPendingId: string | null;
  /** Total waiting count from the dashboard, when known. */
  pendingTotal?: number | null;
  onRetry: () => void;
  onHistory: (target: HistoryTarget) => void;
  onBook: (row: AdmCaseRow) => void;
}

// Forwarding-desk mascots — the reviewer that handed the case off wears a
// fixed sprite so the queue reads at a glance (nurse → the nurse sprite,
// guidance → owl, LRPC → scout); anything else falls back to the generic
// postbot. The adviser keeps a deterministic sprite seeded off their name.
const REVIEWER_MASCOT: Record<string, string> = {
  nurse: "nurse",
  guidance_counselor: "owl",
  lrpc: "scout",
};

function reviewerMascot(value: string | null | undefined): string {
  return value ? REVIEWER_MASCOT[value] ?? "postbot" : "postbot";
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
 * Priority queue — the command center's working surface. One surface, one
 * vertical list (never a card grid): each row shows the learner, where the
 * case came from, its status, and the two actions the desk actually uses
 * (book a meeting, track the case).
 */
export function CoordinatorOverviewForwards({
  rows,
  isPending,
  isError,
  isRefetching,
  now,
  bookPendingId,
  pendingTotal,
  onRetry,
  onHistory,
  onBook,
}: CoordinatorOverviewForwardsProps) {
  const [page, setPage] = React.useState(1);
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const isEmpty = !isPending && !isError && rows.length === 0;
  const waiting = pendingTotal ?? rows.length;

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
          <span className={styles.queueCount}>
            <strong>{waiting}</strong> waiting
          </span>
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
        <div className={styles.list} aria-busy="true" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.skelRow}>
              <Skeleton className={styles.skelAvatar} />
              <div className={styles.skelLines}>
                <Skeleton className={styles.skelLine} />
                <Skeleton className={styles.skelLineSm} />
              </div>
              <Skeleton className={styles.skelPill} />
            </div>
          ))}
        </div>
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
          <ul className={styles.list} aria-label="Pending ADM forwards">
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
              const detailsHref = `/coordinator/referrals/${encodeURIComponent(toSlug(r.student))}`;
              const lastAction = r.lastActionType
                ? {
                    label: friendlyActionType(r.lastActionType),
                    at: r.lastActionAt,
                  }
                : latestActionFallback(r);
              const lastMs =
                lastAction?.at != null ? msSinceDate(lastAction.at, now) : null;

              return (
                <li key={r.id} className={styles.item}>
                  <div
                    className={styles.row}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open details for ${r.student}`}
                    onClick={() => router.push(detailsHref)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(detailsHref);
                      }
                    }}
                  >
                    <span className={styles.avatar} aria-hidden="true">
                      <StudentMascot name={r.student} seed={r.lrn} size={38} />
                    </span>

                    <div className={styles.identity}>
                      <span className={styles.nameRow}>
                        <span className={styles.name} title={r.student}>
                          {r.student}
                        </span>
                        <Pill
                          tone={STATUS_TONE[admCaseStatusVariant(caseStatus.key)]}
                          className="shrink-0 rounded-md"
                          label="Status"
                        >
                          {caseStatus.label}
                        </Pill>
                      </span>
                      <span className={styles.lrn}>LRN {r.lrn}</span>
                    </div>

                    <div className={styles.route}>
                      <span className={styles.chain}>
                        <span className={styles.chainMascot} aria-hidden="true">
                          <StudentMascot name={r.preparedBy} size={20} />
                        </span>
                        <span className={styles.chainName} title={r.preparedBy}>
                          {r.preparedBy}
                        </span>
                        <ArrowRight
                          size={12}
                          className={styles.chainArrow}
                          aria-label="forwarded to"
                        />
                        <span className={styles.chainMascot} aria-hidden="true">
                          <StudentMascot
                            name={reviewer}
                            character={reviewerMascot(r.consultReviewer)}
                            size={20}
                          />
                        </span>
                        <span className={styles.chainName}>{reviewer}</span>
                      </span>
                      <span className={styles.latest}>
                        {lastAction ? (
                          <>
                            <span className={styles.latestLabel}>Latest</span>
                            <span className={styles.latestValue}>
                              {lastAction.label}
                            </span>
                            <span className={styles.latestAt}>
                              {lastMs === null
                                ? "—"
                                : `${formatElapsedShort(lastMs)} ago`}
                            </span>
                          </>
                        ) : (
                          <span className={styles.latestAt}>No activity yet</span>
                        )}
                      </span>
                    </div>

                    <div
                      className={styles.end}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <span className={styles.elapsed}>
                        <Clock size={11} aria-hidden="true" />
                        {elapsed === null
                          ? "—"
                          : `${formatElapsedShort(elapsed)} ago`}
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
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

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
    </section>
  );
}
