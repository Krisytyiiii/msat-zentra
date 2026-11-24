"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ReferralCancelDialog,
} from "./components/ReferralActionDialogs";
import { ReferralFormDialog } from "./components/ReferralFormDialog";
import { useReferralSubmitDock } from "@/components/shared/referral-submit/referral-submit-dock-context";
import type { TrackableReferral } from "./components/ReferralTrackDialog";
import { ReferralTrackRail } from "./components/ReferralTrackRail";
import { typeForDesk } from "./components/referral-types";
import type { ReferFormSeed } from "./components/refer-form";
import { useMyReferrals, type ReferralRow } from "./components/use-my-referrals";
import { useReferralCancel } from "./components/use-referral-cancel";
import { ReferralsTable, statusBadge } from "./components/referrals-table";
import { ReferralRailSkeleton, ReferralsSkeleton } from "./components/ReferralsSkeleton";
import refStyles from "./components/referrals.module.css";

/** Map a casebook row onto the tracking rail's shape. */
function toTrackable(r: ReferralRow): TrackableReferral {
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

function TeacherAdvisoryReferralsView({
  highlightId,
  autoOpen,
}: {
  highlightId: string | null;
  /** `?new=adm` from the ADM desk — opens the form with the ADM type picked. */
  autoOpen?: string | null;
}) {
  const {
    query,
    setQuery,
    appliedQuery,
    status,
    setStatus,
    counts,
    referralsQuery,
    referrals,
    total,
    page,
    setPage,
  } = useMyReferrals(highlightId);
  const [selectedId, setSelectedId] = React.useState<string | null>(highlightId);
  const {
    cancelTarget,
    setCancelTarget,
    cancelReason,
    setCancelReason,
    cancelPending,
    actionError,
    setActionError,
    requestCancel,
    confirmCancel,
  } = useReferralCancel();
  const [referralSeed, setReferralSeed] = React.useState<ReferFormSeed | null>(() =>
    autoOpen ? { typeKey: autoOpen === "adm" ? "adm" : undefined } : null,
  );
  // Bottom-right submit dock lives at root level (survives page navigation).
  const submitDock = useReferralSubmitDock();

  // Selected case, falling back to the deep-linked row, then the first card —
  // the rail always has something to follow on a populated desk.
  const activeRow =
    referrals.find((r) => r.id === selectedId) ??
    referrals.find((r) => r.id === highlightId) ??
    referrals[0] ??
    null;
  const activeReferral = React.useMemo(
    () => (activeRow ? toTrackable(activeRow) : null),
    [activeRow],
  );
  const handleTrack = React.useCallback((r: ReferralRow) => {
    setSelectedId(r.id);
  }, []);
  return (
    <section className={refStyles.page}>
      <div className={refStyles.splitLayout}>
        <div className={refStyles.splitMain}>
          <ReferralsTable
            referrals={referrals}
            counts={counts}
            status={status}
            onStatusChange={setStatus}
            query={query}
            onQueryChange={(v) => {
              setQuery(v);
            }}
            appliedQuery={appliedQuery}
            highlightId={highlightId}
            selectedId={activeRow?.id ?? null}
            referralsQuery={{
              isPending: referralsQuery.isPending,
              isError: referralsQuery.isError,
              isFetching: referralsQuery.isFetching,
              isPlaceholderData: referralsQuery.isPlaceholderData,
              refetch: () => void referralsQuery.refetch(),
            }}
            page={page}
            totalItems={total}
            onPageChange={setPage}
            onTrack={handleTrack}
            onRequestCancel={requestCancel}
            onNewReferral={() => setReferralSeed({})}
          />
        </div>
        {referralsQuery.isPending ? (
          <ReferralRailSkeleton />
        ) : (
          <ReferralTrackRail
            key={activeReferral?.id ?? "empty"}
            referral={activeReferral}
          />
        )}
      </div>
      <ReferralFormDialog
        open={referralSeed !== null}
        onClose={() => setReferralSeed(null)}
        seed={referralSeed}
        onSubmitStart={submitDock.startSubmit}
        onSubmitEnd={submitDock.finishSubmit}
      />
      <ReferralCancelDialog
        target={cancelTarget}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        pending={cancelPending}
        error={actionError}
        onClose={() => {
          if (!cancelPending) {
            setCancelTarget(null);
            setActionError(null);
          }
        }}
        onConfirm={confirmCancel}
      />
    </section>
  );
}
function TeacherAdvisoryReferralsPageWithHighlight() {
  const params = useSearchParams();
  return (
    <TeacherAdvisoryReferralsView
      highlightId={params.get("highlight")}
      autoOpen={params.get("new")}
    />
  );
}
export default function TeacherAdvisoryReferralsPage() {
  return (
    <React.Suspense
      fallback={
        <section className={refStyles.page} aria-busy="true">
          <div className={refStyles.splitLayout}>
            <div className={refStyles.splitMain}>
              <ReferralsSkeleton />
            </div>
            <ReferralRailSkeleton />
          </div>
        </section>
      }
    >
      <TeacherAdvisoryReferralsPageWithHighlight />
    </React.Suspense>
  );
}
