"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { GuidanceReferralsView } from "../components/guidance-referrals-view";
import { GuidanceReferralsSkeleton } from "../components/GuidanceReferralsSkeleton";
import styles from "../components/guidance-referrals.module.css";

function GuidanceCounselingReferralsView() {
  const params = useSearchParams();
  const highlightId = params.get("highlight");
  return (
    <GuidanceReferralsView
      lockedType="Counseling"
      title="Counseling Cases"
      highlightId={highlightId}
    />
  );
}

export default function GuidanceCounselingReferralsPage() {
  return (
    <React.Suspense
      fallback={
        <section className={styles.page}>
          <GuidanceReferralsSkeleton lockType />
        </section>
      }
    >
      <GuidanceCounselingReferralsView />
    </React.Suspense>
  );
}
