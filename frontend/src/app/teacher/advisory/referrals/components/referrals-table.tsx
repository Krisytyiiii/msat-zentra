"use client";
import * as React from "react";
import {
  Building2,
  Files,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SidePanel } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { InsightCallout } from "@/components/ui/insight-callout";
import { Pagination, PAGE_SIZE, shouldShowPagination } from "@/components/shared/pagination";
import cascade from "@/components/shared/desk-cascade.module.css";
import refStyles from "./referrals.module.css";
import { formatSurnameFirst } from "@/lib/names";
import { typeForDesk } from "./referral-types";
import {
  isWithdrawnDismissal,
  type ReferralRow,
  type ReferralTypeFilter,
} from "./use-my-referrals";
import { StudentMascot } from "./StudentMascot";
import { ReferralEmptyKanban } from "./ReferralEmptyKanban";
import { ReferralPageActions } from "./ReferralPageActions";
import { ReferralsSkeleton } from "./ReferralsSkeleton";
import { ReferralTrackRail } from "./ReferralTrackRail";
import type { TrackableReferral } from "./ReferralTrackDialog";

type StatusMeta = { variant: "amber" | "blue" | "green" | "red" | "outline"; label: string };

/* Status reads as plain text in the table — the tone only tints it. */
const STATUS_TEXT_TONE: Record<StatusMeta["variant"], string> = {
  amber: "text-amber-600 dark:text-amber-400",
  blue: "text-blue-600 dark:text-blue-400",
  green: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-600 dark:text-red-400",
  outline: "text-muted-foreground",
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

/** Map a casebook row onto the tracking rail's shape. */
export function toTrackable(r: ReferralRow): TrackableReferral {
  const meta = statusBadge(r.status, r.dismissedByRole);
  const type = typeForDesk(r.targetRole);
  return {
    id: r.id,
    studentName: r.studentName,
    lrn: r.lrn,
    mascot: r.mascot ?? null,
    targetRole: r.targetRole,
    track: r.targetRole === "adm_coordinator" ? "adm" : "general",
    typeLabel: type.label,
    typeVariant: type.badgeVariant,
    status: r.status,
    statusLabel: meta.label,
    statusVariant: meta.variant,
    referredAt: r.referredAt,
    reason: r.reason,
    timeline: r.timeline ?? [],
    consultReviewer: r.consultReviewer ?? null,
    admStage: r.admStage ?? null,
    dismissedByRole: r.dismissedByRole ?? null,
    observationDate: r.observationDate ?? null,
    meetingAttended: r.meetingAttended ?? null,
    lastMeetingAt: r.lastMeetingAt ?? null,
    hasHomeVisit: r.hasHomeVisit ?? false,
    admApproved: r.admApproved ?? false,
    admApprovedAt: r.admApprovedAt ?? null,
    modulesSubmitted: r.modulesSubmitted ?? 0,
    modulesTotal: r.modulesTotal ?? 0,
    lastModuleAt: r.lastModuleAt ?? null,
    devicesReturned: r.devicesReturned ?? 0,
    certificationAt: r.certificationAt ?? null,
    resolvedAt: r.resolvedAt ?? null,
    bookedSession: r.bookedSession ?? null,
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

const TYPE_TAB_OPTIONS: ReadonlyArray<{
  value: ReferralTypeFilter;
  label: string;
  tone: "amber" | "blue" | "neutral";
}> = [
  { value: "all", label: "All", tone: "neutral" },
  { value: "adm", label: "ADM case", tone: "amber" },
  { value: "other", label: "Other matters", tone: "blue" },
];

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

/** One placeholder row while a page/filter slice lands. */
function SkeletonRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
      <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ReferralsTable({
  referrals,
  counts,
  type,
  onTypeChange,
  query,
  onQueryChange,
  appliedQuery,
  highlightId,
  referralsQuery,
  page,
  totalItems,
  onPageChange,
  onRequestCancel,
  onNewReferral,
}: {
  referrals: ReferralRow[];
  counts: { all: number; adm: number; other: number };
  type: ReferralTypeFilter;
  onTypeChange: (next: ReferralTypeFilter) => void;
  query: string;
  onQueryChange: (v: string) => void;
  /** Search text the rows on screen were fetched for (server-settled query). */
  appliedQuery: string;
  highlightId: string | null;
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
  onRequestCancel: (row: ReferralRow) => void;
  onNewReferral?: () => void;
}) {
  /** Case picked by a row click. */
  const [picked, setPicked] = React.useState<ReferralRow | null>(null);
  /** Deep-linked case (`?highlight=`) the teacher already closed. */
  const [closedHighlight, setClosedHighlight] = React.useState<string | null>(null);

  // A deep-linked case opens its tracking drawer on arrival — the row also
  // gets the amber ring, so closing the drawer still leaves the case easy to
  // spot. Derived instead of an effect, so a poll cannot reopen a closed one.
  const highlightRow =
    highlightId && highlightId !== closedHighlight
      ? (referrals.find((r) => r.id === highlightId) ?? null)
      : null;
  const tracked = picked ?? highlightRow;

  function openTracking(row: ReferralRow) {
    setPicked(row);
  }

  function closeTracking() {
    setPicked(null);
    if (highlightId) setClosedHighlight(highlightId);
  }

  // Paging and searching hit the API, so the board holds the previous slice
  // under `placeholderData` while the new page lands. Swap the rows for
  // skeletons during that fetch (a live poll of the same page never does).
  // The skeleton count mirrors the outgoing slice (max one page of 15) so the
  // table and its pager keep their height instead of collapsing mid-fetch.
  //
  // Search is the exception: typed text filters the rows already on screen
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

  // Only the truly empty desk gets the starter board; a search or type tab
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

  return (
    <div className="flex min-w-0 flex-col gap-3" aria-busy={isPageLoading || undefined}>
      <section className={refStyles.panel} aria-label="Referral casebook">
        <header className={refStyles.deskHead}>
          <span className={refStyles.deskBadge} aria-hidden>
            <Files size={16} />
          </span>
          <div className={refStyles.deskHeading}>
            <h2 className={refStyles.deskTitle}>Referrals</h2>
          </div>
          <div className={refStyles.deskTools}>
            <ReferralPageActions onNewReferral={onNewReferral} />
          </div>
        </header>

        <div className={refStyles.panelToolbar}>
          <FilterTabs
            label="Filter referrals by type"
            value={type}
            onChange={onTypeChange}
            variant="tags"
            options={TYPE_TAB_OPTIONS.map((option) => ({
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

        <div className={refStyles.tableArea}>
          <div className={refStyles.tableWrap}>
            <ShimmerGroup>
              <Table className={`${cascade.table} w-full table-fixed`}>
              <TableHeader>
                <TableRow className="bg-muted/50 [&>th]:border-t-0">
                  <TableHead className="h-10 w-[26%]">Student</TableHead>
                  <TableHead className="h-10 w-[13%]">Status</TableHead>
                  <TableHead className="h-10 w-[13%]">Type</TableHead>
                  <TableHead className="h-10 w-[16%]">Handled by</TableHead>
                  <TableHead className="h-10 w-[15%]">Referred</TableHead>
                  <TableHead className="h-10 w-[12%]">Session</TableHead>
                  <TableHead className="h-10 w-[10%] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPageLoading ? (
                  Array.from({ length: loadingRowCount }).map((_, index) => (
                    <SkeletonRow key={`page-skeleton-${index}`} />
                  ))
                ) : visibleReferrals.length ? (
                  visibleReferrals.map((r, index) => {
                    const type = typeForDesk(r.targetRole);
                    const meta = statusBadge(r.status, r.dismissedByRole);
                    const cancelled = r.status === "dismissed";
                    const cancellable = isCancellable(r.status);
                    const session = cancelled ? null : r.bookedSession;
                    const highlighted = highlightId !== null && highlightId === r.id;
                    const selected = tracked?.id === r.id;
                    return (
                      <TableRow
                        key={r.id}
                        id={`teacher-referral-${r.id}`}
                        data-highlighted={highlighted || undefined}
                        style={{ animationDelay: `${450 + Math.min(index, 11) * 140}ms` }}
                        onClick={() => openTracking(r)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openTracking(r);
                          }
                        }}
                        tabIndex={0}
                        aria-selected={selected}
                        aria-label={`${r.studentName} — open referral tracking`}
                        className={`${refStyles.row} ${selected ? refStyles.rowSelected : ""} ${
                          highlighted ? refStyles.rowHighlighted : ""
                        }`}
                      >
                        <TableCell className="truncate">
                          <div className="flex min-w-0 items-center gap-2">
                            <StudentMascot
                              name={r.studentName}
                              seed={r.lrn}
                              character={r.mascot ?? undefined}
                              size={32}
                            />
                            <div className="min-w-0 flex-1">
                              <span
                                className="block truncate text-[13px] font-semibold text-primary"
                                title={r.studentName}
                              >
                                {formatSurnameFirst(r.studentName)}
                              </span>
                              <span
                                className="mt-0.5 block max-w-full truncate font-mono text-[12px] tabular-nums text-muted-foreground"
                                title={`LRN ${r.lrn}`}
                              >
                                {r.lrn}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="truncate">
                          <span
                            className={`text-[12px] font-semibold ${STATUS_TEXT_TONE[meta.variant]}`}
                          >
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="truncate">
                          <span className="text-[12px] font-medium">{type.label}</span>
                        </TableCell>
                        <TableCell className="truncate">
                          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium">
                            <Building2 size={12} className="shrink-0 opacity-70" aria-hidden />
                            <span className="truncate">{deskHolding(r)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="truncate">
                          <span className="block truncate text-[12px] font-medium">
                            {formatReferredDate(r.referredAt)}
                          </span>
                          <span className="mt-0.5 block text-[12px] text-muted-foreground">
                            {relativeDay(r.referredAt)}
                          </span>
                        </TableCell>
                        <TableCell className="truncate">
                          {session ? (
                            <span
                              className="block truncate text-[12px] font-medium text-teal-600 dark:text-teal-400"
                              title={bookedSessionPill(session).tooltip}
                            >
                              {bookedSessionPill(session).text}
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center justify-end">
                            {cancelled ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[12px]"
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
                                New record
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 shrink-0 bg-red-600 px-2 text-[12px] text-white hover:bg-red-700 disabled:bg-red-600/60 disabled:text-white/80 dark:bg-red-600 dark:text-white dark:hover:bg-red-700 dark:disabled:bg-red-600/60 dark:disabled:text-white/80"
                                disabled={!cancellable}
                                onClick={() => onRequestCancel(r)}
                                aria-label={
                                  cancellable ? `Cancel the referral for ${r.studentName}` : "Referral closed"
                                }
                                title={cancellable ? "Cancel referral" : "Closed"}
                              >
                                {cancellable ? "Cancel" : "Closed"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="h-[calc(100dvh-20rem)] min-h-[22rem] whitespace-normal align-middle"
                    >
                      <div className="flex h-full w-full items-center justify-center">
                        <InsightCallout role="status" className="w-full max-w-xl text-left">
                          {query.trim()
                            ? searchEmptyMessage(query, "referrals", "Try a different name, LRN, or type.")
                            : searchEmptyMessage("", "referrals")}
                        </InsightCallout>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              </Table>
            </ShimmerGroup>
          </div>
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

      <SidePanel
        open={tracked !== null}
        onClose={closeTracking}
        label={tracked ? `${tracked.studentName} — referral tracking` : "Referral tracking"}
        width="2xl"
        showCloseButton
      >
        <div className="flex h-full min-h-0 flex-col">
          <ReferralTrackRail
            key={tracked?.id ?? "empty"}
            referral={tracked ? toTrackable(tracked) : null}
            embedded
          />
        </div>
      </SidePanel>
    </div>
  );
}
