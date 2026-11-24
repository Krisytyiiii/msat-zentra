"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  ClipboardList,
  UserRound,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { StatDeck, type StatDeckItem } from "@/components/ui/stat-deck";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { formatManilaDateLong } from "@/services/coordinator/labels";
import type { AdmCaseRow } from "@/services/coordinator/coordinator.types";
import { LANES, laneFor } from "./coordinator-enrolled-status";
import styles from "@/app/teacher/advisory/adm-cases/components/adm-cases.module.css";

/**
 * Right pane when no learner is open: the monitoring report for the selected
 * school year. Same overview anatomy as the adviser ADM desk — lead copy, a
 * four-figure stat deck and the newest learners as glass cards.
 */
export function CoordinatorEnrolledOverview({
  rows,
  monitoringTotal,
  completedTotal,
  onOpenCase,
}: {
  rows: AdmCaseRow[];
  monitoringTotal: number;
  completedTotal: number;
  onOpenCase: (row: AdmCaseRow) => void;
}) {
  const total = monitoringTotal + completedTotal;
  const modulesSubmitted = rows.reduce(
    (sum, row) => sum + (row.modulesSubmitted ?? 0),
    0,
  );
  const modulesTotal = rows.reduce((sum, row) => sum + (row.modulesTotal ?? 0), 0);
  const modulePercent =
    modulesTotal > 0 ? Math.round((modulesSubmitted / modulesTotal) * 100) : 0;
  const latest = rows.slice(0, 3);

  const stats: StatDeckItem[] = [
    {
      key: "learners",
      label: "Learners",
      unit: total === 1 ? "learner" : "learners",
      value: total,
      hint: "Enrolled in ADM this year",
      icon: ClipboardList,
    },
    {
      key: "monitoring",
      label: "Monitoring",
      value: monitoringTotal,
      unit: "live",
      hint: "Under enrollment monitoring",
      icon: Clock,
    },
    {
      key: "complete",
      label: "Complete",
      unit: "cases",
      value: completedTotal,
      hint: "ADM track finished",
      icon: CheckCircle2,
      tone: completedTotal > 0 ? "green" : undefined,
    },
    {
      key: "modules",
      label: "Modules in",
      unit: "",
      value: modulesTotal > 0 ? `${modulesSubmitted}/${modulesTotal}` : "—",
      hint:
        modulesTotal > 0 ? `${modulePercent}% submitted` : "No modules released",
      icon: BookOpenCheck,
      meter: modulesTotal > 0 ? modulePercent : undefined,
    },
  ];

  return (
    <div className={styles.overview}>
      <div className={styles.overviewLead}>
        <p className={styles.overviewEyebrow}>Monitoring report</p>
        <h2 className={styles.overviewTitle}>Enrolled learners</h2>
        <p className={styles.overviewCopy}>
          {total === 0
            ? "No learners enrolled to ADM yet. Once a case is certified and the learner is placed in a section, they appear in the list on the left."
            : `Every learner enrolled to ADM this school year — ${monitoringTotal} still under live monitoring. Select a learner on the left to open their read-only case workspace.`}
        </p>
      </div>

      <StatDeck
        columns={4}
        ariaLabel="Enrolled monitoring figures"
        items={stats}
        footer={
          total > 0
            ? `Counts cover every enrolled ADM learner this school year — ${monitoringTotal} still under live monitoring.`
            : undefined
        }
      />

      <section className={styles.card} aria-label="Latest enrollees">
        <header className={styles.cardHead}>
          <h3 className={styles.cardTitle}>
            <UserRound size={13} className="text-muted-foreground" aria-hidden />
            Latest enrollees
          </h3>
          <span className={styles.cardNote}>Newest first</span>
        </header>
        {latest.length > 0 ? (
          <ul className={styles.recentGrid}>
            {latest.map((row) => {
              const lane = LANES[laneFor(row)];
              const stamp = row.approvalDate
                ? formatManilaDateLong(row.approvalDate)
                : null;
              return (
                <li key={row.id} className="min-w-0">
                  <GlassCard className="h-full w-full min-w-0" intensity={4}>
                    <button
                      type="button"
                      className={styles.recentCard}
                      onClick={() => onOpenCase(row)}
                      aria-label={`Open monitoring for ${row.student} — ${lane.title}`}
                    >
                      <span className={styles.recentHead}>
                        <StudentMascot
                          name={row.student}
                          seed={row.lrn}
                          character={row.mascot ?? undefined}
                          size={28}
                        />
                        <span className={styles.recentIdentity}>
                          <span className={styles.recentName}>{row.student}</span>
                        </span>
                      </span>
                      <span className={styles.recentFoot}>
                        <Pill
                          tone={lane.tone}
                          label="Monitoring status"
                          className={styles.recentPill}
                        >
                          {lane.title}
                        </Pill>
                        {stamp ? (
                          <span className={styles.recentStamp}>
                            <Clock size={10} aria-hidden />
                            Approved {stamp}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.cardNote}>No learners enrolled yet.</p>
        )}
      </section>
    </div>
  );
}
