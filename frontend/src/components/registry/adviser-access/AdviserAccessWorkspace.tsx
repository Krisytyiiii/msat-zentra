"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  FileSearch,
  Loader2,
  Megaphone,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { StatDeck } from "@/components/ui/stat-deck";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { useAdviserAccessCheck } from "@/components/shared/adviser-access/adviser-access-check-context";
import { apiClient } from "@/lib/api/client";
import type { RegistryDesk } from "@/services/registry/overview.service";
import type {
  AdviserAccessRequest,
} from "@/components/shared/adviser-access/adviser-access-types";
import {
  getStudentListStats,
  mergeConfirmedMarks,
} from "@/components/shared/adviser-access/adviser-access-types";
import { ZentraEmptyCard } from "@/components/shared/zentra-empty-card/ZentraEmptyCard";
import { Sf10RequestsRail } from "./Sf10RequestsRail";
import { RequestStudentsOverlay } from "./RequestStudentsOverlay";
import { AccessWorkbench, type StatusFilter } from "./AccessWorkbench";
import {
  AdviserAccessDeckSkeleton,
  AdviserAccessStripSkeleton,
  AdviserAccessWorkbenchSkeleton,
} from "./AccessWorkbenchSkeleton";
import styles from "./adviser-access.module.css";

type RequestsResponse = { requests: AdviserAccessRequest[] };

/** Banded desk endpoint — the registrar reads G11–12, the record keeper G7–10. */
const ENDPOINT: Record<RegistryDesk, string> = {
  registrar: "/api/registrar/adviser-access-requests",
  "record-keeper": "/api/record-keeper/adviser-access-requests",
};

/** Realtime channels invalidate these keys, so each desk keeps its own cache. */
const QUERY_KEY: Record<RegistryDesk, string> = {
  registrar: "registrar-adviser-access",
  "record-keeper": "record-keeper-adviser-access",
};

/** Grade band each desk owns — only the copy changes between the two. */
const BAND: Record<RegistryDesk, { range: string; title: string }> = {
  registrar: { range: "11–12", title: "Grades 11–12" },
  "record-keeper": { range: "7–10", title: "Grades 7–10" },
};

interface StatItem {
  key: "pendingChecking" | "approved" | "reportedMissing" | "totalRequested";
  icon: LucideIcon;
  label: string;
  unit: string;
  hint: string;
  count: number;
}

export function AdviserAccessWorkspace({ desk }: { desk: RegistryDesk }) {
  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: [QUERY_KEY[desk]],
    queryFn: () =>
      apiClient
        .get<RequestsResponse>(ENDPOINT[desk])
        .then((res) => mergeConfirmedMarks(res.data.requests)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const { checkAll, checkingId } = useAdviserAccessCheck();

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  // Card click opens a read-only learner overlay; it never scopes the workbench.
  const [openRequestId, setOpenRequestId] = React.useState<string | null>(null);

  const requests = React.useMemo(() => data ?? [], [data]);
  const pendingRequests = React.useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );

  const stats = React.useMemo(() => getStudentListStats(pendingRequests), [pendingRequests]);

  const uncheckedIds = React.useMemo(
    () => pendingRequests.filter((r) => !r.checkedAt).map((r) => r.id),
    [pendingRequests],
  );

  // Request cards: resolved = any per-student decision recorded.
  const requestCards = React.useMemo(
    () =>
      pendingRequests.map((r) => {
        const total = r.affectedAdvisees.length;
        const decided =
          (r.approvedLrns?.length ?? 0) + (r.reportedMissingLrns?.length ?? 0);
        return {
          request: r,
          total,
          decided,
          attached: r.summary?.has ?? r.affectedAdvisees.filter((a) => a.hasRecord).length,
          checked: !!r.checkedAt,
        };
      }),
    [pendingRequests],
  );

  const runChecks = () => {
    if (uncheckedIds.length === 0) return;
    checkAll(desk, uncheckedIds);
  };

  const checking = checkingId !== null;

  const kpis: StatItem[] = [
    {
      key: "pendingChecking",
      icon: Clock,
      label: "Unchecked learners",
      unit: "to check",
      hint: "Awaiting the SF10 check",
      count: stats.pendingChecking,
    },
    {
      key: "approved",
      icon: CheckCircle2,
      label: "Approved",
      unit: "granted",
      hint: "Access granted per learner",
      count: stats.approved,
    },
    {
      key: "reportedMissing",
      icon: Megaphone,
      label: "Reported missing",
      unit: "reported",
      hint: "No record — adviser notified",
      count: stats.reportedMissing,
    },
    {
      key: "totalRequested",
      icon: Users,
      label: "Total requested",
      unit: "learners",
      hint: "Learners across pending requests",
      count: stats.totalRequested,
    },
  ];

  const shareBase = Math.max(1, stats.totalRequested);
  const kpiActive = (key: StatItem["key"]) =>
    (key === "totalRequested" && statusFilter === "all") ||
    (key === "pendingChecking" && statusFilter === "pendingChecking") ||
    (key === "approved" && statusFilter === "approved") ||
    (key === "reportedMissing" && statusFilter === "reported");

  const onKpiClick = (key: StatItem["key"]) => {
    const next: StatusFilter =
      key === "totalRequested"
        ? "all"
        : key === "pendingChecking"
          ? "pendingChecking"
          : key === "approved"
            ? "approved"
            : "reported";
    setStatusFilter(next);
  };

  const hero = (
    <header className={styles.hero}>
      <div className={styles.heroMain}>
        <h1 className={styles.heroTitle}>Adviser access</h1>
        <p className={styles.heroSubtitle}>
          Review every {BAND[desk].title} adviser request in one workbench — run the
          SF10 check, then approve or report each learner.
        </p>
      </div>
      <div className={styles.heroSide}>
        <Button
          type="button"
          size="sm"
          className="h-6 px-2.5 text-[12px] font-medium"
          onClick={runChecks}
          disabled={checking || uncheckedIds.length === 0}
          title={
            uncheckedIds.length === 0
              ? "Every pending request is already checked"
              : "Run the SF10 check for every unchecked request"
          }
        >
          {checking ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <FileSearch size={13} aria-hidden />
          )}
          {checking
            ? "Checking…"
            : uncheckedIds.length > 0
              ? `Run SF10 check (${uncheckedIds.length})`
              : "All requests checked"}
        </Button>
      </div>
    </header>
  );

  if (isError) {
    return (
      <section className={styles.page}>
        <div className={styles.layout}>
          <div className={styles.stack}>
            {hero}
            <div className={styles.errorCard} role="alert">
              Failed to load access requests. Refresh to try again.
            </div>
          </div>
          <Sf10RequestsRail desk={desk} />
        </div>
      </section>
    );
  }

  if (isPending) {
    return (
      <section className={styles.page}>
        <div className={styles.layout}>
          <div className={styles.stack}>
            {hero}
            <AdviserAccessDeckSkeleton />
            <AdviserAccessStripSkeleton />
            <AdviserAccessWorkbenchSkeleton />
          </div>
          <Sf10RequestsRail desk={desk} />
        </div>
      </section>
    );
  }

  if (pendingRequests.length === 0) {
    return (
      <section className={styles.page}>
        <div className={styles.layout}>
          <div className={styles.stack}>
            {hero}
            <ZentraEmptyCard
              icon={ShieldCheck}
              title="No adviser access requests"
              hint={`No pending adviser access requests for grades ${BAND[desk].range}. New requests appear here in real time.`}
              label="No access requests"
              centered
            />
          </div>
          <Sf10RequestsRail desk={desk} />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.stack}>
          {hero}

          <StatDeck
            title="Access requests at a glance"
            icon={FileSearch}
            ariaLabel="Access request stats"
            items={kpis.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
              unit: item.unit,
              hint: item.hint,
              value: item.count,
              meter: Math.round((item.count / shareBase) * 100),
              onClick: () => onKpiClick(item.key),
              active: kpiActive(item.key),
              ariaLabel: `${item.label}: ${item.count} ${item.unit} — filter the workbench`,
            }))}
          />

          <section className={styles.requestStrip} aria-label="Pending adviser requests">
            <div className={styles.stripHead}>
              <span className={styles.stripTitle}>
                Pending requests
                <span className={styles.stripCount}>{requestCards.length}</span>
              </span>
            </div>
            <div className={styles.requestCards}>
              {requestCards.map(({ request: r, total, decided, attached, checked }) => {
                const active = openRequestId === r.id;
                const pct = total > 0 ? Math.round((decided / total) * 100) : 0;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`${styles.requestCard} ${active ? styles.requestCardActive : ""}`}
                    aria-haspopup="dialog"
                    onClick={() => setOpenRequestId(r.id)}
                    title={`${r.adviserName}, ${r.section} — click to view this request's learners`}
                  >
                    <span className={styles.requestCardHead}>
                      <StudentMascot name={r.adviserName} seed={r.adviserId} size={28} />
                      <span className={styles.requestCardWho}>
                        <span className={styles.requestCardName} title={r.adviserName}>
                          {r.adviserName}
                        </span>
                        <span className={styles.requestCardMeta}>
                          {r.section}, {r.gradeLevel}
                        </span>
                      </span>
                      <Pill tone={checked ? "green" : "amber"} label="SF10 check">
                        {checked ? "Checked" : "Unchecked"}
                      </Pill>
                    </span>
                    <span className={styles.requestCardReason} title={r.reason}>
                      {r.reason}
                    </span>
                    <span className={styles.progress}>
                      <span className={styles.progressFill} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={styles.requestCardFoot}>
                      <span>
                        {decided} of {total} decided
                      </span>
                      <span className={styles.requestCardAttached}>{attached} attached</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <AccessWorkbench
            desk={desk}
            requests={pendingRequests}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            isFetching={isFetching}
          />
        </div>
        <Sf10RequestsRail desk={desk} />
      </div>

      <RequestStudentsOverlay
        request={requestCards.find((c) => c.request.id === openRequestId)?.request ?? null}
        onClose={() => setOpenRequestId(null)}
      />
    </section>
  );
}
