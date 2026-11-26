"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { ScrollList } from "@/components/ui/scroll-list";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/errors";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";
import { toast } from "@/components/ui/sonner";
import { isOptimisticId, markOptimisticCancelled } from "./schedule-optimistic";
import type { ScheduleSubject } from "../page";

export type SubjectDeleteRowState = {
  id: string;
  name: string;
  code: string;
  gradeLevel: string;
  status: "deleting" | "deleted" | "failed";
  message?: string;
};

export type SubjectDeleteProgress = {
  active: boolean;
  done: boolean;
  rows: SubjectDeleteRowState[];
  startedAt: number;
};

const DELETE_STEPS = ["Resolving subjects", "Removing timetable links", "Confirming catalog"];

function gradeLabel(gradeLevel: string): string {
  return `Grade ${gradeLevel.replace("G", "")}`;
}

/**
 * Multi-subject delete with low latency: every ticked subject is evicted
 * from all cached subject lists instantly (grid updates this tick), then the
 * DELETEs flush in the background with per-row dock updates. Failed rows are
 * re-inserted so they reappear in the grid.
 */
export function useSubjectDelete(onProgress?: (p: SubjectDeleteProgress | null) => void) {
  const qc = useQueryClient();
  const invalidateSchedule = useAdminScheduleInvalidate();
  const [deleting, setDeleting] = useState(false);
  const busyRef = useRef(false);

  const evict = useCallback(
    (ids: Set<string>) => {
      for (const entry of qc.getQueryCache().findAll({ queryKey: ["admin-schedule-subjects"] })) {
        qc.setQueryData(entry.queryKey, (prev: unknown) => {
          if (Array.isArray(prev)) {
            return (prev as ScheduleSubject[]).filter((s) => !ids.has(s.id));
          }
          if (prev && typeof prev === "object" && Array.isArray((prev as { subjects?: unknown }).subjects)) {
            return {
              ...(prev as Record<string, unknown>),
              subjects: ((prev as { subjects: ScheduleSubject[] }).subjects ?? []).filter(
                (s) => !ids.has(s.id),
              ),
            };
          }
          return prev;
        });
      }
    },
    [qc],
  );

  const reinsert = useCallback(
    (restored: ScheduleSubject[]) => {
      if (restored.length === 0) return;
      for (const entry of qc.getQueryCache().findAll({ queryKey: ["admin-schedule-subjects"] })) {
        qc.setQueryData(entry.queryKey, (prev: unknown) => {
          if (Array.isArray(prev)) {
            const known = new Set((prev as ScheduleSubject[]).map((s) => s.id));
            return [...(prev as ScheduleSubject[]), ...restored.filter((s) => !known.has(s.id))];
          }
          if (prev && typeof prev === "object" && Array.isArray((prev as { subjects?: unknown }).subjects)) {
            const list = (prev as { subjects: ScheduleSubject[] }).subjects ?? [];
            const known = new Set(list.map((s) => s.id));
            return {
              ...(prev as Record<string, unknown>),
              subjects: [...list, ...restored.filter((s) => !known.has(s.id))],
            };
          }
          return prev;
        });
      }
    },
    [qc],
  );

  const deleteSubjects = useCallback(
    async (targets: ScheduleSubject[]) => {
      if (targets.length === 0 || busyRef.current) return;
      busyRef.current = true;
      setDeleting(true);
      const rows: SubjectDeleteRowState[] = targets.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        gradeLevel: t.gradeLevel,
        status: "deleting",
      }));
      const startedAt = Date.now();
      const report = (next: SubjectDeleteRowState[], active: boolean) =>
        onProgress?.({ active, done: !active, rows: [...next], startedAt });
      // Instant grid update — and cancel any in-flight list fetch so a stale
      // response can't paint the rows back after they are evicted.
      await qc.cancelQueries({ queryKey: ["admin-schedule-subjects"] });
      evict(new Set(targets.map((t) => t.id)));
      report(rows, true);
      const failed: ScheduleSubject[] = [];
      await Promise.all(
        targets.map(async (t, i) => {
          // A row still waiting on its POST has no server id yet. Mark it
          // cancelled (the add mutation compensates) instead of firing a 404.
          if (isOptimisticId(t.id)) {
            markOptimisticCancelled(t.id);
            rows[i] = { ...rows[i], status: "deleted" };
            report(rows, true);
            return;
          }
          try {
            await apiClient.delete(`/api/admin/schedule/subjects/${t.id}`);
            rows[i] = { ...rows[i], status: "deleted" };
          } catch (err) {
            // Already gone (e.g. deleted from another tab) — not a failure.
            if ((err as { response?: { status?: number } })?.response?.status === 404) {
              rows[i] = { ...rows[i], status: "deleted" };
              report(rows, true);
              return;
            }
            const message = apiErrorMessage(err, "Failed to delete subject.");
            rows[i] = { ...rows[i], status: "failed", message };
            failed.push(t);
          }
          report(rows, true);
        }),
      );
      if (failed.length > 0) reinsert(failed);
      // Re-evict the rows the server confirmed gone: a list fetch that started
      // before the DELETEs committed can still resolve with them.
      evict(new Set(rows.filter((r) => r.status === "deleted").map((r) => r.id)));
      invalidateSchedule();
      const ok = rows.filter((r) => r.status === "deleted").length;
      if (ok > 0) {
        toast.success({
          title: `${ok} subject${ok === 1 ? "" : "s"} deleted`,
          description: "Removed from the catalog immediately.",
        });
      }
      if (failed.length > 0) {
        toast.error({
          title: `${failed.length} subject${failed.length === 1 ? "" : "s"} not deleted`,
          description: rows.find((r) => r.status === "failed")?.message ?? "Failed to delete.",
        });
      }
      report(rows, false);
      busyRef.current = false;
      setDeleting(false);
    },
    [evict, invalidateSchedule, onProgress, qc, reinsert],
  );

  return { deleteSubjects, deleting };
}

interface ConfirmProps {
  subjects: ScheduleSubject[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SubjectDeleteConfirm({ subjects, pending, onCancel, onConfirm }: ConfirmProps) {
  const count = subjects.length;

  return (
    <ConfirmDialog
      tone="danger"
      title={count === 1 ? "Delete this subject?" : `Delete ${count} subjects?`}
      description="This cannot be undone. Subjects already used by a timetable, assignment, or gradebook record are locked and were left out."
      icon={<Trash2 size={16} />}
      cancelLabel="Keep them"
      confirmLabel="Confirm delete"
      confirmIcon={<Trash2 size={13} />}
      pendingLabel="Deleting…"
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function DeleteDockRows({ rows }: { rows: SubjectDeleteRowState[] }) {
  return (
    <ScrollList as="ul" className="max-h-56 gap-1" ariaLabel="Subjects in this deletion">
      {rows.map((r) => (
        <li key={r.id} className="flex min-w-0 items-center gap-2 rounded px-1 py-1">
          <span className="shrink-0" aria-hidden>
            {r.status === "deleted" ? (
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
            ) : r.status === "failed" ? (
              <XCircle size={15} className="text-destructive" />
            ) : (
              <Loader2 size={15} className="animate-spin text-muted-foreground" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium" title={r.name}>
              {r.name}
            </span>
            <span className="truncate font-mono text-[12px] text-muted-foreground" title={`${r.code} · ${gradeLabel(r.gradeLevel)}`}>
              {r.code} · {gradeLabel(r.gradeLevel)}
            </span>
          </span>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {r.status === "deleted" ? "Deleted" : r.status === "failed" ? (r.message ?? "Failed") : "Deleting…"}
          </span>
        </li>
      ))}
    </ScrollList>
  );
}

export { DELETE_STEPS };
