"use client";

import * as React from "react";
import { Images } from "lucide-react";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { formatDate } from "../../referrals/components/nurse-referrals-format";
import type { ClinicAttachment } from "@/services/nurse/nurse.types";
import {
  entryStatusLabel,
  fileHref,
  type DocEntry,
} from "./documentaries-utils";
import styles from "@/components/aicanvas/polaroid-stack.module.css";

/**
 * One health record as a Polaroid: the session's first documentation photo in
 * the paper frame, the record's status on the photo, and the learner's name +
 * type/date in the wide bottom margin. Records without photos show the
 * learner's mascot instead of an empty grey box.
 */
export function HealthRecordPolaroid({ entry }: { entry: DocEntry }) {
  const files = entry.files;
  const cover = files[0];
  const statusLabel = entryStatusLabel(entry);
  const date = formatDate(entry.dateDay);
  const meta = [
    entry.row.type,
    date && date !== "—" ? date : null,
    entry.row.section && entry.row.section !== "—" ? entry.row.section : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={styles.paper}>
      <div className={styles.photo}>
        {cover ? (
          // Uploaded documentation photos are Supabase public URLs, served
          // as-is — no Next image optimisation endpoint in this app.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileHref(cover.fileUrl)}
            alt={`Documentation photo for ${entry.row.student}`}
            className={styles.photoImg}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className={styles.photoFallback}>
            <StudentMascot
              name={entry.row.student}
              seed={entry.row.lrn}
              character={entry.row.mascot ?? undefined}
              size={72}
            />
            <span className="text-[12px] font-semibold">No photo filed</span>
          </div>
        )}
        <span className={styles.statusTag}>{statusLabel}</span>
        {files.length > 0 ? (
          <span className={styles.photoCount}>
            <Images size={10} aria-hidden />
            {files.length}
          </span>
        ) : null}
      </div>
      <div className={styles.caption}>
        <p className={styles.captionName} title={entry.row.student}>
          {entry.row.student}
        </p>
        <p className={styles.captionMeta} title={meta}>
          {meta}
        </p>
      </div>
    </article>
  );
}

/**
 * One attached documentation photo of a health record, as its own Polaroid.
 * The record's photos fan out from the cover so the nurse can look through
 * every shot filed with the session.
 */
export function HealthRecordPhotoPolaroid({
  entry,
  file,
  index,
  total,
}: {
  entry: DocEntry;
  file: ClinicAttachment;
  index: number;
  total: number;
}) {
  const meta = [entry.row.type, file.fileName || `Photo ${index + 1}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={styles.paper}>
      <div className={styles.photo}>
        {/* Uploaded documentation photos are Supabase public URLs, served
            as-is — no Next image optimisation endpoint in this app. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileHref(file.fileUrl)}
          alt={`${entry.row.student} documentation photo ${index + 1} of ${total}`}
          className={styles.photoImg}
          loading="lazy"
          draggable={false}
        />
        <span className={styles.photoCount}>
          {index + 1}/{total}
        </span>
      </div>
      <div className={styles.caption}>
        <p className={styles.captionName} title={entry.row.student}>
          {entry.row.student}
        </p>
        <p className={styles.captionMeta} title={meta}>
          {meta}
        </p>
      </div>
    </article>
  );
}
