"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { GuidanceReferralsView } from "../components/guidance-referrals-view";
import { GuidanceReferralsSkeleton } from "../components/GuidanceReferralsSkeleton";
import styles from "../components/guidance-referrals.module.css";

function GuidanceAdmReferralsView() {
  const params = useSearchParams();
  const highlightId = params.get("highlight");
  return (
    <GuidanceReferralsView
      lockedType="ADM"
      title="ADM Cases"
      highlightId={highlightId}
    />
  );
}

export default function GuidanceAdmReferralsPage() {
  return (
    <React.Suspense
      fallback={
        <section className={styles.page}>
          <GuidanceReferralsSkeleton lockType table />
        </section>
      }
    >
      <GuidanceAdmReferralsView />
    </React.Suspense>
  );
}
