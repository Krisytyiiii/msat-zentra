"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  ArrowUpRight,
  CalendarClock,
  CircleDashed,
  CheckCircle2,
  Laptop,
  Monitor,
  Smartphone,
  Tablet,
  TabletSmartphone,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { stageLabel } from "@/services/coordinator/labels";
import { toSlug } from "@/lib/slug";
import type { AdmDeviceRow } from "@/services/coordinator/coordinator.types";
import styles from "./coordinator-device-detail-overlay.module.css";

const STATUS_TONE: Record<AdmDeviceRow["status"], PillTone> = {
  issued: "amber",
  returned: "green",
};

/** Device silhouette — mirrors the ledger row glyph. */
function DeviceGlyph({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t.includes("phone") || t.includes("mobile")) return <Smartphone />;
  if (t.includes("laptop") || t.includes("chromebook")) return <Laptop />;
  if (t.includes("desktop") || t.includes("monitor") || t.includes("pc"))
    return <Monitor />;
  if (t.includes("tablet") || t.includes("ipad")) return <Tablet />;
  return <TabletSmartphone />;
}

interface CoordinatorDeviceDetailOverlayProps {
  row: AdmDeviceRow | null;
  onClose: () => void;
  onRecordReturn: (row: AdmDeviceRow) => void;
}

/**
 * Full-record overlay for one device. Opens from a ledger row and lays the
 * whole record out as an information card — identity, status, device facts,
 * issue/return history and the notes — with the row's own actions in the
 * footer. Esc or the backdrop dismisses it (unless a transaction is pending).
 */
export function CoordinatorDeviceDetailOverlay({
  row,
  onClose,
  onRecordReturn,
}: CoordinatorDeviceDetailOverlayProps) {
  React.useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;

  const issued = row.status === "issued";
  const overdue = issued && row.stage === "completion";

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={`Device record for ${row.student}`}
      >
        {/* Header band — status-coloured accent rail. */}
        <div
          className={styles.head}
          data-status={row.status}
          data-overdue={overdue || undefined}
        >
          <span className={styles.headGlyph} aria-hidden="true">
            <DeviceGlyph type={row.deviceType} />
          </span>
          <div className={styles.headText}>
            <p className={styles.eyebrow}>Device record</p>
            <p className={styles.headTitle}>{row.deviceType}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 px-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </Button>
        </div>

        <div className={styles.body}>
          {/* Learner identity + live status. */}
          <div className={styles.identity}>
            <StudentMascot
              name={row.student}
              seed={row.lrn}
              character={row.mascot ?? undefined}
              size={44}
            />
            <div className={styles.identityText}>
              <p className={styles.identityName} title={row.student}>
                {row.student}
              </p>
              <p className={styles.identityLrn}>{row.lrn || "No LRN on file"}</p>
            </div>
            <div className={styles.statusStack}>
              <Pill tone={STATUS_TONE[row.status]} label="Device status">
                {issued ? (
                  <CircleDashed size={12} aria-hidden />
                ) : (
                  <CheckCircle2 size={12} aria-hidden />
                )}
                {issued ? "Issued" : "Returned"}
              </Pill>
              {overdue ? (
                <span className={styles.overdueTag}>
                  <TriangleAlert size={11} aria-hidden />
                  Overdue
                </span>
              ) : null}
            </div>
          </div>

          {/* Meta chips: grade + ADM stage. */}
          <div className={styles.chips}>
            <Pill tone="blue" label="Grade level">
              {row.grade || "—"}
            </Pill>
            <Pill
              tone={row.stage === "completion" ? "green" : "amber"}
              label="ADM stage"
              title={stageLabel(row.stage)}
            >
              {stageLabel(row.stage)}
            </Pill>
          </div>

          {/* Fact grid. */}
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Device</dt>
              <dd>{row.deviceType}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Serial number</dt>
              <dd className="tabular-nums">{row.deviceSerial || "—"}</dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <CalendarClock size={12} aria-hidden /> Issued
              </dt>
              <dd>
                {row.issuedDate}
                <span className={styles.factSub}>by {row.issuedBy}</span>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>
                <CalendarClock size={12} aria-hidden /> Returned
              </dt>
              <dd>
                {row.returnedDate ?? "Not yet returned"}
                {issued ? (
                  <span className={styles.factSub}>Out with the learner</span>
                ) : null}
              </dd>
            </div>
          </dl>

          {/* Condition / remarks. */}
          <div className={styles.note}>
            <span className={styles.noteIcon} aria-hidden="true">
              <UserRound size={13} />
            </span>
            <div className={styles.noteBody}>
              <p className={styles.noteTitle}>Condition notes</p>
              <p className={styles.noteText}>
                {row.conditionNotes?.trim() || "No condition notes recorded."}
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions — the same verbs as the ledger row. */}
        <div className={styles.actions}>
          <Button asChild variant="outline" className="gap-1.5 bg-card text-xs">
            <Link
              href={`/coordinator/enrolled/${encodeURIComponent(
                toSlug(row.student),
              )}`}
            >
              <ArrowUpRight size={14} aria-hidden />
              Open case
            </Link>
          </Button>
          {issued ? (
            <Button
              className="gap-1.5 text-xs"
              onClick={() => onRecordReturn(row)}
            >
              <ArrowRightLeft size={14} aria-hidden />
              Record return
            </Button>
          ) : (
            <Button className="gap-1.5 text-xs" onClick={onClose}>
              <CheckCircle2 size={14} aria-hidden />
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
