"use client";
import * as React from "react";
import {
  Building2,
  FilePlus2,
  Loader2,
  MessageSquareText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pagination, PAGE_SIZE, shouldShowPagination } from "@/components/shared/pagination";
import refStyles from "./referrals.module.css";
import { formatSurnameFirst } from "@/lib/names";
import { typeForDesk } from "./referral-types";
import {
  isWithdrawnDismissal,
  type ReferralRow,
  type ReferralStatusFilter,
} from "./use-my-referrals";
import { StudentMascot } from "./StudentMascot";
import { ReferralEmptyKanban } from "./ReferralEmptyKanban";
import { ReferralPageActions } from "./ReferralPageActions";
import { ReferralsSkeleton } from "./ReferralsSkeleton";

type StatusMeta = { variant: "amber" | "blue" | "green" | "red" | "outline"; label: string };

/* Status tones are carried by the shared Pill, same palette the desk boards
   use; the tooltip (label) names the field. */
const STATUS_TONE: Record<StatusMeta["variant"], "amber" | "blue" | "green" | "red" | "neutral"> = {
  amber: "amber",
  blue: "blue",
  green: "green",
  red: "red",
  outline: "neutral",
};

// Escalated is not a teacher-side state: desks own escalation, so it stays
// out of the maps below. The helpers fall back to a red pill so a stray
// escalated row still renders instead of crashing the lookup.
const KNOWN_BADGE: Record<Exclude<ReferralRow["status"], "escalated">, StatusMeta> = {
  pending: { variant: "amber", label: "Pending" },
  in_progress: { variant: "blue", label: "In progress" },
  info_requested: { variant: "blue", label: "Info requested" },
  follow_up: { variant: "amber", label: "Follow up" },
  resolved: { variant: "green", label: "Resolved" },
  dismissed: { variant: "red", label: "Cancelled" },
};

export function statusBadge(status: ReferralRow["status"], dismissedByRole?: string | null): StatusMeta {
  if (status === "dismissed" && !isWithdrawnDismissal(dismissedByRole)) {
    return { variant: "red", label: "Rejected" };
  }
  return (
    KNOWN_BADGE[status as Exclude<ReferralRow["status"], "escalated">] ?? {
      variant: "red",
      label: humanize(status),
    }
  );
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isCancellable(status: ReferralRow["status"]): boolean {
  return status !== "resolved" && status !== "dismissed";
}

/**
 * Closing state of a cancelled/rejected referral: the standard timeline
 * message plus the note the desk (or the filing teacher, on a withdrawal)
 * left when it closed the case. The original referral reason is deliberately
 * not reused here.
 */
export function dismissalMeta(
  r: ReferralRow,
): { note: string; label: string } | null {
  if (r.status !== "dismissed") return null;
  const step = [...(r.timeline ?? [])]
    .reverse()
    .find((entry) => entry.action === "referral_dismissed");
  const withdrawn = isWithdrawnDismissal(r.dismissedByRole);
  return {
    note: step?.detail?.trim() ?? "",
    label:
      step?.label ??
      (withdrawn
        ? "The referral was cancelled by the filing teacher."
        : "The referral was rejected and the case is closed."),
  };
}

const REVIEWER_LABELS: Record<string, string> = {
  nurse: "School Nurse",
  guidance_counselor: "Guidance Counselor",
  lrpc: "LRPC",
};

/** ADM stages where the case still sits with the consultation reviewer. */
const EARLY_ADM_STAGES = new Set(["anecdotal", "consultation"]);

/** Desk holding the case right now — same rule the referral cards used. */
function deskHolding(r: ReferralRow): string {
  const withReviewer =
    r.targetRole === "adm_coordinator" &&
    !!r.consultReviewer &&
    EARLY_ADM_STAGES.has(r.admStage ?? "consultation");
  return withReviewer && r.consultReviewer
    ? (REVIEWER_LABELS[r.consultReviewer] ?? humanize(r.consultReviewer))
    : humanize(r.targetRole);
}

function formatReferredDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Quiet relative stamp under the absolute date (“3d ago”). */
function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 0) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

const STATUS_TAB_OPTIONS: ReadonlyArray<{
  value: ReferralStatusFilter;
  label: string;
  tone: "amber" | "blue" | "green" | "neutral";
}> = [
  { value: "all", label: "All", tone: "amber" },
  { value: "open", label: "Open", tone: "blue" },
  { value: "resolved", label: "Resolved", tone: "green" },
  { value: "closed", label: "Closed", tone: "neutral" },
];

const STATUS_LANE_LABEL: Record<ReferralStatusFilter, string> = {
  all: "All referrals",
  open: "Open referrals",
  resolved: "Resolved referrals",
  closed: "Closed referrals",
};

/** Short pill text + full tooltip text for a booked session slot. */
function formatSessionSlot(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { short: iso.slice(0, 10), full: iso };
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return {
    short: `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`,
    full: `${d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })} at ${time}`,
  };
}

/** Text for the booked-session pill on an ADM case. */
function bookedSessionPill(session: NonNullable<ReferralRow["bookedSession"]>) {
  const slot = formatSessionSlot(session.scheduledAt);
  const kind = humanize(session.sessionType);
  return {
    text: `Session ${slot.short}`,
    tooltip: `Session booked · ${slot.full}${kind ? ` · ${kind}` : ""}${
      session.venue?.trim() ? ` · ${session.venue.trim()}` : ""
    }`,
  };
}

/** One glass case card — the casebook reads as a card wall now, not a table. */
function ReferralCard({
  referral: r,
  highlighted,
  selected,
  onTrack,
  onRequestCancel,
  onReason,
}: {
  referral: ReferralRow;
  highlighted: boolean;
  selected: boolean;
  onTrack: (row: ReferralRow) => void;
  onRequestCancel: (row: ReferralRow) => void;
  onReason: (row: ReferralRow) => void;
}) {
  const type = typeForDesk(r.targetRole);
  const meta = statusBadge(r.status, r.dismissedByRole);
  const cancelled = r.status === "dismissed";
  const cancellable = isCancellable(r.status);
  const session = cancelled ? null : r.bookedSession;

  return (
    <li
      id={`teacher-referral-${r.id}`}
      data-highlighted={highlighted || undefined}
      className={refStyles.cardCell}
    >
      {/* No tilt on casebook cards: a rotated card reads as a different width
          beside its neighbours, and the row must stay visually uniform. */}
      <GlassCard className="h-full w-full" intensity={4} disabled>
        <article
          className={`${refStyles.card} ${highlighted ? refStyles.cardHighlighted : ""} ${
            selected ? refStyles.cardSelected : ""
          }`}
          onClick={() => onTrack(r)}
          data-selected={selected || undefined}
        >
          <header className={refStyles.cardHead}>
            <StudentMascot
              name={r.studentName}
              seed={r.lrn}
              character={r.mascot ?? undefined}
              size={36}
            />
            <div className="min-w-0 flex-1">
              <p className={refStyles.cardName} title={r.studentName}>
                {formatSurnameFirst(r.studentName)}
              </p>
              <Pill className="h-6 leading-none tabular-nums" label="LRN">
                {r.lrn}
              </Pill>
            </div>
            <Pill
              className="h-6 shrink-0 leading-none"
              tone={STATUS_TONE[meta.variant]}
              label="Referral status"
            >
              {meta.label}
            </Pill>
          </header>

          <div className={refStyles.cardTags}>
            <Pill tone={type.key === "adm" ? "amber" : "blue"} label="Referral type">
              {type.label}
            </Pill>
            {session ? (
              <Pill
                tone="teal"
                label={bookedSessionPill(session).tooltip}
                className="max-w-full overflow-hidden"
              >
                <span className="truncate">{bookedSessionPill(session).text}</span>
              </Pill>
            ) : null}
          </div>

          <dl className={refStyles.cardFacts}>
            <div>
              <dt>Handled by</dt>
              <dd>
                <Building2 size={12} className="shrink-0 opacity-70" aria-hidden />
                <span className="truncate">{deskHolding(r)}</span>
              </dd>
            </div>
            <div>
              <dt>Referred</dt>
              <dd>
                <span>{formatReferredDate(r.referredAt)}</span>
                <span className="text-muted-foreground" aria-hidden>·</span>
                <span className="text-muted-foreground">{relativeDay(r.referredAt)}</span>
              </dd>
            </div>
          </dl>

          <footer
            className={refStyles.cardFoot}
            onClick={(event) => event.stopPropagation()}
          >
            {cancelled ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="gap-1 px-2 text-[12px]"
                title="A cancelled referral stays closed — file a new anecdotal record to start a fresh referral"
                aria-label={`File a new anecdotal record to refer ${r.studentName} again`}
                onClick={() =>
                  window.open(
                    "/teacher/chat?standalone=1&new=anecdotal",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <FilePlus2 size={12} aria-hidden />
                New record
              </Button>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="gap-1 px-2 text-[12px] text-red-600 hover:text-red-600 dark:text-red-400"
                disabled={!cancellable}
                onClick={() => onRequestCancel(r)}
              >
                <X size={12} aria-hidden />
                {cancellable ? "Cancel" : "Closed"}
              </Button>
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              onClick={() => onReason(r)}
              aria-label={
                cancelled
                  ? `Show why the referral for ${r.studentName} was ${
                      isWithdrawnDismissal(r.dismissedByRole) ? "cancelled" : "rejected"
                    }`
                  : `Show the reason ${r.studentName} was referred`
              }
              title={
                cancelled
                  ? isWithdrawnDismissal(r.dismissedByRole)
                    ? "Reason for cancellation"
                    : "Reason for rejection"
                  : "Reason for referral"
              }
            >
              <MessageSquareText size={13} aria-hidden />
            </Button>
          </footer>
        </article>
      </GlassCard>
    </li>
  );
}

export function ReferralsTable({
  referrals,
  counts,
  status,
  onStatusChange,
  query,
  onQueryChange,
  appliedQuery,
  highlightId,
  selectedId,
  referralsQuery,
  page,
  totalItems,
  onPageChange,
  onTrack,
  onRequestCancel,
  onNewReferral,
}: {
  referrals: ReferralRow[];
  counts: { all: number; open: number; resolved: number; closed: number };
  status: ReferralStatusFilter;
  onStatusChange: (next: ReferralStatusFilter) => void;
  query: string;
  onQueryChange: (v: string) => void;
  /** Search text the rows on screen were fetched for (server-settled query). */
  appliedQuery: string;
  highlightId: string | null;
  /** Card whose tracking is open in the right-hand rail. */
  selectedId?: string | null;
  referralsQuery: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    /** True while the previous page's rows are held during a page/search fetch. */
    isPlaceholderData: boolean;
    refetch: () => void;
  };
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onTrack: (row: ReferralRow) => void;
  onRequestCancel: (row: ReferralRow) => void;
  onNewReferral?: () => void;
}) {
  const [reasonFor, setReasonFor] = React.useState<ReferralRow | null>(null);

  // Paging and searching hit the API, so the board holds the previous slice
  // under `placeholderData` while the new page lands. Swap the cards for
  // skeletons during that fetch (a live poll of the same page never does).
  // The skeleton count mirrors the outgoing slice (max one page of 15) so the
  // grid and its pager keep their height instead of collapsing mid-fetch.
  //
  // Search is the exception: typed text filters the cards already on screen
  // immediately (name/LRN/reason/status) instead of flashing skeletons, then
  // the server's own filtered slice replaces them when it lands.
  const typed = query.trim().toLowerCase();
  const applied = appliedQuery.trim().toLowerCase();
  const searchInFlight =
    typed.length > 0 &&
    (applied !== typed || referralsQuery.isPlaceholderData);
  const isPageLoading = referralsQuery.isPlaceholderData && !searchInFlight;
  const visibleReferrals = searchInFlight
    ? referrals.filter((r) =>
        [r.studentName, r.lrn, r.reason, r.status]
          .join(" ")
          .toLowerCase()
          .includes(typed),
      )
    : referrals;
  const loadingRowCount = Math.min(
    Math.max(referrals.length, 1),
    PAGE_SIZE,
  );


  if (referralsQuery.isPending) {
    return <ReferralsSkeleton />;
  }

  if (referralsQuery.isError) {
    return (
      <div className={refStyles.panel}>
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <p role="alert" className="m-0 font-medium">
            Could not load your referrals.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => referralsQuery.refetch()}
            disabled={referralsQuery.isFetching}
          >
            {referralsQuery.isFetching ? (
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
    );
  }

  // Only the truly empty desk gets the starter board; a search or status tab
  // with no hits keeps the table on screen and shows its own "no match" row.
  if (counts.all === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-10rem)] w-full items-center justify-center">
        <div className="w-full">
          <ReferralEmptyKanban onNewReferral={onNewReferral} />
        </div>
      </div>
    );
  }

  const closedMeta = reasonFor ? dismissalMeta(reasonFor) : null;
  const reasonTitle = closedMeta
    ? isWithdrawnDismissal(reasonFor?.dismissedByRole)
      ? "Reason for cancellation"
      : "Reason for rejection"
    : "Reason for referral";

  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={isPageLoading || undefined}>
      <section className={refStyles.panel} aria-label="Referral casebook">
        <header className={refStyles.laneHead}>
          <div className="min-w-0 flex-1">
            <h2 className={refStyles.laneTitle}>
              <span className={refStyles.laneDot} aria-hidden />
              {STATUS_LANE_LABEL[status]}
            </h2>
          </div>
          <ReferralPageActions onNewReferral={onNewReferral} />
        </header>

        <div className={refStyles.panelToolbar}>
          <FilterTabs
            label="Filter referrals by status"
            value={status}
            onChange={onStatusChange}
            variant="tags"
            options={STATUS_TAB_OPTIONS.map((option) => ({
              ...option,
              count: counts[option.value],
            }))}
          />
          <TeacherSearchField
            className="w-60 max-w-full"
            placeholder="Search referrals…"
            value={query}
            onChange={onQueryChange}
            loading={referralsQuery.isFetching && referralsQuery.isPlaceholderData}
            aria-label="Filter referrals"
          />
        </div>

        <div className={refStyles.cardArea}>
          {isPageLoading ? (
            <ShimmerGroup>
              <ul className={refStyles.cardGrid} aria-hidden>
                {Array.from({ length: loadingRowCount }).map((_, i) => (
                  <li key={`page-skeleton-${i}`}>
                    <div className={refStyles.cardSkeleton}>
                      <div className="flex min-w-0 items-start gap-2">
                        <Skeleton className="size-9 shrink-0 rounded-full" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Skeleton className="h-3.5 w-32" />
                          <Skeleton className="h-5 w-24 rounded-md" />
                        </div>
                        <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3.5 w-24" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Skeleton className="h-3 w-14" />
                          <Skeleton className="h-3.5 w-28" />
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 border-t border-border/70 pt-2.5">
                        <Skeleton className="h-8 w-20 rounded-[8px]" />
                        <Skeleton className="h-8 w-16 rounded-[8px]" />
                        <Skeleton className="ml-auto size-8 rounded-[8px]" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </ShimmerGroup>
          ) : visibleReferrals.length ? (
            <ul className={refStyles.cardGrid} aria-label="Referral cards">
              {visibleReferrals.map((r) => (
                <ReferralCard
                  key={r.id}
                  referral={r}
                  highlighted={highlightId !== null && highlightId === r.id}
                  selected={selectedId === r.id}
                  onTrack={onTrack}
                  onRequestCancel={onRequestCancel}
                  onReason={setReasonFor}
                />
              ))}
            </ul>
          ) : (
            <div className="flex w-full justify-center py-10">
              <InsightCallout role="status" className="w-full max-w-xl text-left">
                {query.trim()
                  ? searchEmptyMessage(query, "referrals", "Try a different name, LRN, or status.")
                  : searchEmptyMessage("", "referrals")}
              </InsightCallout>
            </div>
          )}
        </div>

        {shouldShowPagination(totalItems, PAGE_SIZE) ? (
          <footer className={refStyles.panelFooter}>
            <Pagination
              currentPage={page}
              totalItems={totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={onPageChange}
            />
          </footer>
        ) : null}
      </section>

      <KanbanOverlay
        open={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        title={reasonTitle}
        ariaLabel={
          reasonFor
            ? `${reasonTitle} for ${reasonFor.studentName}`
            : "Reason for referral"
        }
        icon={
          <span className="text-amber-500" aria-hidden>
            <MessageSquareText size={16} />
          </span>
        }
        width="md"
      >
        {reasonFor ? (
          <div className="flex min-w-0 flex-col gap-3 px-1 pb-1">
            {/* Identity strip: mascot, surname-first name, LRN + filed date,
                and the live status on the right. */}
            <div className="flex min-w-0 items-center gap-2.5">
              <StudentMascot
                name={reasonFor.studentName}
                seed={reasonFor.lrn}
                character={reasonFor.mascot ?? undefined}
                size={36}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className="truncate text-[14px] font-semibold leading-tight text-foreground"
                  title={reasonFor.studentName}
                >
                  {formatSurnameFirst(reasonFor.studentName)}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-1 text-[12px] text-muted-foreground">
                  <span className="tabular-nums">LRN {reasonFor.lrn}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">
                    Filed {formatReferredDate(reasonFor.referredAt)}
                  </span>
                </span>
              </div>
              <Pill
                tone={STATUS_TONE[statusBadge(reasonFor.status, reasonFor.dismissedByRole).variant]}
                label="Referral status"
              >
                {statusBadge(reasonFor.status, reasonFor.dismissedByRole).label}
              </Pill>
            </div>

            {/* Case facts: a quiet two-column definition grid. */}
            <dl className="grid min-w-0 grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="m-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                  Referral type
                </dt>
                <dd className="m-0 min-w-0">
                  <Pill
                    tone={
                      typeForDesk(reasonFor.targetRole).key === "adm" ? "amber" : "blue"
                    }
                    label="Referral type"
                  >
                    {typeForDesk(reasonFor.targetRole).label}
                  </Pill>
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="m-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                  Handled by
                </dt>
                <dd className="m-0 truncate text-[13px] font-medium leading-snug text-foreground">
                  {deskHolding(reasonFor)}
                </dd>
              </div>
            </dl>

            <section className="flex min-w-0 flex-col gap-1.5">
              <h3 className="m-0 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
                {closedMeta ? "Closing note" : "Reason for referral"}
              </h3>
              {closedMeta ? (
                <>
                  <p className="m-0 break-words text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
                    {closedMeta.label}
                  </p>
                  {closedMeta.note ? (
                    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 bg-muted/40 p-2.5">
                      <span className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                        {isWithdrawnDismissal(reasonFor.dismissedByRole)
                          ? "Note from the filing teacher"
                          : "Note from the desk"}
                      </span>
                      <p className="m-0 break-words text-[12px] leading-relaxed whitespace-pre-wrap text-foreground">
                        {closedMeta.note}
                      </p>
                    </div>
                  ) : (
                    <p className="m-0 text-[12px] text-muted-foreground">
                      No note was left
                      {isWithdrawnDismissal(reasonFor.dismissedByRole)
                        ? " by the filing teacher."
                        : " by the desk."}
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5 dark:bg-card/60">
                  <p className="m-0 break-words text-[13px] leading-relaxed whitespace-pre-wrap text-foreground">
                    {reasonFor.reason?.trim() ||
                      "No reason was recorded for this referral."}
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </KanbanOverlay>
    </div>
  );
}
