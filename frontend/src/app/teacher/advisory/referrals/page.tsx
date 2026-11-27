"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ReferralCancelDialog } from "./components/ReferralActionDialogs";
import { ReferralFormDialog } from "./components/ReferralFormDialog";
import { useReferralSubmitDock } from "@/components/shared/referral-submit/referral-submit-dock-context";
import type { ReferFormSeed } from "./components/refer-form";
import { useMyReferrals } from "./components/use-my-referrals";
import { useReferralCancel } from "./components/use-referral-cancel";
import { ReferralsTable } from "./components/referrals-table";
import { ReferralsSkeleton } from "./components/ReferralsSkeleton";
import refStyles from "./components/referrals.module.css";

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
    type,
    setType,
    counts,
    referralsQuery,
    referrals,
    total,
    page,
    setPage,
  } = useMyReferrals(highlightId);
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
  // The ADM desk lands here with ?new=adm. On a client-side navigation
  // useSearchParams can resolve one render late, so the lazy initializer above
  // is only the fast path — open the drawer once the param actually arrives.
  // The ref keeps it one-shot, so closing the drawer is never undone.
  const autoOpened = React.useRef(Boolean(autoOpen));
  React.useEffect(() => {
    if (autoOpened.current || !autoOpen) return;
    autoOpened.current = true;
    setReferralSeed({ typeKey: autoOpen === "adm" ? "adm" : undefined });
  }, [autoOpen]);
  // Bottom-right submit dock lives at root level (survives page navigation).
  const submitDock = useReferralSubmitDock();

  return (
    <section className={refStyles.page}>
      <ReferralsTable
        referrals={referrals}
        counts={counts}
        type={type}
        onTypeChange={setType}
        query={query}
        onQueryChange={setQuery}
        appliedQuery={appliedQuery}
        highlightId={highlightId}
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
        onRequestCancel={requestCancel}
        onNewReferral={() => setReferralSeed({})}
      />
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
          <ReferralsSkeleton />
        </section>
      }
    >
      <TeacherAdvisoryReferralsPageWithHighlight />
    </React.Suspense>
  );
}
