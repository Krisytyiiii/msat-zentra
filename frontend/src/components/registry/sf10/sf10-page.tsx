"use client";
import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Archive,
  FileCheck,
  Files,
  Paperclip,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { FilterTabs, type FilterTabOption } from "@/components/ui/filter-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { StatDeck } from "@/components/ui/stat-deck";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Pagination } from "@/components/shared/pagination";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { useUrlPager } from "@/components/shared/pagination/useUrlPager";
import { useSearchParams } from "next/navigation";
import { fetchSf10Records } from "@/services/registry/sf10.service";
import { Sf10FolderGrid, Sf10RecordKanbanGrid } from "@/components/registry/sf10/sf10-folders";
import { Sf10RecordOverlay } from "@/components/registry/sf10/Sf10RecordOverlay";
import {
  type Sf10Record,
  type Sf10Status,
} from "@/services/registry/sf10.types";
import assign from "@/app/principal/academics/assign/components/section-assignments.module.css";
import styles from "@/components/registry/sf10/sf10.module.css";
const STATUS_FILTERS: {
  key: Sf10Status | "all";
  label: string;
  tone: NonNullable<FilterTabOption<string>["tone"]>;
}[] = [
  { key: "all", label: "All", tone: "neutral" },
  { key: "attach", label: "Attached", tone: "amber" },
  { key: "available", label: "Available", tone: "green" },
  { key: "released", label: "Released", tone: "blue" },
];
export function Sf10Page({
  desk,
  pageSize,
}: {
  desk: "registrar" | "record-keeper";
  pageSize: number;
}) {
  const [openRecordId, setOpenRecordId] = React.useState<string | null>(null);
  const searchParams = useSearchParams();
  const [queryInput, setQueryInput] = React.useState(searchParams.get("q") ?? "");
  const query = useDebouncedValue(queryInput.trim(), 300);
  const [status, setStatusState] = React.useState<Sf10Status | "all">(
    (searchParams.get("status") as Sf10Status | null) ?? "all",
  );
  const pager = useUrlPager(0, {}, { searchParam: "q", extraParams: ["q", "status"] });
  const page = pager.page;
  const setPage = pager.setPage;
  const setStatus = React.useCallback(
    (value: Sf10Status | "all") => {
      setStatusState(value);
      pager.setFilters({ status: value === "all" ? undefined : value });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
  const openRecord = (r: Sf10Record) => {
    setOpenRecordId(r.id);
  };
  const { data, isPending, isError, isPlaceholderData } = useQuery({
    queryKey: [`${desk}-sf10`, page, query, status],
    queryFn: ({ signal }) =>
      fetchSf10Records({
        page,
        pageSize,
        ...(query ? { q: query } : {}),
        ...(status !== "all" ? { status } : {}),
        signal,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const pageRows = React.useMemo(() => data?.records ?? [], [data]);
  const counts = React.useMemo(
    () => data?.counts ?? { attach: 0, available: 0, released: 0, total: 0 },
    [data],
  );
  // Stats deck — one clickable tile per shelf, same number-first tile the
  // adviser-access desk uses (icon + label, big count, share meter, hint).
  // Clicking a tile scopes the records board to that status.
  const kpiTiles = [
    {
      key: "attach",
      icon: Paperclip,
      label: "Attached",
      unit: "files",
      value: counts.attach,
      hint: "Uploaded files, stored as-is",
      status: "attach" as const,
    },
    {
      key: "available",
      icon: FileCheck,
      label: "Available",
      unit: "ready",
      value: counts.available,
      hint: "Validated and ready to release",
      status: "available" as const,
    },
    {
      key: "released",
      icon: Archive,
      label: "Released",
      unit: "sent",
      value: counts.released,
      hint: "Released to another school",
      status: "released" as const,
    },
    {
      key: "total",
      icon: Files,
      label: "Total records",
      unit: "filed",
      value: counts.total,
      hint: "Every SF10 file on this desk",
      status: "all" as const,
    },
  ];
  const shareBase = Math.max(1, counts.total);
  const filteredTotal = data?.total ?? pageRows.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const safePage = Math.min(page, totalPages);
  const filtering = queryInput.trim().length > 0 || status !== "all";
  // Both desks now share the record-keeper board layout (KPI kanban board +
  // records board + icon-only upload rail). Scope (grades) is enforced by the
  // backend per desk; the UI is identical.
  const recordKeeper = true;
  const deskLabel = desk === "registrar" ? "registrar" : "record keeper";
  // Filter the loaded page instantly as the clerk types (same feel as the
  // coordinator referrals desk); the debounced server query then swaps in
  // matches from the rest of the desk. Declared BEFORE the empty-state early
  // return below — a hook after an early return changes the hook count between
  // renders and crashes the page ("Rendered fewer hooks than expected").
  const searchTerm = queryInput.trim().toLowerCase();
  const visibleRows = React.useMemo(() => {
    if (searchTerm === "") return pageRows;
    return pageRows.filter((r) =>
      `${r.fullName} ${r.lrn} ${r.section}`.toLowerCase().includes(searchTerm),
    );
  }, [pageRows, searchTerm]);
  if (!isPending && !isError && counts.total === 0) {
    return (
      <section className={styles.page}>
        <PageEmptyCallout
          fit
          action={
            <Button asChild size="sm" className="h-7 shrink-0 px-2.5 text-[12px] font-medium">
              <Link href={`/${desk}/sf10/upload`}>
                <Upload size={13} aria-hidden />
                Upload SF10
              </Link>
            </Button>
          }
        >
          No SF10 records yet. Upload a file to attach the first SF10 record filed by
          the {deskLabel}.
        </PageEmptyCallout>
      </section>
    );
  }
  // Records section copy + controls, shared by both desk layouts: the
  // record keeper renders them inside the kanban board shell (title,
  // description, actions, status filter toolbar), the registrar keeps the
  // classic list head + folder grid. The board variant drops the Upload
  // button (the stats row owns upload there) and rounds the search to 16px.
  const recordsDescription = `Learner SF10 files filed by the ${deskLabel}.`;
  const recordsActions = () => {
    return (
      <div className={styles.headerActions}>
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link href={`/${desk}/sf10/upload`}>
            <Upload aria-hidden />
            Upload
          </Link>
        </Button>
        <SearchField
          className="w-60"
          placeholder="Search name, LRN, or section…"
          value={queryInput}
          onChange={setQueryInput}
          aria-label="Search SF10 records"
        />
      </div>
    );
  };
  const recordsFilters = (
    <FilterTabs
      label="Filter by status"
      variant="tags"
      options={STATUS_FILTERS.map((f) => ({
        value: f.key,
        label: f.label,
        tone: f.tone,
        count:
          f.key === "all"
            ? counts.total
            : f.key === "attach"
              ? counts.attach
              : f.key === "available"
                ? counts.available
                : counts.released,
      }))}
      value={status}
      onChange={setStatus}
    />
  );
  return (
    <section className={styles.page}>
      <div className={styles.stack}>
        {recordKeeper ? (
          <ShimmerGroup>
            <StatDeck
              ariaLabel="SF10 summary"
              items={kpiTiles.map((tile) => ({
                key: tile.key,
                icon: tile.icon,
                label: tile.label,
                unit: tile.unit,
                value: tile.value,
                hint: tile.hint,
                meter: Math.round((tile.value / shareBase) * 100),
                onClick: () => setStatus(tile.status),
                active: status === tile.status,
                ariaLabel: `${tile.label}: ${tile.value} ${tile.unit} — filter the records board`,
              }))}
              loading={isPending}
            />
          </ShimmerGroup>
        ) : (
          <section className={assign.card} aria-label="SF10 summary">
            <span className={assign.glowClip} aria-hidden="true">
              <span className={assign.cardGlow} />
            </span>
            {isPending ? (
              <ShimmerGroup>
                <ul className={`${styles.tiles} relative`}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <li key={i}>
                      <Skeleton className={styles.tileSkel} />
                    </li>
                  ))}
                </ul>
              </ShimmerGroup>
            ) : (
              <ul className={`${styles.tiles} relative`}>
                <li className={styles.tile}>
                  <span className={styles.tileValue}>{counts.attach}</span>
                  <span className={styles.tileLabel}>Attached</span>
                  <span className={styles.tileHint}>Uploaded files, stored as-is</span>
                </li>
                <li className={styles.tile}>
                  <span className={styles.tileValue}>{counts.released}</span>
                  <span className={styles.tileLabel}>Released</span>
                  <span className={styles.tileHint}>Released to another school</span>
                </li>
                <li className={styles.tile}>
                  <span className={styles.tileValue}>{counts.total}</span>
                  <span className={styles.tileLabel}>Total records</span>
                  <span className={styles.tileHint}>SF10 files filed by this desk</span>
                </li>
              </ul>
            )}
          </section>
        )}
        {recordKeeper ? (
          <section className={styles.recordsBoard} aria-label="SF10 Records">
            <div className={styles.recordsToolbar}>
              {recordsFilters}
              {recordsActions()}
            </div>
            {isPending || isPlaceholderData ? (
              <ShimmerGroup>
                <div className={styles.folderKanbanGrid} aria-hidden="true">
                  {/* One placeholder folder per card a full page renders. */}
                  {Array.from({ length: pageSize }).map((_, i) => (
                    <Skeleton key={i} className={styles.folderKanbanSkel} />
                  ))}
                </div>
              </ShimmerGroup>
            ) : isError ? (
              <p className={styles.empty}>Could not load SF10 records.</p>
            ) : visibleRows.length === 0 ? (
              <PageEmptyCallout fit>
                {filtering
                  ? "No SF10 records match your search or filters. Try a different name, LRN, or section."
                  : "No SF10 records on this page."}
              </PageEmptyCallout>
            ) : (
              // Keyed by page/filter/search so every pagination or filter
              // swap remounts the grid and replays the slow-mo card cascade
              // (even when the result set is identical, e.g. All → Attached).
              <Sf10RecordKanbanGrid
                key={`${desk}-${safePage}-${status}-${query}`}
                records={visibleRows}
                onOpen={openRecord}
              />
            )}
            {filteredTotal > pageSize ? (
              <Pagination
                currentPage={safePage}
                totalItems={filteredTotal}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            ) : null}
          </section>
        ) : (
          <section className={styles.recordsSection} aria-labelledby="sf10-records">
            <div className={`${styles.listHead} relative`}>
              <div className={styles.listHeadText}>
                <h2 id="sf10-records" className="text-base font-semibold">
                  SF10 Records
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{recordsDescription}</p>
              </div>
              {recordsActions()}
            </div>
            {recordsFilters}
            <div className={`${styles.content} relative`}>
              {isPending || isPlaceholderData ? (
                <ShimmerGroup>
                  <div className={styles.folderGrid} aria-hidden="true">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-44 w-full rounded-xl" />
                    ))}
                  </div>
                </ShimmerGroup>
              ) : isError ? (
                <p className={styles.empty}>Could not load SF10 records.</p>
              ) : visibleRows.length === 0 ? (
                <PageEmptyCallout fit>
                  {filtering
                    ? "No SF10 records match your search or filters. Try a different name, LRN, or section."
                    : "No SF10 records on this page."}
                </PageEmptyCallout>
              ) : (
                <Sf10FolderGrid records={visibleRows} onOpen={openRecord} />
              )}
            </div>
            {filteredTotal > pageSize && (
              <Pagination
                currentPage={safePage}
                totalItems={filteredTotal}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            )}
          </section>
        )}
      </div>
      <Sf10RecordOverlay
        desk={desk}
        recordId={openRecordId}
        onClose={() => setOpenRecordId(null)}
      />
    </section>
  );
}
