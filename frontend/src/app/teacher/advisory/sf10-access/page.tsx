"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, FileSpreadsheet, Loader2, Send, ShieldQuestion } from "lucide-react";
import { TeacherEmptyCard } from "../../components/TeacherEmptyCard";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import { InsightCallout } from "@/components/ui/insight-callout";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { useAdvisorySections } from "@/services/teacher/advisory.service";
import {
  useMyAccessRequests,
  useMyFirstSf10Records,
  useMyVerification,
  useSf10Verifications,
  type HasRow,
} from "@/services/teacher/sf10Access.service";
import { downloadSf10Template } from "@/services/teacher/sf10Autofill.service";
import { compareSurnameFirst, formatSurnameFirst } from "@/lib/names";
import { formatManilaDate } from "@/lib/labels/datetime";
import { sf10StatusLabel, sf10StatusTone } from "@/lib/labels/status-tone";
import { Sf10EmptyActions } from "./components/Sf10EmptyActions";
import { Sf10ChatDrawer } from "./components/Sf10ChatDrawer";
import { RejectedRequestsCard } from "./components/Sf10SideRail";
import { Sf10PageSkeleton } from "./components/Sf10PageSkeleton";
import { Sf10AccessDrawer } from "./components/Sf10AccessDrawer";
import { StudentMascot } from "../referrals/components/StudentMascot";
import { type Sf10DeskRow } from "./components/sf10-desk-row";
import motion from "../modules/components/modules-motion.module.css";
import glass from "../modules/components/modules-glass.module.css";

function downloadErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown } } } })?.response?.data;
  const message = data?.error?.message;
  if (typeof message === "string" && message) return message;
  return err instanceof Error ? err.message : "Try again in a moment.";
}

function isSpreadsheetUrl(url: string): boolean {
  const ext = (() => {
    try {
      const pathname = new URL(url).pathname;
      return pathname.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    } catch {
      return url.split("?")[0].split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    }
  })();
  return ext === "xlsx" || ext === "xls";
}

type Scope = "all" | "auto" | "record" | "missing";

const CARD_ACCENT: Record<"auto" | "record" | "missing", string> = {
  auto: "#8b5cf6",
  record: "#3b82f6",
  missing: "#ef4444",
};

const CARD_STATE: Record<"auto" | "record" | "missing", string> = {
  auto: "text-blue-600 dark:text-blue-400",
  record: "text-emerald-600 dark:text-emerald-400",
  missing: "text-red-600 dark:text-red-400",
};

function stateOf(row: Sf10DeskRow): "auto" | "record" | "missing" {
  if (row.missing) return "missing";
  return row.record?.autoFill ? "auto" : "record";
}

function Sf10RecordCard({
  row,
  index,
  selected,
  onOpen,
}: {
  row: Sf10DeskRow;
  index: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const state = stateOf(row);
  const autoFill = row.record?.autoFill;
  const updatedAt = autoFill?.at ?? row.record?.validatedAt ?? row.record?.verifiedAt;

  return (
    <article
      style={{ "--card-index": Math.min(index, 9) } as React.CSSProperties}
      className={`${motion.card} min-w-0`}
    >
      <div
        onClick={onOpen}
        className={`${glass.card} ${selected ? glass.cardSelected : ""}`}
      >
        <div className={glass.cardHead}>
          <span
            className={glass.cardIcon}
            style={{ backgroundColor: CARD_ACCENT[state] }}
            aria-hidden
          >
            <FileSpreadsheet size={16} />
          </span>
          <div className={glass.cardHeading}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className={glass.cardNameButton}
              title={`Open ${row.name}'s SF10`}
            >
              {formatSurnameFirst(row.name)}
            </button>
            <span className={glass.cardMetaRow}>
              <span
                className="max-w-full truncate font-mono text-[12px] tabular-nums text-muted-foreground"
                title={`LRN ${row.lrn}`}
              >
                {row.lrn}
              </span>
            </span>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold ${CARD_STATE[state]}`}
          >
            {row.missing ? (
              <Pill tone="red">No record</Pill>
            ) : autoFill ? (
              <Pill tone="blue" className="gap-1">
                <FileSpreadsheet size={12} aria-hidden />
                Bama v{autoFill.version}
              </Pill>
            ) : (
              <Pill tone={sf10StatusTone(row.sf10Status)}>
                {sf10StatusLabel(row.sf10Status)}
              </Pill>
            )}
          </span>
        </div>

        <div className={glass.cardMetrics}>
          <div className={glass.cardMetric}>
            <span className={glass.metricLabel}>Grade</span>
            <span className={glass.metricValue}>{row.gradeLevel}</span>
            <span className={glass.metricHint}>grade level</span>
          </div>
          <div className={glass.cardMetric}>
            <span className={glass.metricLabel}>Section</span>
            <span className={`${glass.metricValue} ${glass.metricValueDate}`} title={row.section}>
              {row.section || "—"}
            </span>
            <span className={glass.metricHint}>advisory section</span>
          </div>
          <div className={glass.cardMetric}>
            <span className={glass.metricLabel}>Latest auto-fill</span>
            <span className={glass.metricValue}>
              {autoFill ? `v${autoFill.version}` : "—"}
            </span>
            <span className={glass.metricHint}>
              {autoFill?.at ? formatManilaDate(autoFill.at) : "no Bama run yet"}
            </span>
          </div>
          <div className={glass.cardMetric}>
            <span className={glass.metricLabel}>Updated</span>
            <span className={`${glass.metricValue} ${glass.metricValueDate}`}>
              {updatedAt ? formatManilaDate(updatedAt) : "—"}
            </span>
            <span className={glass.metricHint}>last record change</span>
          </div>
        </div>

        <div className={glass.cardFoot}>
          <span className="inline-flex min-w-0 items-center gap-2">
            <StudentMascot
              name={row.name}
              seed={row.lrn}
              character={row.mascot ?? undefined}
              size={26}
            />
            <span className="truncate text-[12px] text-muted-foreground">
              {row.missing ? "No SF10 on file" : "SF10 record on file"}
            </span>
          </span>
          <div className={glass.cardActions} onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              onClick={onOpen}
              aria-label={`Open ${row.name}'s SF10`}
              title="Open SF10 record"
            >
              <Eye size={12} aria-hidden /> Open
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function TeacherSf10AccessPage() {
  const sectionsQuery = useAdvisorySections();
  const requestsQuery = useMyAccessRequests(true);
  const requests = React.useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);

  const ownedFirstSf10 = useMyFirstSf10Records();
  const ownedRows = React.useMemo(() => ownedFirstSf10.data ?? [], [ownedFirstSf10.data]);

  const activeRequest = React.useMemo(() => {
    if (requests.length === 0) return null;
    return (
      requests.find((r) => r.status === "approved") ??
      requests.find((r) => r.status === "pending") ??
      requests[0]
    );
  }, [requests]);

  const verification = useMyVerification(activeRequest?.id ?? null);

  const unionRequestIds = React.useMemo(
    () => [...new Set(requests.map((r) => r.id))],
    [requests],
  );
  const unionVerifications = useSf10Verifications(unionRequestIds);
  const grantedRows = React.useMemo(() => {
    const byLrn = new Map<string, HasRow>();
    for (const row of ownedRows) byLrn.set(row.lrn, row);
    for (const q of unionVerifications) {
      for (const row of q.data?.hasSf10 ?? []) {
        if (row.approved && !byLrn.has(row.lrn)) byLrn.set(row.lrn, row);
      }
    }
    return [...byLrn.values()];
  }, [ownedRows, unionVerifications]);

  // One card per learner: granted/owned records plus every missing advisee
  // across the section's requests (a record always wins over a missing mark).
  const deskRows = React.useMemo<Sf10DeskRow[]>(() => {
    const byLrn = new Map<string, Sf10DeskRow>();
    for (const row of grantedRows) {
      byLrn.set(row.lrn, {
        ...row,
        grantedTermNumber: row.grantedTermNumber ?? null,
        missing: false,
      });
    }
    unionRequestIds.forEach((id, index) => {
      const query = unionVerifications[index];
      const request = requests.find((r) => r.id === id);
      for (const missing of query?.data?.missingSf10 ?? []) {
        if (byLrn.has(missing.lrn)) continue;
        byLrn.set(missing.lrn, {
          lrn: missing.lrn,
          name: missing.name,
          mascot: missing.mascot,
          gradeLevel: missing.gradeLevel,
          section: missing.section,
          sectionId: request?.sectionId ?? "",
          record: null,
          sf10Status: "pending",
          grantedTermNumber: null,
          approved: false,
          missing: true,
        });
      }
    });
    return [...byLrn.values()].sort((a, b) => compareSurnameFirst(a.name, b.name));
  }, [grantedRows, unionRequestIds, unionVerifications, requests]);

  // Deep link from the topbar record search: `?lrn=…` prefilters the desk.
  // Lazy-initialised from the param (the pattern the other advisory desks use)
  // so no effect has to sync state after mount.
  const searchParams = useSearchParams();
  const verificationPending = !!activeRequest && verification.isPending;
  const [chatOpen, setChatOpen] = React.useState(false);
  const [scope, setScope] = React.useState<Scope>("all");
  const [search, setSearch] = React.useState(() => searchParams.get("lrn") ?? "");
  const [selectedLrn, setSelectedLrn] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // View-only: opens the file in a new tab rendered inline (never saved).
  const handleViewInNewTab = React.useCallback((fileUrl: string) => {
    if (!fileUrl) return;
    const target = isSpreadsheetUrl(fileUrl)
      ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`
      : fileUrl;
    const win = window.open(target, "_blank", "noopener,noreferrer");
    if (!win) {
      toast.error({ title: "Popup blocked", description: "Allow popups for this site, then try again." });
    }
  }, []);

  const queryClient = useQueryClient();
  const [downloading, setDownloading] = React.useState<{
    lrn: string;
    format: "xlsx" | "pdf";
  } | null>(null);
  const handleDownload = React.useCallback(
    async (row: Sf10DeskRow, format: "xlsx" | "pdf") => {
      setDownloading({ lrn: row.lrn, format });
      try {
        await downloadSf10Template(row.sectionId, row.lrn, format);
        toast.success({
          title: "SF10 downloaded",
          description: `${row.name} · ${format === "pdf" ? "PDF" : "Excel"}`,
        });
        queryClient.invalidateQueries({ queryKey: ["teacher-sf10-access"] });
      } catch (err) {
        toast.error({
          title: "Could not build the SF10",
          description: downloadErrorMessage(err),
        });
      } finally {
        setDownloading(null);
      }
    },
    [queryClient],
  );

  const counts = React.useMemo(() => {
    let auto = 0;
    let record = 0;
    let missing = 0;
    for (const row of deskRows) {
      if (row.missing) missing += 1;
      else record += 1;
      if (row.record?.autoFill) auto += 1;
    }
    return { auto, record, missing };
  }, [deskRows]);

  const scopedRows = React.useMemo(() => {
    if (scope === "auto") return deskRows.filter((r) => !!r.record?.autoFill);
    if (scope === "record") return deskRows.filter((r) => !r.missing);
    if (scope === "missing") return deskRows.filter((r) => r.missing);
    return deskRows;
  }, [deskRows, scope]);

  const visibleRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedRows;
    return scopedRows.filter((r) =>
      `${formatSurnameFirst(r.name)} ${r.name} ${r.lrn}`.toLowerCase().includes(q),
    );
  }, [scopedRows, search]);

  const selectedRow = React.useMemo(
    () => deskRows.find((r) => r.lrn === selectedLrn) ?? null,
    [deskRows, selectedLrn],
  );

  const unionCanAct =
    ownedRows.length > 0 ||
    unionVerifications.some((q) => q.data?.canDownload && q.data?.canEdit);

  const deniedRequests = React.useMemo(
    () => requests.filter((r) => r.status === "denied"),
    [requests],
  );

  if (sectionsQuery.isPending || requestsQuery.isPending || ownedFirstSf10.isPending) {
    return <Sf10PageSkeleton />;
  }

  const hasAdvisorySection = (sectionsQuery.data?.advisorySections.length ?? 0) > 0;
  if (sectionsQuery.isError || (!hasAdvisorySection && requests.length === 0)) {
    return (
      <section aria-label="SF10 access" className="flex min-w-0 flex-col gap-3">
        <TeacherEmptyCard
          centered
          icon={ShieldQuestion}
          title="No advisory section assigned"
          hint="No advisory section assigned, or it could not be loaded. Contact the school office."
          label="SF10 access"
        />
      </section>
    );
  }

  const grantsLoading = ownedFirstSf10.isPending || unionVerifications.some((q) => q.isPending);
  if (deskRows.length === 0 && deniedRequests.length === 0 && !grantsLoading) {
    return (
      <section aria-label="SF10 access" className="flex min-w-0 flex-col gap-3">
        <div className="flex h-full min-h-[calc(100dvh-9rem)] w-full flex-col items-center justify-center">
          <Sf10EmptyActions onRequest={() => setChatOpen(true)} />
        </div>
        <Sf10ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
      </section>
    );
  }

  return (
    <section aria-label="SF10 access" className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-lg border border-border"
            style={{
              backgroundColor: "color-mix(in oklch, var(--muted) 55%, transparent)",
              color: "color-mix(in oklch, #f59e0b 80%, var(--muted-foreground))",
            }}
            aria-hidden
          >
            <FileSpreadsheet size={16} />
          </span>
          <h2 className="m-0 text-base font-bold tracking-[-0.015em] text-foreground">
            SF10 access
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="h-7 px-2.5 text-xs"
            onClick={() => setChatOpen(true)}
          >
            <Send size={13} aria-hidden />
            Request access
          </Button>
        </div>
      </header>

      {deniedRequests.length > 0 ? (
        <RejectedRequestsCard requests={deniedRequests} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterTabs
          label="Filter learners by SF10 state"
          variant="tags"
          options={[
            {
              value: "all" as const,
              label: "All learners",
              count: deskRows.length,
              tone: "neutral" as const,
            },
            {
              value: "auto" as const,
              label: "Auto-filled",
              count: counts.auto,
              tone: "blue" as const,
            },
            {
              value: "record" as const,
              label: "On file",
              count: counts.record,
              tone: "green" as const,
            },
            {
              value: "missing" as const,
              label: "Missing",
              count: counts.missing,
              tone: "red" as const,
            },
          ]}
          value={scope}
          onChange={(next) => setScope(next)}
        />
        <TeacherSearchField
          className="ml-auto w-56 shrink-0 sm:w-64"
          placeholder="Search learners…"
          value={search}
          onChange={setSearch}
          aria-label="Filter learners"
          loading={grantsLoading || verificationPending}
        />
      </div>

      {deskRows.length === 0 ? (
        <div className="flex min-h-[calc(100dvh-11rem)] flex-col items-center justify-center">
          <PageEmptyCallout fit>
            {grantsLoading
              ? "Loading approved SF10 records…"
              : "No SF10 records for your advisory section yet."}
          </PageEmptyCallout>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="flex min-h-[10rem] w-full justify-center">
          <InsightCallout role="status" className="w-full max-w-xl text-left">
            {searchEmptyMessage(search, "learners")}
          </InsightCallout>
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(264px,1fr))]">
          {visibleRows.map((row, index) => (
            <Sf10RecordCard
              key={row.lrn}
              row={row}
              index={index}
              selected={row.lrn === selectedLrn}
              onOpen={() => {
                setSelectedLrn(row.lrn);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {grantsLoading ? (
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          Loading approved SF10 records…
        </p>
      ) : null}

      <Sf10AccessDrawer
        key={selectedRow?.lrn ?? "closed"}
        row={selectedRow}
        open={drawerOpen && selectedRow !== null}
        onClose={() => setDrawerOpen(false)}
        canAct={!!unionCanAct}
        onDownload={handleDownload}
        downloading={downloading}
        onView={handleViewInNewTab}
      />
      <Sf10ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </section>
  );
}
