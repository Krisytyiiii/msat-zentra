"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  Laptop,
  UserRound,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import { admStageTone } from "@/lib/labels/status-tone";
import type { AdmCase, MyAdmCasesSummary } from "@/services/teacher/admCases.types";
import { StudentMascot } from "../../referrals/components/StudentMascot";
import styles from "./adm-cases.module.css";

const formatReferred = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
};

/**
 * Right pane when no case is open: the adviser's school-year ADM report. Counts
 * come from the aggregate the list endpoint returns, so they describe every
 * case in scope — not just the page currently visible on the left.
 */
export function AdmOverviewPanel({
  cases,
  summary,
  recent,
  unfilteredTotal,
  onOpenCase,
}: {
  cases: AdmCase[];
  summary?: MyAdmCasesSummary;
  recent?: AdmCase[];
  unfilteredTotal: number;
  onOpenCase: (row: AdmCase) => void;
}) {
  const total = summary?.total ?? Math.max(unfilteredTotal, cases.length);
  const approved = summary?.approved ?? cases.filter((c) => c.approved).length;
  const monitoring =
    summary?.monitoring ?? cases.filter((c) => c.stage === "enrollment_monitoring").length;
  const modulesSubmitted =
    summary?.modulesSubmitted ?? cases.reduce((sum, c) => sum + c.modulesSubmitted, 0);
  const modulesTotal = summary?.modulesTotal ?? cases.reduce((sum, c) => sum + c.modulesTotal, 0);
  const devicesOut =
    summary?.devicesOut ??
    cases.reduce((sum, c) => sum + Math.max(0, c.devicesIssued - c.devicesReturned), 0);

  const modulePercent =
    modulesTotal > 0 ? Math.round((modulesSubmitted / modulesTotal) * 100) : 0;

  const latest = (recent ?? cases).slice(0, 3);

  const stats: StatDeckItem[] = [
    {
      key: "cases",
      label: "Cases",
      unit: total === 1 ? "case" : "cases",
      value: total,
      hint: "This school year",
      icon: ClipboardList,
    },
    {
      key: "approved",
      label: "Approved",
      unit: "signed",
      value: approved,
      hint: "Signed by the Principal",
      icon: CheckCircle2,
    },
    {
      key: "modules",
      label: "Modules in",
      unit: "",
      value: modulesTotal > 0 ? `${modulesSubmitted}/${modulesTotal}` : "—",
      hint: modulesTotal > 0 ? `${modulePercent}% submitted` : "No modules released",
      icon: BookOpenCheck,
      meter: modulesTotal > 0 ? modulePercent : undefined,
    },
    {
      key: "devices",
      label: "Devices out",
      unit: "devices",
      value: devicesOut,
      hint: devicesOut === 1 ? "On loan to a learner" : "On loan to learners",
      icon: Laptop,
    },
  ];

  return (
    <div className={styles.overview}>
      <div className={styles.overviewLead}>
        <p className={styles.overviewEyebrow}>Adviser report</p>
        <h2 className={styles.overviewTitle}>ADM overview</h2>
        <p className={styles.overviewCopy}>
          {total === 0
            ? "No ADM cases yet. Once guidance opens a case for one of your advisees it appears in the list on the left."
            : `Every ADM case filed for your advisees this school year — ${monitoring} under live monitoring right now. Select a learner on the left to open their full case workspace.`}
        </p>
      </div>

      <StatDeck
        columns={4}
        ariaLabel="ADM figures"
        items={stats}
        footer={
          total > 0
            ? `Counts cover every ADM case of your advisees this school year — ${monitoring} under live monitoring right now.`
            : undefined
        }
      />

      <section className={styles.card} aria-label="Latest ADM referrals">
        <header className={styles.cardHead}>
          <h3 className={styles.cardTitle}>
            <UserRound size={13} className="text-muted-foreground" aria-hidden />
            Latest referrals
          </h3>
          <span className={styles.cardNote}>Newest first</span>
        </header>
        {latest.length > 0 ? (
          <ul className={styles.recentGrid}>
            {latest.map((row) => (
              <li key={row.id} className="min-w-0">
                <GlassCard className="h-full w-full min-w-0" intensity={4}>
                  <button
                    type="button"
                    className={styles.recentCard}
                    onClick={() => onOpenCase(row)}
                    aria-label={`Open ${row.studentName}'s ADM case — ${row.stageLabel}`}
                  >
                    <span className={styles.recentHead}>
                      <StudentMascot
                        name={row.studentName}
                        seed={row.lrn}
                        character={row.mascot ?? undefined}
                        size={28}
                      />
                      <span className={styles.recentIdentity}>
                        <span className={styles.recentName}>{row.studentName}</span>
                      </span>
                    </span>
                    <span className={styles.recentFoot}>
                      <Pill
                        tone={
                          row.referralStatus === "dismissed"
                            ? "neutral"
                            : admStageTone(row.stage)
                        }
                        label="ADM stage"
                        className={styles.recentPill}
                      >
                        {row.stageLabel}
                      </Pill>
                      {formatReferred(row.referredAt) ? (
                        <span
                          className={styles.recentStamp}
                          title={`Referred at ${formatReferred(row.referredAt)}`}
                        >
                          <Clock size={10} aria-hidden />
                          Referred at {formatReferred(row.referredAt)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </GlassCard>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.cardNote}>No ADM cases referred yet.</p>
        )}
      </section>
    </div>
  );
}
