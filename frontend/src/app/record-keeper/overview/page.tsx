"use client";

import { useQuery } from "@tanstack/react-query";
import { Sf10AttachFeed } from "@/components/registry/overview/Sf10AttachFeed";
import { FinalGradeApprovals } from "@/components/registry/overview/FinalGradeApprovals";
import { RegistryAttentionDeck } from "@/components/registry/overview/RegistryAttentionDeck";
import { RegistryGradePanel } from "@/components/registry/overview/RegistryGradePanel";
import { RegistryRequestsPanel } from "@/components/registry/overview/RegistryRequestsPanel";
import { RegistryRecordsLedger } from "@/components/registry/overview/RegistryRecordsLedger";
import { RegistryOverviewSkeleton } from "@/components/registry/overview/RegistryOverviewSkeleton";
import { registryOverviewQuery } from "@/components/registry/overview/registryOverviewQuery";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import styles from "./components/overview.module.css";

export default function RecordKeeperOverviewPage() {
  // Same key every widget reads, so this only observes the shared cache.
  const { data, isPending } = useQuery(registryOverviewQuery("record-keeper"));

  // First load: one shimmer skeleton of the whole board, never a stack of
  // per-widget pulses.
  if (isPending && !data) {
    return (
      <section className={styles.page}>
        <RegistryOverviewSkeleton desk="record-keeper" />
      </section>
    );
  }

  // The daily request series is pre-seeded with a zero row per day for the
  // chart axis, so emptiness must look at activity, not row count.
  const hasRequestActivity =
    data?.sf10RequestsDaily.some(
      (row) => row.pending + row.approved + row.reported + row.denied > 0,
    ) ?? false;

  const isEmpty =
    !!data &&
    data.pendingAdviserAccess === 0 &&
    data.lockedFinalsAwaiting === 0 &&
    data.latestAttachments.length === 0 &&
    data.missingSf10.length === 0 &&
    data.finals.total === 0 &&
    data.sf10.total === 0 &&
    data.sections === 0 &&
    data.subjects === 0 &&
    data.rosterByGrade.reduce((sum, row) => sum + row.count, 0) === 0 &&
    !hasRequestActivity;

  if (isEmpty) {
    return (
      <section className={styles.page}>
        <PageEmptyCallout>
          No records for this grade band yet. Approvals, SF10 activity, and
          grade distribution will appear here once data is filed.
        </PageEmptyCallout>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.stack}>
        <RegistryAttentionDeck desk="record-keeper" />

        {/* Analytics first — where the band stands, then what needs filing. */}
        {/* Left: the SF10 attach rail. Right: grade spread, request activity
            and the finals queue. */}
        <div className={styles.split}>
          <Sf10AttachFeed desk="record-keeper" variant="kanban" />
          <div className={styles.splitStack}>
            <RegistryGradePanel desk="record-keeper" />
            <RegistryRequestsPanel desk="record-keeper" />
            <FinalGradeApprovals desk="record-keeper" variant="kanban" />
          </div>
        </div>

        <RegistryRecordsLedger desk="record-keeper" />
      </div>
    </section>
  );
}
