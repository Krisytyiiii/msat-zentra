"use client";

import Link from "next/link";
import { ArrowUpRight, Stethoscope } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { NurseActionBadge, waitingElapsed } from "./nurse-action-badge";
import { useNowMs } from "./use-now-ms";
import type { NurseQueueRow } from "@/services/nurse/nurse.types";
import styles from "./nurse-overview.module.css";
import card from "./nurse-referral-card.module.css";

/**
 * Latest referred students — a stacked glass card rail. The cards follow the
 * adviser Modules desk (`/teacher/advisory/modules`): learner mascot + name in
 * the head, a two-cell metric row (waiting time, grade level) and a footer with
 * the LRN pill and the case action. The caller renders this section only when
 * the desk actually has referrals.
 */
export function NurseLatestReferralsPanel({
  latestReferrals,
  title = "Latest referred students",
  description = "The latest 3 students referred to the desk.",
}: {
  latestReferrals: NurseQueueRow[];
  title?: string;
  description?: string;
}) {
  const nowMs = useNowMs();

  return (
    <section className={styles.referralSection} aria-label={title}>
      <div className={styles.gridHeader}>
        <div className={styles.gridHeaderText}>
          <span className={styles.gridTitle}>
            <Stethoscope size={15} aria-hidden />
            {title}
            <span className={styles.gridCount}>{latestReferrals.length}</span>
          </span>
          <p className={styles.gridDesc}>{description}</p>
        </div>
        <Link
          href="/nurse/alerts"
          className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
        >
          View all
        </Link>
      </div>

      <div className={styles.referralGrid}>
        {latestReferrals.map((item) => {
          const isAdm = item.type === "ADM";
          const homeBase = isAdm
            ? "/nurse/referrals/adm"
            : "/nurse/referrals/clinic";
          const seeMoreHref = `${homeBase}?highlight=${item.id}`;
          const wait = waitingElapsed(item.referredAt, nowMs);

          return (
            <GlassCard
              key={item.id}
              className="flex h-full w-full min-w-0"
              intensity={4}
            >
              <Link
                href={seeMoreHref}
                className={card.card}
                aria-label={`Open ${item.student}'s ${
                  isAdm ? "ADM" : "clinic"
                } case`}
              >
                <div className={card.cardHead}>
                  <span className={card.cardMascot} aria-hidden>
                    <StudentMascot
                      name={item.student}
                      seed={item.lrn}
                      character={item.mascot ?? undefined}
                      size={34}
                    />
                  </span>
                  <div className={card.cardHeading}>
                    <p className={card.cardName} title={item.student}>
                      {item.student}
                    </p>
                  </div>
                  <NurseActionBadge row={item} className="shrink-0" />
                </div>

                <div className={card.cardMetrics}>
                  <div className={card.cardMetric}>
                    <span className={card.metricLabel}>Waiting</span>
                    <span className={card.metricValue}>{wait}</span>
                    <span className={card.metricHint}>
                      {item.date !== "—" ? `since ${item.date}` : "no referral date"}
                    </span>
                  </div>
                  <div className={card.cardMetric}>
                    <span className={`${card.metricValue} ${card.metricValueText}`}>
                      {item.grade}
                    </span>
                    <span className={card.metricHint}>{item.section}</span>
                  </div>
                </div>

                <div className={card.cardFoot}>
                  <Pill field="lrn" label="LRN">
                    {item.lrn}
                  </Pill>
                  <span className={card.footAction}>
                    View case <ArrowUpRight size={12} aria-hidden />
                  </span>
                </div>
              </Link>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
