"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, TabletSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Pill } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerGroup } from "@/components/ui/shimmer-skeleton";
import { formatElapsedShort, msSinceDate } from "@/lib/clock";
import type { AdmDeviceRow } from "@/services/coordinator/coordinator.types";
import styles from "./coordinator-overview-boards.module.css";

interface CoordinatorOverviewBoardsProps {
  devicesIssued: number | null;
  devicesReturned: number | null;
  devicesPending: boolean;
  oldestOut: AdmDeviceRow[];
  now: number;
}

/**
 * Right rail of the command center — the learning devices still out, rendered
 * with the same glass card anatomy as the "Needs you next" board (head,
 * divided metric strip, duration meter, action strip).
 */
export function CoordinatorOverviewBoards({
  devicesIssued,
  devicesReturned,
  devicesPending,
  oldestOut,
  now,
}: CoordinatorOverviewBoardsProps) {
  const oldestDevice = oldestOut[0];
  const oldestOutMs = oldestDevice
    ? msSinceDate(oldestDevice.issuedDate, now)
    : null;
  const maxOutMs = Math.max(
    1,
    ...oldestOut.map((d) => msSinceDate(d.issuedDate, now) ?? 0),
  );

  return (
    <div className={styles.rail}>
      <section className={styles.panel} aria-label="Learning devices out">
        <header className={styles.panelHead}>
          <span className={styles.panelIcon} aria-hidden="true">
            <TabletSmartphone size={15} />
          </span>
          <div className={styles.panelHeading}>
            <h2 className={styles.panelTitle}>Devices out</h2>
            <p className={styles.panelSub}>
              {devicesPending || devicesIssued === null
                ? "Checking device counts"
                : `${devicesIssued} out · ${devicesReturned ?? 0} returned`}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
          >
            <Link href="/coordinator/devices">
              Open
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </header>

        {devicesPending ? (
          <ShimmerGroup>
            <div className={styles.cardList} aria-busy="true" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.skelCard}>
                  <div className={styles.skelCardHead}>
                    <Skeleton className={styles.skelLine} />
                    <Skeleton className={styles.skelAvatar} />
                  </div>
                  <div className={styles.skelMetric} />
                  <Skeleton className={styles.skelMeter} />
                  <Skeleton className={styles.skelFact} />
                </div>
              ))}
            </div>
          </ShimmerGroup>
        ) : oldestOut.length === 0 ? (
          <p className={styles.empty}>
            <CheckCircle2 size={15} aria-hidden="true" />
            No tablets are out with a learner right now.
          </p>
        ) : (
          <ul className={styles.cardList} aria-label="Devices still out">
            {oldestOut.map((d) => {
              const out = msSinceDate(d.issuedDate, now);
              const pct =
                out === null ? 0 : Math.min(100, (out / maxOutMs) * 100);
              const gradeValue = d.grade?.replace(/^Grade\s+/i, "") ?? "—";
              return (
                <li key={d.id} className={styles.cardItem}>
                  <GlassCard className={styles.glassWrap}>
                    <div className={styles.card}>
                      <div className={styles.cardHead}>
                        <div className={styles.cardHeading}>
                          <span className={styles.cardName} title={d.student}>
                            {d.student}
                          </span>
                          <span className={styles.cardMetaRow}>
                            <Pill tone="blue" label="Grade">
                              {gradeValue}
                            </Pill>
                          </span>
                        </div>
                        <span className={styles.cardAvatar} aria-hidden="true">
                          <StudentMascot
                            name={d.student}
                            seed={d.lrn}
                            size={26}
                          />
                        </span>
                      </div>

                      <div className={styles.cardMetric}>
                        <span className={styles.cardMetricLabel}>Out for</span>
                        <span
                          className={`${styles.cardMetricValue} tabular-nums`}
                        >
                          {out === null ? "—" : formatElapsedShort(out)}
                        </span>
                        <span className={styles.cardMetricHint}>
                          since issue
                        </span>
                      </div>

                      <div className={styles.meterWrap}>
                        <div className={styles.meter} aria-hidden="true">
                          <span
                            className={styles.meterFill}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className={styles.cardFacts}>
                        <span className={styles.cardFact}>
                          <span className={styles.cardFactLabel}>Device</span>
                          <span
                            className={styles.cardFactValue}
                            title={d.deviceSerial}
                          >
                            {d.deviceSerial || d.deviceType || "—"}
                          </span>
                        </span>
                      </div>

                      <div className={styles.cardActions}>
                        <span className={styles.cardLrnPill}>
                          <Pill field="lrn" className="rounded-md">
                            {d.lrn}
                          </Pill>
                        </span>
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                          <Link href="/coordinator/devices">
                            Open
                            <ArrowUpRight className="size-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        )}

        <p className={styles.note}>
          {devicesPending
            ? "Device counts are still loading."
            : devicesIssued === null
              ? "Device counts are unavailable right now."
              : devicesIssued === 0
                ? "Every issued tablet has been returned."
                : `${devicesIssued} tablet${devicesIssued === 1 ? "" : "s"} still out${
                    oldestOutMs !== null
                      ? ` — the oldest for ${formatElapsedShort(oldestOutMs)}`
                      : ""
                  }. Longest waits sit at the top.`}
        </p>
      </section>
    </div>
  );
}
