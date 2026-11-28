"use client";

import { useEffect, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCallout } from "@/components/ui/insight-callout";
import { GuidanceEmptyState } from "../../components/GuidanceEmptyCard";
import { GuidanceReferralsToolbar } from "./guidance-referrals-toolbar";
import { GuidanceReferralsDialogsHost } from "./guidance-referrals-dialogs-host";
import { useGuidanceReferralsFilter } from "./use-guidance-referrals-filter";
import type {
  GuidanceReferralItem,
  GuidanceReferralsSummary,
} from "@/services/guidance/guidance.types";
import {
  GuidanceReferralDialogs,
} from "./GuidanceReferralDialogs";
import { useGuidanceReferralActions } from "./use-guidance-referral-actions";
import {
  GuidanceReferralEntry,
} from "./GuidanceReferralEntry";
import { GuidanceCaseKanbanCard } from "./GuidanceCaseKanbanCard";
import { GuidanceCasesTable } from "./guidance-cases-table";
import { GuidanceActionTabs } from "./GuidanceActionTabs";
import type { AdmReviewDraft } from "@/components/adm-review/AdmReviewDialog";
import { GuidanceActionMenu } from "./GuidanceActionMenu";
import {
  GUIDANCE_TYPES,
  type GuidanceAction,
  type GuidanceTypeFilter,
} from "./guidance-referrals-format";
import { Pagination } from "@/components/shared/pagination";

import styles from "./guidance-referrals-table.module.css";

export {
  combineDateTime,
  formatDateTime,
  formatTime,
  sessionTypeLabel,
  toDateInputValue,
  toTimeInputValue,
  SESSION_KIND_OPTIONS,
} from "./guidance-referrals-format";

function Busy({ busy }: { busy: boolean }) {
  if (!busy) return null;
  return <Loader2 className={styles.spin} aria-hidden="true" />;
}

function ScrollHint({ count }: { count: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => {
      if (count === 0) {
        setVisible(false);
        return;
      }
      const el = document.documentElement;
      const scrollable = el.scrollHeight - window.innerHeight > 40;
      const atBottom =
        window.innerHeight + window.scrollY >= el.scrollHeight - 80;
      setVisible(scrollable && !atBottom);
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const t1 = window.setTimeout(update, 0);
    const t2 = window.setTimeout(update, 500);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [count]);
  if (!visible) return null;
  return (
    <div className={styles.scrollHint} aria-hidden="true">
      <span className={styles.scrollHintPill}>
        Scroll for more
        <span className={styles.scrollHintArrow}>↓</span>
      </span>
    </div>
  );
}

export function GuidanceReferralsTable({
  referrals,
  summary,
  page = 1,
  pageSize = 0,
  total,
  onPageChange,
  query,
  onQueryChange,
  typeFilter,
  onTypeChange,
  action,
  onActionChange,
  onRetry,
  isRetrying,

  paginate = true,
  lockType = false,
  title = "Referrals to me",
  highlightId = null,
  layout = "list",
}: GuidanceReferralsTableProps) {
  const {
    dialogs,
    form,
    setForm,
    activeRow,
    activeSession,
    openDialog,
    openSessionDialog,
    closeDialog,
    mutation,
    handleAction,
    resolveCase,
    isActionPending,
    busyRowId,
    invalidateGuidance,
  } = useGuidanceReferralActions(referrals);

  const [previewId, setPreviewId] = useState<string | null>(null);

  const [privacyFor, setPrivacyFor] = useState<string | null>(null);

  const [endorsedFor, setEndorsedFor] = useState<string | null>(null);

  const [reviewAdmFor, setReviewAdmFor] = useState<GuidanceReferralItem | null>(null);
  const [formSheet, setFormSheet] = useState<{
    row: GuidanceReferralItem;
    draft: AdmReviewDraft;
  } | null>(null);

  const goToPage = (next: number) => onPageChange?.(next);
  const isKanban = layout === "kanban";
  /* ADM is a data list now; it keeps the board chrome (desk head, figures,
     action tabs) but renders rows instead of folder cards. */
  const isTable = layout === "table";
  const isBoard = isKanban || isTable;
  const hasActiveFilters =
    query.trim() !== "" || action !== "" || (!lockType && typeFilter !== "");

  const { now } = useGuidanceReferralsFilter({ referrals, highlightId });
  const typeFilterLabel =
    GUIDANCE_TYPES.find((t) => t.value === typeFilter)?.label ?? "All types";

  function clearFilters() {
    onQueryChange("");
    onActionChange("");
    onTypeChange(lockType ? typeFilter : "");
  }

  return (
    <div className={styles.layout}>
      <div
        className={`${styles.feed} ${styles.layoutFeed}${isBoard ? ` ${styles.feedWide}` : ""}`}
      >
        {isBoard ? null : <h1 className={styles.srOnly}>Cases sent to guidance</h1>}
        {!lockType && (
          <GuidanceReferralsToolbar
            title={title}
            query={query}
            onQueryChange={onQueryChange}
            typeFilter={typeFilter}
            onTypeChange={onTypeChange}
            onActionChange={onActionChange}
            onPageChange={goToPage}
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
            typeFilterLabel={typeFilterLabel}
          />
        )}

        {isBoard ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GuidanceActionTabs
              action={action}
              summary={summary}
              track={typeFilter === "ADM" ? "ADM" : "Counseling"}
              onPick={(value) => {
                onActionChange(action === value ? "" : value);
                goToPage(1);
              }}
              onClear={() => {
                onActionChange("");
                goToPage(1);
              }}
            />
          </div>
        ) : null}

      {mutation.isError && (
        <div className={styles.errorBlock} role="alert">
          <p className={styles.errorText}>
            Sorry — that change did not go through. Please try again.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isRetrying}
            onClick={() => onRetry()}
          >
            <Busy busy={isRetrying} />
            {isRetrying ? "Loading…" : "Try again"}
          </Button>
        </div>
      )}
      {referrals.length === 0 ? (
        hasActiveFilters ? (
          <div className={styles.emptyCenter}>
            <InsightCallout role="status" className="w-full max-w-xl text-left">
              {query.trim() !== ""
                ? `No cases on this page match “${query.trim()}”.`
                : "No cases on this page match your filters."}
            </InsightCallout>
          </div>
        ) : (
          <GuidanceEmptyState
            icon={Inbox}
            title="You're all caught up"
            hint="New cases sent to you by advisers will appear here."
          />
        )
      ) : isTable ? (
        <GuidanceCasesTable
          referrals={referrals}
          now={now}
          highlightId={highlightId}
          actionPending={isActionPending}
          onBookSession={(row) => openDialog(row.id, "schedule")}
          onPreview={setPreviewId}
          onPrivacy={setPrivacyFor}
          onEndorsedNotice={setEndorsedFor}
          onOpenSession={(referralId, session, dialog) =>
            openSessionDialog(referralId, session, dialog)
          }
          onChanged={() => {
            invalidateGuidance();
          }}
        />
      ) : isKanban ? (
        <div className={styles.kanbanGrid} role="list" aria-label={title}>
          {referrals.map((row) => (
            <GuidanceCaseKanbanCard
              key={row.id}
              row={row}
              now={now}
              highlighted={highlightId !== null && highlightId === row.id}
              actionPending={isActionPending}
              onReviewAdm={setReviewAdmFor}
              onReviewCounseling={(row) => openDialog(row.id, "accept")}
              onBookSession={(row) => openDialog(row.id, "schedule")}
              onPreview={setPreviewId}
              onPrivacy={setPrivacyFor}
              onEndorsedNotice={setEndorsedFor}
              onOpenSession={(referralId, session, dialog) =>
                openSessionDialog(referralId, session, dialog)
              }
              onChanged={() => {
                invalidateGuidance();
              }}
            />
          ))}
        </div>
      ) : (
        <ol className={styles.timeline}>
          {referrals.map((row) => (
            <GuidanceReferralEntry
              key={row.id}
              row={row}
              now={now}
              highlighted={highlightId !== null && highlightId === row.id}
              actionPending={busyRowId !== null && busyRowId === row.id}
              onOpenDialog={(referralId, dialog) => openDialog(referralId, dialog)}
              onOpenSession={(referralId, session, dialog) =>
                openSessionDialog(referralId, session, dialog)
              }
              onPreview={setPreviewId}
              onPrivacy={setPrivacyFor}
              onEndorsedNotice={setEndorsedFor}
              onReviewAdm={setReviewAdmFor}
              onChanged={() => {
                invalidateGuidance();
              }}
            />
          ))}
        </ol>
      )}

      {paginate ? (
        referrals.length > 0 ? (
          <Pagination
            currentPage={page}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={goToPage}
          />
        ) : null
      ) : (
        <ScrollHint count={total} />
      )}
      </div>

      {isBoard ? null : (
        <GuidanceActionMenu
          action={action}
          summary={summary}
          typeFilter={typeFilter}
          showCancelled={lockType}
          onPick={(value) => {
            onActionChange(action === value ? "" : value);
            goToPage(1);
          }}
          onClear={() => onActionChange("")}
        />
      )}

      <GuidanceReferralDialogs
        dialogs={dialogs}
        form={form}
        setForm={setForm}
        activeRow={activeRow}
        activeSession={activeSession}
        isActionPending={isActionPending}
        mutationIsPending={mutation.isPending}
        closeDialog={closeDialog}
        handleAction={handleAction}
        onResolveCase={resolveCase}
      />
      <GuidanceReferralsDialogsHost
        previewId={previewId}
        onPreviewClose={() => setPreviewId(null)}
        privacyFor={privacyFor}
        onPrivacyClose={() => setPrivacyFor(null)}
        endorsedFor={endorsedFor}
        onEndorsedClose={() => setEndorsedFor(null)}
        reviewAdmFor={reviewAdmFor}
        onReviewClose={() => setReviewAdmFor(null)}
        onReviewChanged={() => {
          invalidateGuidance();
        }}
        onCreateReferral={(draft) => {
          if (reviewAdmFor) setFormSheet({ row: reviewAdmFor, draft });
        }}
        formSheet={formSheet}
        onFormSheetClose={() => setFormSheet(null)}
        onFormSheetChanged={() => {
          invalidateGuidance();
        }}
      />
    </div>
  );
}

interface GuidanceReferralsTableProps {
  referrals: GuidanceReferralItem[];
  summary: GuidanceReferralsSummary | null;
  page?: number;
  pageSize?: number;
  total: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  paginate?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  typeFilter: GuidanceTypeFilter;
  onTypeChange: (value: GuidanceTypeFilter) => void;
  action: GuidanceAction;
  onActionChange: (value: GuidanceAction) => void;
  onRetry: () => void;
  isRetrying: boolean;

  lockType?: boolean;
  title?: string;

  layout?: "list" | "kanban" | "table";

  highlightId?: string | null;

  unfilteredTotal?: number;
}
