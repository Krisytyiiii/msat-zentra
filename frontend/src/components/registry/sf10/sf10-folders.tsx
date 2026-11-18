"use client";

import { AnecdotalRecordKanbanCard } from "@/components/anecdotal/anecdotal-record-kanban-card";
import { FolderCard } from "@/components/ui/FolderCard";
import { GitBranch, Paperclip } from "lucide-react";
import {
  GRADE_LABEL,
  SF10_STATUS_LABEL,
  type Sf10Record,
  type Sf10Status,
} from "@/services/registry/sf10.types";
import { StatusBadge, AdviserAccessBadge } from "./shared";
import styles from "./sf10.module.css";

const STATUS_TONES: Record<Sf10Status, 1 | 2 | 3 | 4 | 5> = {
  attach: 1,
  available: 3,
  released: 5,
};

function fileExtOf(url: string | null): string {
  return (url?.split("?")[0].split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fileIconFor(url: string | null): "doc" | "chart" | "image" {
  const ext = fileExtOf(url);
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["xlsx", "xls"].includes(ext)) return "chart";
  return "doc";
}

function fileNameFor(url: string | null): string {
  const ext = fileExtOf(url);
  return ext ? `SF10.${ext}` : "SF10 file";
}

const gradeText = (gradeLevel: Sf10Record["gradeLevel"]): string =>
  gradeLevel ? (GRADE_LABEL[gradeLevel] ?? gradeLevel) : "—";

export function Sf10FolderGrid({
  records,
  onOpen,
}: {
  records: Sf10Record[];
  onOpen: (r: Sf10Record) => void;
}) {
  return (
    <div className={styles.folderGrid}>
      {records.map((r) => (
        <button
          key={r.id}
          type="button"
          className={styles.folderBtn}
          onClick={() => onOpen(r)}
          aria-label={`Open ${r.fullName}'s SF10 record`}
        >
          <FolderCard
            label={r.fullName}
            sublabel={`${gradeText(r.gradeLevel)} · ${r.section}`}
            cornerTag={
              r.adviserAccess
                ? `${SF10_STATUS_LABEL[r.status]} · Adviser access`
                : SF10_STATUS_LABEL[r.status]
            }
            folderColor="var(--primary)"
            files={[
              {
                name: fileNameFor(r.uploadedFileUrl),
                tag: `v${r.currentVersion}`,
                tone: STATUS_TONES[r.status],
                icon: fileIconFor(r.uploadedFileUrl),
              },
            ]}
          />
        </button>
      ))}
    </div>
  );
}

// Amber — the SF10 folder accent, shared with the overview attach feed.
const SF10_FOLDER_COLOR = "#f59e0b";

/**
 * Records kanban grid (record-keeper) — one shareable folder kanban card
 * per filed record (same card as the overview attach feed and teacher
 * anecdotal boards): amber folder, 16px gaps. The card shell is the
 * button; opening it routes to the record detail.
 */
export function Sf10RecordKanbanGrid({
  records,
  onOpen,
}: {
  records: Sf10Record[];
  onOpen: (r: Sf10Record) => void;
}) {
  return (
    <div className={styles.folderKanbanGrid}>
      {records.map((r) => (
        <AnecdotalRecordKanbanCard
          key={r.id}
          category="sf10"
          headerTitle="SF10 Record"
          studentName={r.fullName}
          metaText={r.lrn}
          metaTitle={`${r.lrn} · ${gradeText(r.gradeLevel)} · ${r.section}`}
          stackIdentity
          fileName={fileNameFor(r.uploadedFileUrl)}
          fileTag={`${gradeText(r.gradeLevel)} · ${r.section} · v${r.currentVersion}`}
          headerRight={
            <div className="flex items-center gap-1.5">
              {r.adviserAccess ? <AdviserAccessBadge /> : null}
              <StatusBadge status={r.status} />
            </div>
          }
          categoryColor={SF10_FOLDER_COLOR}
          folderColor={SF10_FOLDER_COLOR}
          tone={3}
          openLabel={`Open ${r.fullName}'s SF10 record`}
          onOpen={() => onOpen(r)}
          actions={
            /* Attach + version control side by side: the file the desk holds
               and the revision it is on, one glance per card. */
            <span className="flex w-full min-w-0 items-center justify-between gap-2 border-t border-border pt-1.5 text-[12px] text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1">
                <Paperclip size={11} className="shrink-0" aria-hidden />
                <span className="truncate" title={fileNameFor(r.uploadedFileUrl)}>
                  {fileNameFor(r.uploadedFileUrl)}
                </span>
              </span>
              <span
                className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-medium text-foreground"
                title={`Version control v${r.currentVersion}`}
              >
                <GitBranch size={11} aria-hidden />
                v{r.currentVersion}
              </span>
            </span>
          }
        />
      ))}
    </div>
  );
}
