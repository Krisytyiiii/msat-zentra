"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ShieldQuestion } from "lucide-react";
import { useLiveQueries } from "@/lib/api/live";
import { TeacherEmptyCard } from "../../components/TeacherEmptyCard";
import { toast } from "@/components/ui/sonner";
import { useAdvisorySections } from "@/services/teacher/advisory.service";
import {
  fetchMyVerification,
  useMyAccessRequests,
  useMyVerification,
  type HasRow,
} from "@/services/teacher/sf10Access.service";
import { Sf10RepoFolders } from "./components/Sf10RepoFolders";
import { Sf10EmptyActions } from "./components/Sf10EmptyActions";
import { Sf10ChatDrawer } from "./components/Sf10ChatDrawer";
import { RejectedRequestsCard, Sf10MissingCard } from "./components/Sf10SideRail";
import { Sf10PageSkeleton } from "./components/Sf10PageSkeleton";
import styles from "./components/sf10-repo.module.css";

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

export default function TeacherSf10AccessPage() {
  // The section list is a single cheap lookup; the old gate used the full
  // advisory roster (finals + attendance + anecdote per student), which was
  // the slowest call on the page and only served as "do I have a section?".
  const sectionsQuery = useAdvisorySections();
  // Requests don't depend on the section list — start them immediately so the
  // two calls run in parallel instead of chaining.
  const requestsQuery = useMyAccessRequests(true);
  const requests = React.useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);

  const activeRequest = React.useMemo(() => {
    if (requests.length === 0) return null;
    return (
      requests.find((r) => r.status === "approved") ??
      requests.find((r) => r.status === "pending") ??
      requests[0]
    );
  }, [requests]);

  const verification = useMyVerification(activeRequest?.id ?? null);

  // One kanban board across EVERY request for the section: a repeat request
  // (nth time, any status) unions its granted folders here, so an earlier
  // board is never hidden behind the newest request. Grants are per-student
  // (bulk "approve all" leaves the request pending), and only rows flagged
  // approved are collected. Nothing is deleted — the server only inserts
  // requests and grants additively.
  const unionRequestIds = React.useMemo(
    () => [...new Set(requests.map((r) => r.id))],
    [requests],
  );
  const unionVerifications = useLiveQueries({
    queries: unionRequestIds.map((id) => ({
      queryKey: ["teacher-sf10-access", id, "records"],
      queryFn: () => fetchMyVerification(id),
      staleTime: 30_000,
    })),
  });
  const grantedRows = React.useMemo(() => {
    const byLrn = new Map<string, HasRow>();
    for (const q of unionVerifications) {
      for (const row of q.data?.hasSf10 ?? []) {
        if (row.approved && !byLrn.has(row.lrn)) byLrn.set(row.lrn, row);
      }
    }
    return [...byLrn.values()];
  }, [unionVerifications]);
  const verificationPending = !!activeRequest && verification.isPending;
  const foldersPending = verificationPending;
  const foldersError = !!activeRequest && verification.isError;
  const [query, setQuery] = React.useState("");
  const [chatOpen, setChatOpen] = React.useState(false);

  // Deep link from the topbar record search: `?lrn=…` prefilters the desk.
  const searchParams = useSearchParams();
  const lrnParam = searchParams.get("lrn");
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link landing sync
    if (lrnParam) setQuery(lrnParam);
  }, [lrnParam]);

  // View-only: opens the file in a new tab rendered inline (never saved).
  // Public storage URLs carry the upload content type and serve inline, so a
  // synchronous direct open renders PDFs/images in the tab — no fetch, no
  // download. Spreadsheets can't render natively, so they go through the
  // Office viewer. Synchronous so popup blockers allow it (the old
  // open-blank-then-fetch dance left about:blank tabs behind blockers).
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

  const missingRows = React.useMemo(
    () => verification.data?.missingSf10 ?? [],
    [verification.data],
  );
  const deniedRequests = React.useMemo(
    () => requests.filter((r) => r.status === "denied"),
    [requests],
  );
  const matchesQuery = React.useCallback(
    (lrn: string, name: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return lrn.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    },
    [query],
  );
  // Folder UI: every student granted SF10 read across all requests.
  const approvedFolders = React.useMemo(
    () => grantedRows.filter((r) => matchesQuery(r.lrn, r.name)),
    [grantedRows, matchesQuery],
  );
  // Viewable when any contributing request grants download/edit (identical
  // to the active request in the single-request case).
  const unionCanAct = unionVerifications.some(
    (q) => q.data?.canDownload && q.data?.canEdit,
  );
  const filteredMissing = React.useMemo(
    () => missingRows.filter((r) => matchesQuery(r.lrn, r.name)),
    [missingRows, matchesQuery],
  );

  if (sectionsQuery.isPending || requestsQuery.isPending) {
    return <Sf10PageSkeleton />;
  }

  const hasAdvisorySection =
    (sectionsQuery.data?.advisorySections.length ?? 0) > 0;
  if (sectionsQuery.isError || (!hasAdvisorySection && requests.length === 0)) {
    return (
      <section className={styles.page} aria-label="SF10 access">
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

  // True empty desk: no granted folders, no rejected requests and no learners
  // missing an SF10 record. Nothing to lay out — show one centered callout with
  // the Bama shortcut stacked beneath it (same 24px pill as the referrals desk).
  // Skipped while a grant lookup is still resolving so the empty state never
  // flashes over data on its way in.
  const grantsLoading = unionVerifications.some((q) => q.isPending);
  if (
    grantedRows.length === 0 &&
    deniedRequests.length === 0 &&
    missingRows.length === 0 &&
    !grantsLoading
  ) {
    return (
      <section className={styles.page} aria-label="SF10 access">
        <div className="flex h-full min-h-[calc(100dvh-9rem)] w-full flex-col items-center justify-center">
          <Sf10EmptyActions onRequest={() => setChatOpen(true)} />
        </div>
        <Sf10ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
      </section>
    );
  }

  return (
    <section className={styles.page} aria-label="SF10 access">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={`${styles.main} flex min-w-0 flex-col`}>
          <Sf10RepoFolders
            rows={approvedFolders}
            query={query}
            onQueryChange={setQuery}
            canAct={unionCanAct}
            pending={foldersPending}
            error={foldersError}
            denied={activeRequest?.status === "denied"}
            onOpen={handleViewInNewTab}
            onRequest={() => setChatOpen(true)}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:hidden">
        <RejectedRequestsCard requests={deniedRequests} />
        <Sf10MissingCard rows={filteredMissing} pending={verificationPending} />
      </div>
      <Sf10ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </section>
  );
}
