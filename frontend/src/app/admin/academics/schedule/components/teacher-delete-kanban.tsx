"use client";

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { ScrollList } from "@/components/ui/scroll-list";
import { Pill } from "@/components/ui/pill";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/errors";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";
import { toast } from "@/components/ui/sonner";
import { isOptimisticId, markOptimisticCancelled } from "./schedule-optimistic";
import type { CatalogTeacher } from "./use-schedule-catalog";

export type TeacherDeleteRowState = {
  id: string;
  name: string;
  code: string | null;
  status: "deleting" | "deleted" | "failed";
  message?: string;
};

export type TeacherDeleteProgress = {
  active: boolean;
  done: boolean;
  rows: TeacherDeleteRowState[];
  startedAt: number;
};

const TEACHER_DELETE_STEPS = ["Resolving names", "Removing timetable links", "Confirming catalog"];

/**
 * Rectangular amber code pill for the teacher list — 12px Inter, amber in
 * both modes (dark: amber-400, light: amber-700).
 */
export function TeacherCodePill({ code }: { code: string | null }) {
  return <Pill tone="amber">{code ?? "—"}</Pill>;
}

/**
 * Multi-teacher delete with low latency: every ticked name is evicted from
 * all cached teacher lists instantly (grid updates this tick), then the
 * DELETEs flush in the background with per-row dock updates. Failed rows are
 * re-inserted so they reappear in the list.
 */
export function useTeacherDelete(onProgress?: (p: TeacherDeleteProgress | null) => void) {
  const qc = useQueryClient();
  const invalidateSchedule = useAdminScheduleInvalidate();
  const busyRef = useRef(false);

  const evict = useCallback(
    (ids: Set<string>) => {
      for (const entry of qc.getQueryCache().findAll({ queryKey: ["admin-schedule-teachers"] })) {
        qc.setQueryData(entry.queryKey, (prev: unknown) => {
          if (Array.isArray(prev)) {
            return (prev as CatalogTeacher[]).filter((t) => !ids.has(t.id));
          }
          if (prev && typeof prev === "object" && Array.isArray((prev as { teachers?: unknown }).teachers)) {
            return {
              ...(prev as Record<string, unknown>),
              teachers: ((prev as { teachers: CatalogTeacher[] }).teachers ?? []).filter(
                (t) => !ids.has(t.id),
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
    (restored: CatalogTeacher[]) => {
      if (restored.length === 0) return;
      for (const entry of qc.getQueryCache().findAll({ queryKey: ["admin-schedule-teachers"] })) {
        qc.setQueryData(entry.queryKey, (prev: unknown) => {
          if (Array.isArray(prev)) {
            const known = new Set((prev as CatalogTeacher[]).map((t) => t.id));
            return [...(prev as CatalogTeacher[]), ...restored.filter((t) => !known.has(t.id))];
          }
          if (prev && typeof prev === "object" && Array.isArray((prev as { teachers?: unknown }).teachers)) {
            const list = (prev as { teachers: CatalogTeacher[] }).teachers ?? [];
            const known = new Set(list.map((t) => t.id));
            return {
              ...(prev as Record<string, unknown>),
              teachers: [...list, ...restored.filter((t) => !known.has(t.id))],
            };
          }
          return prev;
        });
      }
    },
    [qc],
  );

  const deleteTeachers = useCallback(
    async (targets: CatalogTeacher[]) => {
      if (targets.length === 0 || busyRef.current) return;
      busyRef.current = true;
      const rows: TeacherDeleteRowState[] = targets.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        status: "deleting",
      }));
      const startedAt = Date.now();
      const report = (next: TeacherDeleteRowState[], active: boolean) =>
        onProgress?.({ active, done: !active, rows: [...next], startedAt });
      // Instant list update — and cancel any in-flight list fetch so a stale
      // response can't paint the rows back after they are evicted.
      await qc.cancelQueries({ queryKey: ["admin-schedule-teachers"] });
      evict(new Set(targets.map((t) => t.id)));
      report(rows, true);
      const failed: CatalogTeacher[] = [];
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
            await apiClient.delete(`/api/admin/schedule/teachers/${t.id}`);
            rows[i] = { ...rows[i], status: "deleted" };
          } catch (err) {
            // Already gone (e.g. deleted from another tab) — not a failure.
            if ((err as { response?: { status?: number } })?.response?.status === 404) {
              rows[i] = { ...rows[i], status: "deleted" };
              report(rows, true);
              return;
            }
            const message = apiErrorMessage(err, "Failed to delete teacher.");
            rows[i] = { ...rows[i], status: "failed", message };
            failed.push(t);
          }
          report(rows, true);
        }),
      );
      if (failed.length > 0) reinsert(failed);
      // Re-evict the rows the server confirmed gone: a list fetch that started
      // before the DELETEs committed can still resolve with them and would
      // otherwise bring them back on screen.
      evict(new Set(rows.filter((r) => r.status === "deleted").map((r) => r.id)));
      invalidateSchedule();
      const ok = rows.filter((r) => r.status === "deleted").length;
      if (ok > 0) {
        toast.success({
          title: `${ok} teacher${ok === 1 ? "" : "s"} deleted`,
          description: "Removed from the catalog immediately.",
        });
      }
      if (failed.length > 0) {
        toast.error({
          title: `${failed.length} teacher${failed.length === 1 ? "" : "s"} not deleted`,
          description: rows.find((r) => r.status === "failed")?.message ?? "Failed to delete.",
        });
      }
      report(rows, false);
      busyRef.current = false;
    },
    [evict, invalidateSchedule, onProgress, qc, reinsert],
  );

  return { deleteTeachers };
}

interface ConfirmProps {
  teachers: CatalogTeacher[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function TeacherDeleteConfirm({ teachers, onCancel, onConfirm }: ConfirmProps) {
  const count = teachers.length;

  return (
    <ConfirmDialog
      tone="danger"
      title={count === 1 ? "Delete this teacher?" : `Delete ${count} teachers?`}
      description="This cannot be undone. Names already used in a timetable, carrying term grants, or linked to a teacher account are locked and were left out."
      icon={<Trash2 size={16} />}
      cancelLabel="Keep them"
      confirmLabel="Confirm delete"
      confirmIcon={<Trash2 size={13} />}
      pendingLabel="Deleting…"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function TeacherDeleteDockRows({ rows }: { rows: TeacherDeleteRowState[] }) {
  return (
    <ScrollList as="ul" className="max-h-56 gap-1" ariaLabel="Teachers in this deletion">
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
            <span className="truncate font-sans text-xs font-medium" title={r.name}>
              {r.name}
            </span>
            <span className="truncate font-sans text-[12px] text-muted-foreground" title={r.code ?? "—"}>
              {r.code ?? "—"}
            </span>
          </span>
          <span className="shrink-0 font-sans text-[12px] text-muted-foreground">
            {r.status === "deleted" ? "Deleted" : r.status === "failed" ? (r.message ?? "Failed") : "Deleting…"}
          </span>
        </li>
      ))}
    </ScrollList>
  );
}

export { TEACHER_DELETE_STEPS };
