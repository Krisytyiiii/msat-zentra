"use client";

import * as React from "react";
import {
  ArchiveRestore,
  Files,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { anecdotalCategoryBadgeVariant } from "@/lib/labels/anecdotal";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { OcForm01PreviewDialog } from "@/components/ocform01/OcForm01PreviewDialog";
import {
  AnecdotalRecordKanbanCard,
  humanizeCategory,
} from "@/components/anecdotal/anecdotal-record-kanban-card";
import { Button } from "@/components/ui/button";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { InsightCallout } from "@/components/ui/insight-callout";
import { MessageOverlay } from "@/components/ui/message-overlay";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pill } from "@/components/ui/pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { useDock } from "@/components/dock/dock-store";
import {
  deleteAnecdotalRecord,
  type MyAnecdotalRecord,
} from "@/components/ocform01/folders";
import styles from "./anecdotal-repo-folders.module.css";
import { AnecdotalArchiveDialog } from "./AnecdotalArchiveDialog";
import { getLegendEntries } from "./AnecdotalSideRail";
import { PAGE_SIZE, Pagination } from "@/components/shared/pagination";

/** Folder-category legend — supplies the category tiles' labels and hints. */
const LEGEND_ENTRIES = getLegendEntries("category");

/** Filter tabs: every record, then one tab per category in legend order. */
const TYPE_TABS = [
  { key: "all", label: "All" },
  ...LEGEND_ENTRIES.map((entry) => ({ key: entry.key, label: entry.label })),
];

/** Dot tone per tab, mirroring the legend chip colours. */
const TAB_TONES: Record<
  string,
  "amber" | "blue" | "green" | "red" | "neutral"
> = {
  all: "neutral",
  behavioral: "amber",
  bullying: "red",
  academic: "blue",
  attendance: "green",
  health: "neutral",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then) || then < Date.UTC(2000, 0, 1)) return "-";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function recordDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function AnecdotalRepoFolders({
  records,
  toolbarActions,
  onEditRecord,
}: {
  records: MyAnecdotalRecord[];
  toolbarActions?: React.ReactNode;
  /** Reopen a filed record in the chat drawer instead of leaving the desk. */
  onEditRecord?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const dock = useDock();
  const [page, setPage] = React.useState(1);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<MyAnecdotalRecord | null>(null);
  const [editTarget, setEditTarget] = React.useState<MyAnecdotalRecord | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deletedOpen, setDeletedOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [categoryKey, setCategoryKey] = React.useState("all");
  const deleteDockTaskRef = React.useRef<string | null>(null);

  function refreshRecords() {
    void queryClient.invalidateQueries({ queryKey: ["anecdotal-mine"] });
    void queryClient.invalidateQueries({ queryKey: ["anecdotal-deleted"] });
  }

  async function handleDelete(entry: MyAnecdotalRecord) {
    if (deleting) return;
    // Close the confirm overlay as soon as the teacher confirms — the record
    // disappears from the grid once the request lands, and any failure is
    // reported by toast instead of leaving the dialog stuck on "Deleting…".
    setDeleting(true);
    setDeleteTarget(null);
    setPreviewId(null);
    deleteDockTaskRef.current = dock.startTask({
      kind: "generic",
      title: "Deleting record",
      description: `${entry.studentName} · ${humanizeCategory(entry.category)}`,
    });
    try {
      await deleteAnecdotalRecord(entry.id);
      refreshRecords();
      if (deleteDockTaskRef.current) {
        dock.completeTask(
          deleteDockTaskRef.current,
          "Record moved to Archive records — restore any time.",
        );
        deleteDockTaskRef.current = null;
      }
      toast.success({
        title: "Record deleted",
        description: "You can restore it any time from Archive records.",
      });
    } catch (e) {
      const message =
        (e as { response?: { data?: { error?: { message?: unknown } } } })?.response?.data
          ?.error?.message;
      const description =
        typeof message === "string" && message.trim()
          ? message
          : "Check your connection and try again.";
      if (deleteDockTaskRef.current) {
        dock.failTask(deleteDockTaskRef.current, description);
        deleteDockTaskRef.current = null;
      }
      toast.error({ title: "Could not delete record", description });
    } finally {
      setDeleting(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = React.useMemo(() => {
    const typed =
      categoryKey === "all"
        ? records
        : records.filter(
            (c) => (c.category ?? "").trim().toLowerCase() === categoryKey,
          );
    if (!needle) return typed;
    return typed.filter(
      (c) =>
        c.studentName.toLowerCase().includes(needle) ||
        c.lrn.toLowerCase().includes(needle) ||
        c.section.toLowerCase().includes(needle),
    );
  }, [records, needle, categoryKey]);

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: records.length };
    for (const record of records) {
      const key = (record.category ?? "").trim().toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [records]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <div className={`${styles.panel} flex flex-1 flex-col`}>
        <header className={styles.deskHead}>
          <span className={styles.deskBadge} aria-hidden>
            <Files size={16} />
          </span>
          <div className={styles.deskHeading}>
            <h1 className={styles.deskTitle}>Filed anecdotal records</h1>
          </div>
          <div className={styles.deskTools}>
            <TeacherSearchField
              className="w-full max-w-56"
              placeholder="Search folders…"
              value={query}
              onChange={(next) => {
                setQuery(next);
                setPage(1);
              }}
              aria-label="Search folders"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 shrink-0 rounded-full px-2 text-xs"
              onClick={() => setDeletedOpen(true)}
            >
              <ArchiveRestore size={14} aria-hidden />
              Archive records
            </Button>
            {toolbarActions}
          </div>
        </header>

        <FilterTabs
          label="Filter records by type"
          variant="tags"
          value={categoryKey}
          onChange={(next) => {
            setCategoryKey(next);
            setPage(1);
          }}
          options={TYPE_TABS.map((tab) => ({
            value: tab.key,
            label: tab.label,
            count: categoryCounts[tab.key] ?? 0,
            tone: TAB_TONES[tab.key] ?? ("neutral" as const),
          }))}
        />

        <div className={styles.content}>
          <div className={styles.scrollArea}>
          {records.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No filed records yet</p>
              <p className={styles.emptyBody}>
                File your first anecdotal record with Bama and it will land here.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  window.open("/teacher/chat?standalone=1&new=anecdotal", "_blank", "noopener,noreferrer")
                }
              >
                <Plus aria-hidden />
                New record
              </Button>
            </div>
          ) : pageRows.length === 0 && (needle || categoryKey !== "all") ? (
            <div className="flex w-full flex-1 items-center justify-center px-1 py-10">
              <InsightCallout role="status" className="w-full max-w-xl text-left">
                {needle
                  ? searchEmptyMessage(query, "folders", "Try a different name, LRN, or section.")
                  : `No ${
                      TYPE_TABS.find((tab) => tab.key === categoryKey)?.label ??
                      categoryKey
                    } records filed this school year.`}
              </InsightCallout>
            </div>
          ) : pageRows.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No filed records on this page</p>
              <p className={styles.emptyBody}>
                File your first anecdotal record with Bama and it will land here.
              </p>
            </div>
          ) : (
            <div className={styles.folderGrid}>
              {pageRows.map((c) => (
                <GlassCard key={c.id} className="flex min-w-0 flex-1" intensity={5} disabled>
                  <AnecdotalRecordKanbanCard
                    variant="glass"
                    category={c.category}
                    studentName={c.studentName}
                    mascotSeed={c.lrn}
                    mascotCharacter={c.mascot ?? undefined}
                    mascotSize={44}
                    metaText={c.lrn}
                    metaLabel="LRN"
                    metaClassName="h-6 leading-none"
                    metaTitle={`${c.lrn} · ${c.section}`}
                    plainMeta
                    fileName={`GCForm-01_${recordDate(c.observationDatetime)}`}
                    fileTag={`${humanizeCategory(c.category)} - ${timeAgo(c.observationDatetime)}`}
                    headerRight={
                      <span className="flex shrink-0 items-center gap-1.5">
                        {c.edited ? (
                          <Pill
                            tone="teal"
                            label="Edited after filing — this record is no longer the original."
                          >
                            Edited
                          </Pill>
                        ) : null}
                        {c.signed ? (
                          <Badge variant="green" className="shrink-0 rounded-md">
                            Signed
                          </Badge>
                        ) : null}
                      </span>
                    }
                    openLabel={`Open ${c.studentName}'s record from ${recordDate(c.observationDatetime)}`}
                    onOpen={() => setPreviewId(c.id)}
                    actions={
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="outline"
                              aria-label={`Edit record context for ${c.studentName}`}
                              onClick={() => {
                                setPreviewId(null);
                                setEditTarget(c);
                              }}
                            >
                              <Pencil aria-hidden />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Edit record context
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="destructive"
                              className="border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700 dark:border-red-500/45 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 dark:hover:text-red-300"
                              aria-label={`Delete record for ${c.studentName}`}
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Delete record</TooltipContent>
                        </Tooltip>
                      </>
                    }
                  />
                </GlassCard>
              ))}
            </div>
          )}
          </div>
          <Pagination
            currentPage={safePage}
            totalItems={visible.length}
            onPageChange={setPage}
          />
        </div>
      </div>

      <OcForm01PreviewDialog recordId={previewId} onClose={() => setPreviewId(null)} />

      {editTarget ? (
        <MessageOverlay
          width="sm"
          tone="warning"
          icon={<Pencil size={16} aria-hidden />}
          title="Edit this record?"
          description={`${editTarget.studentName}'s filed record reopens in chat so you can correct it.`}
          detail="Saving replaces the filed copy. The original version stays in the record's history."
          onDismiss={() => setEditTarget(null)}
          actions={
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const id = editTarget.id;
                  setEditTarget(null);
                  onEditRecord?.(id);
                }}
              >
                <Pencil aria-hidden />
                Continue to edit
              </Button>
            </>
          }
        >
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
              <StudentMascot
                name={editTarget.studentName}
                seed={editTarget.lrn}
                character={editTarget.mascot ?? undefined}
                size={36}
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-[13px] font-semibold leading-tight">
                {editTarget.studentName}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {humanizeCategory(editTarget.category)} · Filed{" "}
                {recordDate(editTarget.observationDatetime)}
              </p>
            </div>
            <Pill
              tone={editTarget.edited ? "teal" : "neutral"}
              label={
                editTarget.edited
                  ? "This record has already been edited once."
                  : "This is the original record — it has not been edited."
              }
            >
              {editTarget.edited ? "Edited" : "Original"}
            </Pill>
          </div>
        </MessageOverlay>
      ) : null}

      {deleteTarget ? (
        <MessageOverlay
          width="md"
          tone="danger"
          role="alertdialog"
          icon={<Trash2 size={16} aria-hidden />}
          title="Delete this record?"
          description="This hides the record from your filed desk."
          dismissable={!deleting}
          onDismiss={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          actions={
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                disabled={deleting}
                onClick={() => {
                  if (deleteTarget) void handleDelete(deleteTarget);
                }}
              >
                {deleting ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 aria-hidden />
                )}
                {deleting ? "Deleting…" : "Delete record"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
                <StudentMascot
                  name={deleteTarget.studentName}
                  seed={deleteTarget.lrn}
                  character={deleteTarget.mascot ?? undefined}
                  size={36}
                />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-[13px] font-semibold leading-tight">
                  {deleteTarget.studentName}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {deleteTarget.section} · Filed{" "}
                  {recordDate(deleteTarget.observationDatetime)}
                </p>
              </div>
              <Pill
                tone={deleteTarget.edited ? "teal" : "neutral"}
                label={
                  deleteTarget.edited
                    ? "This record has been edited since it was filed."
                    : "This is the original record — it has not been edited."
                }
              >
                {deleteTarget.edited ? "Edited" : "Original"}
              </Pill>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border px-2.5 py-2">
                <dt className="text-[12px] font-medium text-muted-foreground">LRN</dt>
                <dd className="truncate text-[13px] font-semibold tabular-nums">
                  {deleteTarget.lrn}
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border px-2.5 py-2">
                <dt className="text-[12px] font-medium text-muted-foreground">
                  Category
                </dt>
                <dd className="flex min-w-0">
                  <Pill
                    tone={
                      anecdotalCategoryBadgeVariant(deleteTarget.category) ?? "neutral"
                    }
                    label="Category"
                  >
                    {humanizeCategory(deleteTarget.category)}
                  </Pill>
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[12px] leading-snug text-amber-800 dark:text-amber-300">
              <ArchiveRestore size={13} className="mt-px shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Reversible.</span> The record moves to
                Archive records and can be restored whenever you need it.
              </span>
            </p>
          </div>
        </MessageOverlay>
      ) : null}

      <AnecdotalArchiveDialog open={deletedOpen} onClose={() => setDeletedOpen(false)} />
    </>
  );
}
