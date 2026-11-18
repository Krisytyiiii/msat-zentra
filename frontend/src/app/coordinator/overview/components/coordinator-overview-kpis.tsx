"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  Clock3,
  Inbox,
  ListChecks,
  PieChart,
  TabletSmartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AMBER_RAMP,
  type StageDonutEntry,
} from "./coordinator-overview-helpers";
import styles from "./coordinator-overview-kpis.module.css";

interface CoordinatorOverviewKpisProps {
  needsReviewTotal: number | null;
  needsReviewReady: boolean;
  referredToMe: number;
  certificationsIssued: number;
  awaitingPrincipal: number;
  activeEnrolled: number;
  stageDonut: StageDonutEntry[];
}

interface Metric {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  href: string;
  alert?: boolean;
}

/**
 * Command-center header — a single hero surface instead of a row of stat
 * boxes: the desk's state in one sentence, the next actions, and an
 * at-a-glance metric list you can click straight through to its queue.
 * Under it, the whole pipeline reads as one flow bar with stage steps.
 */
export function CoordinatorOverviewKpis({
  needsReviewTotal,
  needsReviewReady,
  referredToMe,
  certificationsIssued,
  awaitingPrincipal,
  activeEnrolled,
  stageDonut,
}: CoordinatorOverviewKpisProps) {
  const openCount = needsReviewTotal ?? 0;
  const hasOpen = needsReviewReady && openCount > 0;

  const title = !needsReviewReady
    ? "Getting your desk ready…"
    : hasOpen
      ? `${openCount} case${openCount === 1 ? "" : "s"} need your attention`
      : "Your desk is clear";

  const subtitle = !needsReviewReady
    ? "Pulling the latest referrals, bookings and device counts."
    : hasOpen
      ? "Nurse and Guidance forwarded cases that still need a learner profile, eligibility check or certification."
      : "Nothing is waiting on you right now. Meetings and devices below stay live.";

  const metrics: Metric[] = [
    {
      label: "Needs attention",
      value: !needsReviewReady ? "…" : String(openCount),
      hint: !needsReviewReady
        ? "Checking your desk"
        : openCount === 0
          ? "Nothing needs you"
          : "Forwarded by Nurse / Guidance, awaiting review",
      icon: AlertTriangle,
      href: "/coordinator/referrals",
      alert: hasOpen,
    },
    {
      label: "Referred to me",
      value: String(referredToMe),
      hint: "All referrals awaiting or in intake",
      icon: Inbox,
      href: "/coordinator/referrals",
    },
    {
      label: "Certifications issued",
      value: String(certificationsIssued),
      hint: "At or past recommendation & certification",
      icon: Award,
      href: "/coordinator/files",
    },
    {
      label: "Awaiting Principal",
      value: String(awaitingPrincipal),
      hint: "Forwarded, eligible, unsigned",
      icon: Clock3,
      href: "/coordinator/files?tab=awaiting",
    },
    {
      label: "Active enrolled",
      value: String(activeEnrolled),
      hint: "Learners in enrollment monitoring",
      icon: Users,
      href: "/coordinator/enrolled",
    },
  ];

  const stageTotal = stageDonut.reduce((n, s) => n + s.value, 0);
  const activeStages = stageDonut
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage }) => stage.value > 0);

  return (
    <div className={styles.stack}>
      <section className={styles.hero} aria-label="Coordinator desk summary">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.liveDot} aria-hidden="true" />
            ADM Coordinator · live desk
          </p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          <div className={styles.actions}>
            <Button asChild size="sm">
              <Link href="/coordinator/referrals">
                <ListChecks aria-hidden="true" />
                Open case queue
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/coordinator/files">Certifications</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/coordinator/devices">
                <TabletSmartphone aria-hidden="true" />
                Devices
              </Link>
            </Button>
          </div>
        </div>

        <ul className={styles.metrics} aria-label="Key numbers">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const isZero = metric.value === "0";
            return (
              <li key={metric.label}>
                <Link
                  href={metric.href}
                  className={styles.metric}
                  title={metric.hint}
                  aria-label={`${metric.label}: ${metric.value}. ${metric.hint}`}
                >
                  <span className={styles.metricIcon} aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  <span className={styles.metricLabel}>{metric.label}</span>
                  <span
                    className={`${styles.metricValue} ${
                      metric.alert ? styles.metricAlert : ""
                    } ${isZero ? styles.metricZero : ""}`}
                  >
                    {metric.value}
                  </span>
                  <ArrowUpRight
                    size={13}
                    className={styles.metricArrow}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.flow} aria-label="Cases by pipeline stage">
        <header className={styles.flowHead}>
          <h2 className={styles.flowTitle}>
            <PieChart size={14} aria-hidden="true" />
            Pipeline by stage
          </h2>
          <span className={styles.flowTotal}>
            {stageTotal} case{stageTotal === 1 ? "" : "s"} in flight
          </span>
        </header>

        {activeStages.length === 0 ? (
          <p className={styles.flowEmpty}>
            No cases are in the pipeline yet — new referrals will show up here
            stage by stage.
          </p>
        ) : (
          <>
            <div
              className={styles.flowBar}
              role="img"
              aria-label={`Pipeline distribution: ${activeStages
                .map(({ stage }) => `${stage.full} ${stage.value}`)
                .join(", ")}`}
            >
              {activeStages.map(({ stage, index }) => (
                <span
                  key={stage.name}
                  className={styles.flowSeg}
                  style={{
                    flexGrow: stage.value,
                    background: AMBER_RAMP[index % AMBER_RAMP.length],
                  }}
                />
              ))}
            </div>

            <ol className={styles.flowSteps}>
              {stageDonut.map((stage, index) => (
                <li key={stage.name}>
                  <Link
                    href="/coordinator/referrals"
                    className={styles.flowStep}
                    title={`Open the ${stage.full} queue`}
                  >
                    <span
                      className={styles.flowSwatch}
                      style={{
                        background: AMBER_RAMP[index % AMBER_RAMP.length],
                      }}
                      aria-hidden="true"
                    />
                    <span className={styles.flowStepName}>{stage.full}</span>
                    <span
                      className={`${styles.flowStepCount} ${
                        stage.value === 0 ? styles.flowStepCountZero : ""
                      }`}
                    >
                      {stage.value}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
