"use client";

import * as React from "react";
import { ArchiveRestore, CalendarClock, Inbox, Loader2, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "@/lib/api/live";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { humanizeCategory } from "@/components/anecdotal/anecdotal-record-kanban-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GlassCard } from "@/components/ui/glass-card";
import { SidePanel } from "@/components/ui/side-panel";
import { ShimmerGroup, ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { toast } from "@/components/ui/sonner";
import { useDock } from "@/components/dock/dock-store";
import {
  fetchDeletedRecords,
  restoreAnecdotalRecord,
  type MyAnecdotalRecord,
} from "@/components/ocform01/folders";
import styles from "./AnecdotalArchiveDialog.module.css";

/** "Nov 20, 2026" — the stamp under each archived card. */
function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Archive records overlay for the teacher anecdotal desk. Shared by the
 * record board (toolbar button) and the empty board, so a teacher can restore
 * removed records even before filing anything.
 *
 * Cards are ticked by clicking anywhere on them and restored in one batch —
 * per-card Restore stays for the single-record case.
 */
export function AnecdotalArchiveDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const dock = useDock();
  const [restoringIds, setRestoringIds] = React.useState<Set<string>>(new Set());
  /** Ticked archived records (record id keys). */
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const restoreDockTaskRef = React.useRef<string | null>(null);

  const deletedQuery = useLiveQuery<MyAnecdotalRecord[]>({
    queryKey: ["anecdotal-deleted"],
    queryFn: fetchDeletedRecords,
    enabled: open,
    staleTime: 15_000,
  });
  const deletedRecords = deletedQuery.data ?? [];
  // Ticks are read against the live list only, so a row that leaves the board
  // (restored elsewhere) simply drops out — no state pruning needed.

  function refreshRecords() {
    void queryClient.invalidateQueries({ queryKey: ["anecdotal-mine"] });
    void queryClient.invalidateQueries({ queryKey: ["anecdotal-deleted"] });
  }

  // Keep ticks honest when the list refetches (restored rows leave the board).
  // Read against the live list instead of pruning in an effect.
  const selectedRecords = deletedRecords.filter((r) => selected.has(r.id));
  const allSelected =
    deletedRecords.length > 0 && selectedRecords.length === deletedRecords.length;

  function toggleSelected(recordId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(deletedRecords.map((r) => r.id)));
  }

  async function handleRestore(entries: MyAnecdotalRecord[]) {
    const targets = entries.filter((entry) => !restoringIds.has(entry.id));
    if (targets.length === 0) return;
    const multi = targets.length > 1;
    setRestoringIds(new Set(targets.map((entry) => entry.id)));
    // Close the overlay as soon as the teacher confirms — the rows return to
    // the desk once the requests land, and the shared dock tracks the task.
    onClose();
    setSelected(new Set());
    restoreDockTaskRef.current = dock.startTask({
      kind: "generic",
      title: multi ? `Restoring ${targets.length} records` : "Restoring record",
      description: multi
        ? "Bringing the archived GCForm-01 records back to your desk."
        : `${targets[0].studentName} · ${humanizeCategory(targets[0].category)}`,
    });
    let restored = 0;
    let failed = 0;
    for (const entry of targets) {
      try {
        await restoreAnecdotalRecord(entry.id);
        restored += 1;
      } catch {
        failed += 1;
      }
    }
    refreshRecords();
    if (restoreDockTaskRef.current) {
      if (failed === 0) {
        dock.completeTask(
          restoreDockTaskRef.current,
          multi
            ? `${restored} records restored to your anecdotal desk.`
            : "Record restored to your anecdotal desk.",
        );
      } else if (restored === 0) {
        dock.failTask(restoreDockTaskRef.current, "Could not restore records.");
      } else {
        dock.completeTask(
          restoreDockTaskRef.current,
          `${restored} restored, ${failed} could not be restored.`,
        );
      }
      restoreDockTaskRef.current = null;
    }
    if (failed === 0) {
      toast.success({
        title: multi ? `${restored} records restored` : "Record restored",
        description: "Back on your anecdotal desk.",
      });
    } else if (restored === 0) {
      toast.error({
        title: "Could not restore record",
        description: "Check your connection and try again.",
      });
    } else {
      toast.error({
        title: `${restored} restored, ${failed} failed`,
        description: "Check your connection and restore the remaining records again.",
      });
    }
    setRestoringIds(new Set());
  }

  const busy = restoringIds.size > 0;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      width="lg"
      label="Archive records"
      showCloseButton
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border px-4 py-3 pr-12">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ArchiveRestore size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
              Archive records
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Records you removed from this desk. Restoring brings the full
              GCForm-01 back, including its follow-ups.
            </p>
          </div>
        </header>

        {deletedRecords.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all archived records"
              />
              Select all
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {deletedRecords.length} archived
            </span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex min-w-0 flex-col gap-2 px-1 pb-1">
        {deletedQuery.isPending ? (
          <ShimmerGroup>
            <div
              className="flex min-w-0 flex-col gap-2"
              role="status"
              aria-label="Loading archived records"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={styles.card} aria-hidden>
                  <div className={styles.cardHead}>
                    <ShimmerSkeleton className="size-4 rounded" />
                    <ShimmerSkeleton className="size-8 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                      <ShimmerSkeleton className="h-3.5 w-3/4 rounded" />
                      <ShimmerSkeleton className="h-5 w-28 rounded-md" />
                    </div>
                    <ShimmerSkeleton className="h-8 w-20 rounded-md" />
                  </div>
                  <ShimmerSkeleton className="h-3 w-full rounded" />
                  <div className={styles.cardFoot}>
                    <ShimmerSkeleton className="h-3 w-32 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </ShimmerGroup>
        ) : deletedRecords.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden>
              <Inbox size={15} />
            </span>
            <p className={styles.emptyTitle}>No archived records</p>
            <p className={styles.emptyCopy}>
              Deleting a record from its preview keeps it here, so you can bring
              the full GCForm-01 back whenever you need it.
            </p>
          </div>
        ) : (
          deletedRecords.map((entry) => {
            const checked = selected.has(entry.id);
            const restoring = restoringIds.has(entry.id);
            return (
              <GlassCard key={entry.id} intensity={4} className="min-w-0">
                <article
                  className={`${styles.card}${checked ? ` ${styles.cardSelected}` : ""}`}
                  aria-label={`${entry.studentName}, ${entry.lrn}`}
                  role="checkbox"
                  aria-checked={checked}
                  tabIndex={0}
                  onClick={() => toggleSelected(entry.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleSelected(entry.id);
                    }
                  }}
                >
                  <header className={styles.cardHead}>
                    <span
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSelected(entry.id)}
                        aria-label={`Select ${entry.studentName}'s record for restoring`}
                      />
                    </span>
                    <StudentMascot
                      name={entry.studentName}
                      seed={entry.lrn}
                      character={entry.mascot ?? undefined}
                      size={32}
                    />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <p className={styles.cardName} title={entry.studentName}>
                        {entry.studentName}
                      </p>
                    </div>
                    <p className={styles.cardTags}>
                      <span>
                        Category:{" "}
                        <span className="font-medium text-foreground">
                          {humanizeCategory(entry.category)}
                        </span>
                      </span>
                      {entry.termNumber ? (
                        <>
                          <span aria-hidden className="text-border">
                            |
                          </span>
                          <span>
                            Term:{" "}
                            <span className="font-medium text-foreground">
                              Term {entry.termNumber}
                            </span>
                          </span>
                        </>
                      ) : null}
                    </p>
                  </header>
                  {entry.incident?.trim() ? (
                    <p className={styles.cardIncident}>{entry.incident.trim()}</p>
                  ) : null}
                  <div className={styles.cardFoot}>
                    <span className={styles.cardMeta}>
                      <CalendarClock size={12} aria-hidden />
                      Archived {longDate(entry.deletedAt ?? entry.observationDatetime)}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {entry.folderName ? (
                        <span className={styles.cardMeta}>{entry.folderName}</span>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRestore([entry]);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        disabled={busy}
                      >
                        {restoring ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                          <RotateCcw size={14} aria-hidden />
                        )}
                        Restore
                      </Button>
                    </div>
                  </div>
                </article>
              </GlassCard>
            );
          })
        )}
        </div>
        </div>

        {deletedRecords.length > 0 ? (
          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {selectedRecords.length > 0
                ? `${selectedRecords.length} selected`
                : "Click a card to tick it"}
            </span>
            <Button
              type="button"
              size="sm"
              className="gap-1"
              disabled={selectedRecords.length === 0 || busy}
              onClick={() => void handleRestore(selectedRecords)}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <RotateCcw size={14} aria-hidden />
              )}
              Restore selected{selectedRecords.length > 0 ? ` (${selectedRecords.length})` : ""}
            </Button>
          </footer>
        ) : null}
      </div>
    </SidePanel>
  );
}
