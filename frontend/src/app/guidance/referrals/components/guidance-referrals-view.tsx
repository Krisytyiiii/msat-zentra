"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZentraPageHeaderSkeleton } from "@/components/shared/zentra-skeletons/ZentraSkeletons";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { GuidancePageHeader } from "../../components/GuidancePageHeader";
import { GuidanceEmptyCard } from "../../components/GuidanceEmptyCard";
import { fetchGuidanceReferrals } from "@/services/guidance/referrals.service";
import type { GuidanceReferralsData } from "@/services/guidance/guidance.types";
import { GuidanceReferralsTable } from "./guidance-referrals-table";
import { GuidanceReferralsSkeleton } from "./GuidanceReferralsSkeleton";
import {
  GuidanceBoardDeskHead,
} from "./GuidanceBoardDeskHead";
import {
  matchesGuidanceFilters,
  resolveActionParams,
  type GuidanceAction,
  type GuidanceTypeFilter,
} from "./guidance-referrals-format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useTerm } from "@/lib/term/TermContext";
import { liveQueryOptions } from "@/lib/api/live";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { useSearchParams } from "next/navigation";
import styles from "./guidance-referrals.module.css";
import pageStyles from "../../pages.module.css";
import { PAGE_SIZE } from "@/components/shared/pagination";

const GUIDANCE_REFERRALS_PAGE_SIZE = PAGE_SIZE;
/* The locked desk boards page in whole 4×4 kanban grids (four rows of
   four), same as the nurse ADM / clinic boards. */
const GUIDANCE_BOARD_PAGE_SIZE = 16;

export function GuidanceReferralsView({
  lockedType = "",
  title = "Referrals to me",
  description,
  highlightId = null,
}: {
  lockedType?: GuidanceTypeFilter;
  title?: string;
  description?: string;
  highlightId?: string | null;
}) {
  const locked = lockedType !== "";
  /* Both locked desks (ADM + Counseling) are data lists now — the same
     anatomy as /guidance/alerts — while keeping the board chrome: desk head,
     figure strip and action tabs. */
  const isBoard =
    lockedType === "ADM" || lockedType === "Counseling";
  const pageSize = isBoard ? GUIDANCE_BOARD_PAGE_SIZE : GUIDANCE_REFERRALS_PAGE_SIZE;
  const searchParams = useSearchParams();
  const { activeTerm, termReady } = useTerm();
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const [queryInput, setQueryInput] = React.useState(searchParams.get("q") ?? "");
  const query = useDebouncedValue(queryInput.trim(), 300);
  const [typeFilter, setTypeFilter] = React.useState<GuidanceTypeFilter>(lockedType);

  const [action, setAction] = React.useState<GuidanceAction>("");
  const pager = useUrlPager(0, {}, { searchParam: "q", extraParams: ["q"] });
  const page = pager.page;
  const setPage = pager.setPage;
  const [takeover, setTakeover] = React.useState(false);

  // Sync debounced search to the URL and reset to page 1 when it changes.
  const firstSearchSync = React.useRef(true);
  React.useEffect(() => {
    if (firstSearchSync.current) {
      firstSearchSync.current = false;
      return;
    }
    pager.setFilters({ q: query || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const setQuery = React.useCallback((value: string) => {
    setQueryInput(value);
  }, []);
  const debounced = query;
  const landing = !takeover && highlightId !== null;

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setTakeover(true);
    setPage(1);
  };

  const handleTypeChange = (value: GuidanceTypeFilter) => {

    if (lockedType !== "") return;
    setTypeFilter(value);

    setAction("");
    setTakeover(true);
    setPage(1);
  };

  const handleActionChange = (value: GuidanceAction) => {
    setAction(value);
    setTakeover(true);
    setPage(1);
  };

  const handlePageChange = (next: number) => {
    setTakeover(true);
    setPage(next);
  };

  const actionParams = resolveActionParams(action);
  /* The action lens is resolved server-side (status/booked/completed/withdrawn)
     so the chip count, the pager and the rows all describe the same slice —
     the loaded page is no longer the boundary. */
  const serverAction = action === "" ? null : actionParams;
  const effType =
    lockedType === "ADM"
      ? "adm"
      : lockedType === "Counseling"
        ? "counseling"
        : typeFilter === "ADM"
          ? "adm"
          : typeFilter === "Counseling"
            ? "counseling"
            : "";

  /* Action tabs are a server-side lens: the chips (whole-desk counts), the
     pager and the rows all describe the same filtered slice. Only free-text
     search is additionally matched locally while the debounce catches up. */
  const requestedPage = takeover || !locked ? page : 1;
  const queryKey = [
    "guidance-referrals",
    requestedPage,
    debounced,
    effType,
    action,
    termKey,
    landing ? (highlightId ?? "") : "",
  ];

  const referralsQuery = useQuery<GuidanceReferralsData>({
    ...liveQueryOptions,
    queryKey,
    queryFn: ({ signal }) =>
      fetchGuidanceReferrals(
        {
          q: debounced || undefined,
          type: serverAction?.type || effType || undefined,
          ...(serverAction
            ? {
                status: serverAction.status || undefined,
                booked: serverAction.booked || undefined,
                completed: serverAction.completed || undefined,
                open: serverAction.open || undefined,
                withdrawn:
                  serverAction.status === "dismissed"
                    ? serverAction.withdrawn
                    : undefined,
              }
            : {}),
          page: requestedPage,
          pageSize,
          ...(landing && highlightId ? { highlight: highlightId } : {}),
        },
        { signal }
      ),

    // Same-page refreshes (typing) keep the cards; a page flip drops the
    // retained page so the skeleton shows while the next payload loads.
    placeholderData: (previousData, previousQuery) =>
      previousData && previousQuery?.queryKey?.[1] === requestedPage
        ? previousData
        : undefined,
    enabled: termReady,
  });

  const { data, isPending, isError, isRefetching, refetch } = referralsQuery;

  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const safePage = Math.min(data?.page ?? page, totalPages);

  const headerCopy = React.useMemo(() => {
    if (lockedType === "ADM")
      return {
        title,
        description:
          description ??
          "ADM cases endorsed to guidance — review, accept, or forward for action.",
      };
    if (lockedType === "Counseling")
      return {
        title,
        description:
          description ??
          "Counseling cases on your desk — accept a case to start work, resolve it when follow-through is done.",
      };
    return {
      title,
      description:
        description ??
        "Every behavior and incident report advisers routed to you. Accept a case to start work, resolve it when follow-through is done.",
    };
  }, [lockedType, title, description]);

  /* Both locked desks are kanban boards with the nurse case-board anatomy:
     one desk head (title + search), a whole-term figure strip, then the
     server-paged folder-card grid. */
  const boardTrack: "ADM" | "Counseling" =
    lockedType === "ADM" ? "ADM" : "Counseling";
  const searchPlaceholder =
    boardTrack === "ADM" ? "Search ADM cases…" : "Search counseling cases…";
  const deskHead = isBoard ? (
    <GuidanceBoardDeskHead
      track={boardTrack}
      title={title}
      query={queryInput}
      onQueryChange={handleQueryChange}
      searchPlaceholder={searchPlaceholder}
      loading={isRefetching}
    />
  ) : null;

  if (isPending) {
    return (
      <section className={styles.page} aria-busy="true" aria-label="Loading your cases">
        {isBoard ? (
          <>
            {deskHead}
            <ShimmerGroup>
              <GuidanceReferralsSkeleton lockType table={isBoard} />
            </ShimmerGroup>
          </>
        ) : (
          <>
            <ZentraPageHeaderSkeleton />
            <GuidanceReferralsSkeleton lockType={false} />
          </>
        )}
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className={styles.page}>
        {deskHead}
        <div className={styles.pageError} role="alert">
          <p className={styles.pageErrorTitle}>We couldn&apos;t load your cases</p>
          <p className={styles.pageErrorHint}>
            Please check your internet connection and try again.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            {isRefetching ? (
              <Loader2 className={styles.spin} aria-hidden="true" />
            ) : null}
            {isRefetching ? "Loading…" : "Try again"}
          </Button>
        </div>
      </section>
    );
  }

  const refreshing = isRefetching && !isPending;
  const loadedReferrals = Array.isArray(data.referrals) ? data.referrals : [];
  /* Search types instantly over the loaded page (the debounced server query
     catches up in the background). The action lens is already applied by the
     server, so it never hides rows the request returned. */
  const liveQuery = queryInput.trim();
  const referrals = liveQuery !== ""
    ? loadedReferrals.filter((row) =>
        matchesGuidanceFilters(row, liveQuery, actionParams)
      )
    : loadedReferrals;
  const unfilteredTotal = data.unfilteredTotal ?? data.total ?? 0;
  const isTrueEmpty =
    loadedReferrals.length === 0 &&
    unfilteredTotal === 0 &&
    debounced === "" &&
    action === "" &&
    (locked || typeFilter === "");
  /* Filtered totals now come from the server, so the pager matches the rows. */
  const displayTotal = data.total;
  const displayPage = safePage;
  const displayPageSize = data.pageSize;
  const displayTotalPages = totalPages;

  return (
    <section
      className={isTrueEmpty ? `${styles.page} ${pageStyles.pageFit}` : styles.page}
      aria-busy={refreshing}
      aria-label={headerCopy.title}
    >
      {isBoard ? (
        <>
          {deskHead}
        </>
      ) : isTrueEmpty ? null : (
        <GuidancePageHeader
          title={headerCopy.title}
          description={headerCopy.description}
        />
      )}
      {isTrueEmpty ? (
        <GuidanceEmptyCard
          icon={Inbox}
          title="No referrals found"
          hint="New cases sent to you by advisers will appear here."
          label={headerCopy.title}
          centered
          layout="fit"
        />
      ) : (
      <GuidanceReferralsTable
        referrals={referrals}
        summary={data.summary ?? null}
        total={displayTotal}
        unfilteredTotal={data.unfilteredTotal}
        page={displayPage}
        pageSize={displayPageSize}
        totalPages={displayTotalPages}
        onPageChange={handlePageChange}
        query={queryInput}
        onQueryChange={handleQueryChange}
        typeFilter={typeFilter}
        onTypeChange={handleTypeChange}
        action={action}
        onActionChange={handleActionChange}
        onRetry={() => refetch()}
        isRetrying={isRefetching}
        lockType={locked}
        title={title}
        layout={isBoard ? "table" : "list"}
        highlightId={highlightId}
      />
      )}
    </section>
  );
}
