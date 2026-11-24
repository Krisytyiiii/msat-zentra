"use client";

import { Images } from "lucide-react";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import type { GuidanceAnecdotalRecord } from "@/services/guidance/anecdotal.types";
import { docSlipsFor } from "./session-doc-slips";
import styles from "@/components/aicanvas/polaroid-stack.module.css";

function isEndorsedCase(type: string | undefined, status: string): boolean {
  return type === "ADM" && status === "in_progress";
}

function statusLabel(record: GuidanceAnecdotalRecord): string {
  if (isEndorsedCase(record.referralType, record.referralStatus)) return "Endorsed";
  switch (record.referralStatus) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In progress";
    case "resolved":
      return "Resolved";
    case "dismissed":
      return "Closed";
    case "escalated":
      return "Sent higher up";
    case "follow_up":
      return "Follow-up";
    case "info_requested":
      return "Needs more info";
    default:
      return record.referralStatus;
  }
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value || "—";
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function caseTypeLabel(record: GuidanceAnecdotalRecord): string {
  if (record.referralType === "ADM") return "ADM consultation";
  if (record.hasInterventionDocs) return "Intervention";
  return "Counseling";
}

/**
 * One session-document folder as a Polaroid — the record's first filed photo in
 * the paper frame, the case status on the photo, and the learner's name +
 * case type/date/section in the wide bottom margin. Records without photos show
 * the learner's mascot instead of an empty grey box. Mirrors the nurse
 * health-record polaroid so both desks read the same.
 */
export function SessionDocumentPolaroid({ record }: { record: GuidanceAnecdotalRecord }) {
  const docs = docSlipsFor(record, 50);
  const cover = docs[0]?.image;
  const date = formatDate(record.date);
  const meta = [
    caseTypeLabel(record),
    date && date !== "—" ? date : null,
    record.section && record.section !== "—" ? record.section : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={styles.paper}>
      <div className={styles.photo}>
        {cover ? (
          // Filed session images are Supabase public URLs, served as-is — no
          // Next image optimisation endpoint in this app.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.fileUrl}
            alt={`Session documentation for ${record.student}`}
            className={styles.photoImg}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className={styles.photoFallback}>
            <StudentMascot
              name={record.student}
              seed={record.lrn}
              character={record.mascot ?? undefined}
              size={72}
            />
            <span className="text-[12px] font-semibold">No photo filed</span>
          </div>
        )}
        <span className={styles.statusTag}>{statusLabel(record)}</span>
        {docs.length > 0 ? (
          <span className={styles.photoCount}>
            <Images size={10} aria-hidden />
            {docs.length}
          </span>
        ) : null}
      </div>
      <div className={styles.caption}>
        <p className={styles.captionName} title={record.student}>
          {record.student}
        </p>
        <p className={styles.captionMeta} title={meta}>
          {meta}
        </p>
      </div>
    </article>
  );
}

/**
 * One filed session photo, as its own Polaroid. A record's photos fan out from
 * the cover so the counselor can look through every shot filed with the case.
 */
export function SessionDocumentPhotoPolaroid({
  record,
  file,
  index,
  total,
}: {
  record: GuidanceAnecdotalRecord;
  file: { fileUrl: string; fileName: string };
  index: number;
  total: number;
}) {
  const meta = file.fileName || `Photo ${index + 1}`;

  return (
    <article className={styles.paper}>
      <div className={styles.photo}>
        {/* Filed session images are Supabase public URLs, served as-is. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.fileUrl}
          alt={`${record.student} session photo ${index + 1} of ${total}`}
          className={styles.photoImg}
          loading="lazy"
          draggable={false}
        />
        <span className={styles.photoCount}>
          {index + 1}/{total}
        </span>
      </div>
      <div className={styles.caption}>
        <p className={styles.captionName} title={record.student}>
          {record.student}
        </p>
        <p className={styles.captionMeta} title={meta}>
          {meta}
        </p>
      </div>
    </article>
  );
}
