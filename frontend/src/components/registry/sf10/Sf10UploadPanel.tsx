"use client";

import * as React from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Upload,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { useSf10BulkUpload } from "@/components/registry/sf10/sf10-bulk-upload-context";
import { engineLabel } from "@/components/registry/sf10/shared";

import styles from "./sf10.module.css";

// Accepted formats render as amber pills (the SF10 desk accent) — one pill
// each, never a comma/dot separated list. Shared by the board description
// and the dropzone hint.
const FILE_FORMATS = ["PDF", "XLSX"];

function FormatPills() {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {FILE_FORMATS.map((format) => (
        <span
          key={format}
          className="inline-flex h-5 items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 text-[12px] font-semibold tracking-wide text-amber-700 dark:text-amber-400"
        >
          {format}
        </span>
      ))}
    </span>
  );
}

export function Sf10UploadPanel({
  desk = "record-keeper",
  onChanged,
  onUploaded,
}: {
  /** Desk whose extraction scope applies — the registrar reads G11–G12 only. */
  desk?: "registrar" | "record-keeper";
  onChanged?: () => void;
  /** Called with each filed record id (last call wins for single-record views). */
  onUploaded?: (id: string) => void;
}) {
  const bulk = useSf10BulkUpload();
  const { items, uploading, progress } = bulk;
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isRegistrar = desk === "registrar";

  // Compat: the upload page tracks filed records through these callbacks.
  // The queue itself lives in the root provider so runs survive navigation.
  const seenFiled = React.useRef(0);
  React.useEffect(() => {
    if (bulk.filedIds.length > seenFiled.current) {
      const fresh = bulk.filedIds.slice(seenFiled.current);
      seenFiled.current = bulk.filedIds.length;
      onChanged?.();
      fresh.forEach((id) => onUploaded?.(id));
    } else if (bulk.filedIds.length < seenFiled.current) {
      seenFiled.current = bulk.filedIds.length;
    }
  }, [bulk.filedIds, onChanged, onUploaded]);

  const handleFiles = (files: FileList | null) => {
    bulk.enqueueFiles(files ?? []);
    if (inputRef.current) inputRef.current.value = "";
  };

  const queuedCount = items.filter((i) => i.status === "queued").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const doneItems = items.filter((i) => i.status === "done").length;
  const actionableCount = queuedCount + errorCount;
  const uploadPercent =
    progress.total > 0 ? Math.round((Math.min(progress.done, progress.total) / progress.total) * 100) : 0;

  // Kanban board shell (same board/header pattern as the desk's other
  // boards): the drop hero + upload queue fill the board, the 24px actions
  // live in the footer.
  return (
    <KanbanBoard
      title="Upload SF10"
      icon={<Upload size={14} className="text-amber-500" aria-hidden />}
      ariaLabel="Upload SF10"
      className="flex-1"
      count={items.length > 0 ? `${doneItems}/${items.length} filed` : undefined}
      description={
        <p className="leading-5">
          Attach SF10 files in bulk <FormatPills /> — select many at once like
          Drive.{" "}
          {isRegistrar
            ? "Only the Grade 11–12 rows are extracted (JHS rows stay on the record keeper's desk); uploading stores the file, it never creates a learner."
            : "Each file is filed under the LRN written on it, so a learner the school has no account for is still stored, never created."}{" "}
          Uploads keep running in the bottom-right dock even if you leave this
          page.
        </p>
      }
      footer={
        <div className={styles.uploadFooter}>
          <div className={styles.uploadFooterLeft}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              <Plus size={14} aria-hidden />
              Add files
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground"
              onClick={bulk.clearDone}
              disabled={uploading || doneItems === 0}
            >
              Clear done
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground"
              onClick={bulk.clearAll}
              disabled={uploading || items.length === 0}
            >
              Clear queue
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 px-3.5 text-xs"
            onClick={bulk.startUpload}
            disabled={uploading || actionableCount === 0}
          >
            {uploading
              ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : `Upload${actionableCount > 0 ? ` ${actionableCount} file${actionableCount === 1 ? "" : "s"}` : ""}`}
          </Button>
        </div>
      }
    >
      <div
        className={`${styles.dropShell} ${dragging ? styles.dropShellActive : ""} ${
          items.length > 0 ? styles.dropShellCompact : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Attach SF10 files"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.xlsx"
          multiple
          className={styles.fileInput}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className={styles.dropRing} aria-hidden>
          <UploadCloud className={styles.dropRingIcon} />
        </span>
        <div className={styles.dropCopy}>
          <p className={styles.dropTitle}>
            {dragging
              ? "Drop to queue these files"
              : items.length === 0
                ? "Drag & drop SF10 files here"
                : "Drop more files to add to the queue"}
          </p>
          <p className={`${styles.dropHint} flex flex-wrap items-center justify-center gap-1.5`}>
            <FormatPills />
            <span>or click to browse · bulk select supported</span>
          </p>
        </div>
        <span className={styles.dropMeta} aria-hidden>
          <span className={styles.dropMetaItem}>Filed by LRN</span>
          <span className={styles.dropMetaDot} />
          <span className={styles.dropMetaItem}>Stored as-is</span>
          <span className={styles.dropMetaDot} />
          <span className={styles.dropMetaItem}>
            {isRegistrar ? "Extracts G11–G12 rows" : "Never creates a learner"}
          </span>
        </span>
      </div>

      {items.length > 0 ? (
        <section className={styles.queue} aria-label="Upload queue">
          <header className={styles.queueHead}>
            <span className={styles.queueTitle}>
              Queue
              <span className={styles.queueCounts}>
                {uploading ? (
                  <>
                    {progress.done} of {progress.total} filed
                  </>
                ) : (
                  <>
                    {queuedCount} queued · {doneItems} done
                    {errorCount > 0 ? ` · ${errorCount} need attention` : ""}
                  </>
                )}
              </span>
            </span>
            <span className={styles.queueProgress} aria-hidden>
              <span
                className={styles.queueProgressFill}
                style={{ width: `${uploadPercent}%` }}
              />
            </span>
          </header>

          {uploading || uploadPercent > 0 ? (
            <div
              className={styles.queueBar}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadPercent}
              aria-label="Upload progress"
            >
              <span className={styles.queueBarFill} style={{ width: `${uploadPercent}%` }} />
            </div>
          ) : null}

          <ul className={styles.queueList} aria-live="polite">
            {items.map((item) => (
              <li key={item.key} className={styles.queueItem}>
                <span className={styles.queueIcon} aria-hidden>
                  {item.status === "done" ? (
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                  ) : item.status === "uploading" ? (
                    <Loader2 size={16} className="animate-spin text-amber-600 dark:text-amber-400" />
                  ) : item.status === "error" ? (
                    <XCircle size={16} className="text-destructive" />
                  ) : (
                    <FileText size={16} className="text-muted-foreground" />
                  )}
                </span>
                <span className={styles.queueBody}>
                  <span className={styles.queueName} title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className={styles.queueMeta}>
                    {item.status === "done"
                      ? [
                          item.learnerName ?? "Filed",
                          item.subjectsRead != null
                            ? `${item.subjectsRead} subject${item.subjectsRead === 1 ? "" : "s"} read`
                            : null,
                          item.engine ? engineLabel(item.engine) : null,
                          item.lrn ? `LRN ${item.lrn}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : item.status === "uploading"
                        ? item.phase === "extracting"
                          ? `Extracting the contents${
                              item.engine ? ` with ${engineLabel(item.engine)}` : " (OCR / text)"
                            } — reading subjects and grades…`
                          : `Uploading the file${item.uploadPercent != null ? ` — ${item.uploadPercent}%` : ""} · contents are extracted as soon as it lands`
                        : item.status === "error"
                          ? (item.error ?? "Upload failed.")
                          : `${(item.file.size / 1024).toFixed(0)} KB · waiting to upload`}
                  </span>
                </span>
                <span
                  className={`${styles.queueStatus} ${
                    item.status === "done"
                      ? styles.queueStatusDone
                      : item.status === "uploading"
                        ? styles.queueStatusUploading
                        : item.status === "error"
                          ? styles.queueStatusError
                          : styles.queueStatusQueued
                  }`}
                >
                  {item.status === "done"
                    ? "Filed"
                    : item.status === "uploading"
                      ? "Uploading"
                      : item.status === "error"
                        ? "Failed"
                        : "Queued"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-1.5 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    bulk.cancelItem(item.key);
                  }}
                  aria-label={`Remove ${item.file.name}`}
                  title={`Remove ${item.file.name}`}
                >
                  <X size={14} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </KanbanBoard>
  );
}
