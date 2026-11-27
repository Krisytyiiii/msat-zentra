"use client";

import * as React from "react";
import { FileSpreadsheet, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FolderCard } from "@/components/ui/FolderCard";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { PageEmptyCallout } from "@/components/shared/page-empty-callout";
import { Pill } from "@/components/ui/pill";
import { SharedTermPill } from "@/components/shared/shared-term-pill";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";
import { sf10StatusLabel, sf10StatusTone } from "@/lib/labels/status-tone";
import { StudentMascot } from "../../referrals/components/StudentMascot";
import type { HasRow } from "@/services/teacher/sf10Access.service";
import { Sf10FolderCardSkeleton } from "./Sf10PageSkeleton";
import styles from "./sf10-repo-folders.module.css";

function fileExtOf(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  } catch {
    return url.split("?")[0].split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  }
}

const STATUS_TONES: Record<HasRow["sf10Status"], 1 | 2 | 3 | 4 | 5> = {
  pending: 1,
  verified: 3,
  validated: 5,
};

/** The file a granted learner's folder opens: the registry upload wins, and a
 * Bama render is the fallback when the desk has not filed an original. */
function fileFor(row: HasRow): { url: string; autoFill: boolean } {
  const original = row.record?.fileUrl;
  if (original) return { url: original, autoFill: false };
  const autoFill = row.record?.autoFill?.fileUrl;
  if (autoFill) return { url: autoFill, autoFill: true };
  return { url: "", autoFill: false };
}

interface Sf10RepoFoldersProps {
  rows: HasRow[];
  query: string;
  onQueryChange: (value: string) => void;
  canAct: boolean | undefined;
  pending: boolean;
  error: boolean;
  denied: boolean;
  onOpen: (fileUrl: string) => void;
  /** Build and download the learner's SF10 from locked grades (Excel or PDF). */
  onDownload?: (row: HasRow, format: "xlsx" | "pdf") => void;
  /** The learner whose download is currently being built. */
  downloading?: { lrn: string; format: "xlsx" | "pdf" } | null;
  /** Opens the Bama drawer on the SF10 access request flow. */
  onRequest?: () => void;
}

export function Sf10RepoFolders({
  rows,
  query,
  onQueryChange,
  canAct,
  pending,
  error,
  denied,
  onOpen,
  onDownload,
  downloading,
  onRequest,
}: Sf10RepoFoldersProps) {
  const [page, setPage] = React.useState(1);

  // One folder per granted learner: the registry upload and a Bama render are
  // the same student's record, so they never occupy two cards.
  const fileRows = React.useMemo(
    () => rows.filter((r) => !!fileFor(r).url),
    [rows],
  );

  const totalPages = Math.max(1, Math.ceil(fileRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = fileRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const needle = query.trim();

  return (
    <div className={`${styles.panel} flex flex-1 flex-col`}>
      <div className={styles.header}>
        <TeacherSearchField
          className={styles.search}
          placeholder="Search folders…"
          value={query}
          onChange={(next) => {
            onQueryChange(next);
            setPage(1);
          }}
          aria-label="Search folders"
        />
        <Button
          type="button"
          onClick={onRequest}
          disabled={!onRequest}
          className="shrink-0 gap-1.5"
          aria-label="Request SF10 access"
        >
          <Send size={14} aria-hidden />
          Request
        </Button>
      </div>
      <div className={styles.content}>
        <div className={styles.scrollArea}>
          {pending ? (
            <div className={styles.folderGrid} aria-busy="true" aria-label="Loading approved files">
              {Array.from({ length: 6 }).map((_, i) => (
                <Sf10FolderCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className={styles.emptyCenter}>
              <PageEmptyCallout fit>
                <strong>Could not load verification.</strong> The approved list could not be
                loaded for this request. Check your connection and try again.
              </PageEmptyCallout>
            </div>
          ) : pageRows.length === 0 && needle ? (
            <div className={styles.emptyCenter}>
              <PageEmptyCallout fit>
                {searchEmptyMessage(query, "folders")}
              </PageEmptyCallout>
            </div>
          ) : pageRows.length === 0 ? (
            <div className={styles.emptyCenter}>
              <PageEmptyCallout fit>
                {denied ? (
                  <>
                    <strong>This request was denied.</strong> See the rejected list on the right
                    for the registrar or record keeper&apos;s reason.
                  </>
                ) : (
                  <>
                    <strong>No approved files yet.</strong> Approved students appear here as
                    folders once the registrar or record keeper grants access.
                  </>
                )}
              </PageEmptyCallout>
            </div>
          ) : (
            <div className={styles.folderGrid}>
              {pageRows.map((full) => {
                const file = fileFor(full);
                const ext = fileExtOf(file.url);
                const icon = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)
                  ? ("image" as const)
                  : ["xlsx", "xls"].includes(ext)
                    ? ("chart" as const)
                    : ("doc" as const);
                const viewable = !!file.url && !!canAct;
                const busy = downloading?.lrn === full.lrn;
                const tag = file.autoFill
                  ? `Bama v${full.record?.autoFill?.version ?? full.record?.currentVersion ?? 1} · ${full.gradeLevel} · ${full.section}`
                  : `${sf10StatusLabel(full.sf10Status)} · ${full.gradeLevel} · ${full.section}`;
                return (
                  <div
                    key={full.lrn}
                    className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/60 p-2.5 text-left transition-colors [font-family:var(--font-inter)] hover:border-primary/60 hover:shadow dark:bg-muted/20"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (viewable) onOpen(file.url);
                      }}
                      disabled={!viewable}
                      aria-label={
                        viewable
                          ? `Open ${full.name}'s ${file.autoFill ? "Bama auto-fill" : "original"} SF10 file in a new tab (view only, no download)`
                          : `${full.name}'s ${file.autoFill ? "auto-fill" : "original"} SF10 file (not viewable yet)`
                      }
                      title={viewable ? "Open record in a new tab — view only" : undefined}
                      className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg text-left disabled:cursor-default"
                    >
                      <span className="-mx-2.5 flex min-w-0 items-center gap-1.5 border-b border-border px-3.5 pb-2">
                        <Pill
                          tone={file.autoFill ? "blue" : sf10StatusTone(full.sf10Status)}
                          className="gap-1.5"
                        >
                          <FileText size={12} aria-hidden />
                          <span className="truncate">
                            {file.autoFill ? "Bama auto-fill" : sf10StatusLabel(full.sf10Status)}
                          </span>
                        </Pill>
                        <SharedTermPill termNumber={full.grantedTermNumber} action="Granted" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm dark:bg-card">
                        <span className="flex min-w-0 items-center gap-2">
                          <StudentMascot
                            name={full.name}
                            seed={full.lrn}
                            character={full.mascot ?? undefined}
                            size={32}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <Pill tone="amber" className="w-fit max-w-full" title={full.name}>
                              <span className="truncate">{full.name}</span>
                            </Pill>
                            <Pill
                              tone="neutral"
                              label="LRN"
                              className="w-fit max-w-full"
                              title={`${full.lrn} · ${full.gradeLevel} · ${full.section}`}
                            >
                              <span className="truncate">{full.lrn}</span>
                            </Pill>
                          </span>
                        </span>
                        <span className="flex w-full justify-center">
                          <span className="w-full max-w-[220px]">
                            <FolderCard
                              label=""
                              folderColor="#f59e0b"
                              files={[
                                {
                                  name: ext ? `SF10.${ext}` : "SF10 file",
                                  tag,
                                  tone: STATUS_TONES[full.sf10Status] ?? 1,
                                  icon,
                                },
                              ]}
                            />
                          </span>
                        </span>
                      </span>
                    </button>
                    {onDownload && canAct ? (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-0 flex-1 gap-1.5"
                          onClick={() => onDownload(full, "xlsx")}
                          disabled={busy}
                          aria-label={`Build and download ${full.name}'s SF10 as Excel`}
                        >
                          <FileSpreadsheet size={14} aria-hidden />
                          {busy && downloading?.format === "xlsx" ? "Building…" : "Excel"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-0 flex-1 gap-1.5"
                          onClick={() => onDownload(full, "pdf")}
                          disabled={busy}
                          aria-label={`Build and download ${full.name}'s SF10 as PDF`}
                        >
                          <FileText size={14} aria-hidden />
                          {busy && downloading?.format === "pdf" ? "Building…" : "PDF"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Pagination
          currentPage={safePage}
          totalItems={fileRows.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
