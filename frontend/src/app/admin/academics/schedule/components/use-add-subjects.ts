"use client";
import { useCallback, useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useAdminScheduleInvalidate } from "./use-admin-schedule-invalidate";
import { toast } from "@/components/ui/sonner";
import { consumeOptimisticCancelled } from "./schedule-optimistic";
import { subjectCodePreview } from "./subject-code";
import type { ScheduleSubject } from "../page";
export type SubjectRow = {
  name: string;
};
function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
export type SubjectCreateProgress = {
  count: number;
  gradeLabel: string;
  categoryLabel: string;
};
type CreateVars = {
  items: SubjectRow[];
  gradeLevel: string;
  category: string;
  /** Rows painted into the catalog immediately, before the POSTs land. */
  optimistic: ScheduleSubject[];
};

/**
 * Apply a patch to every cached subject catalog. The board reads
 * `["admin-schedule-subjects", …]`, one cache per term scope, so all of
 * them are kept in sync — no waiting for a refetch.
 */
function patchSubjectLists(
  qc: QueryClient,
  patch: (list: ScheduleSubject[]) => ScheduleSubject[],
) {
  for (const entry of qc.getQueryCache().findAll({ queryKey: ["admin-schedule-subjects"] })) {
    qc.setQueryData(entry.queryKey, (prev: unknown) => {
      if (
        prev &&
        typeof prev === "object" &&
        Array.isArray((prev as { subjects?: unknown }).subjects)
      ) {
        return {
          ...(prev as Record<string, unknown>),
          subjects: patch((prev as { subjects: ScheduleSubject[] }).subjects ?? []),
        };
      }
      if (Array.isArray(prev)) return patch(prev as ScheduleSubject[]);
      return prev;
    });
  }
}

/**
 * Add-subject flow. The operator only types names: the code is minted by the
 * system from the name + grade, so the board is filled in with names and codes
 * before the first request leaves.
 */
export function useAddSubjects(onClose: () => void, onProgress?: (p: SubjectCreateProgress | null) => void) {
  const qc = useQueryClient();
  const invalidateSchedule = useAdminScheduleInvalidate();
  const [rows, setRows] = useState<SubjectRow[]>([{ name: "" }]);
  const [gradeLevel, setGradeLevel] = useState("G7");
  const [category, setCategory] = useState("CORE");
  const [formError, setFormError] = useState<string | null>(null);
  const patchRow = (i: number, patch: Partial<SubjectRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.name.trim() !== "");
  const duplicateName = (() => {
    const seen = new Set<string>();
    for (const row of filled) {
      const key = row.name.trim().toLowerCase();
      if (seen.has(key)) return row.name.trim();
      seen.add(key);
    }
    return null;
  })();
  const createMany = useMutation({
    mutationFn: async (vars: CreateVars) => {
      const results = await Promise.allSettled(
        vars.items.map((it) =>
          apiClient.post("/api/admin/schedule/subjects", {
            name: it.name.trim(),
            gradeLevel: vars.gradeLevel,
            category: vars.category,
          }),
        ),
      );
      return { items: vars.items, results, optimistic: vars.optimistic };
    },
    onSuccess: ({ items, results, optimistic }) => {
      const okIndexes = new Set(
        results.map((r, i) => (r.status === "fulfilled" ? i : -1)).filter((i) => i >= 0),
      );
      const failed = items.filter((_, i) => !okIndexes.has(i));
      // Swap the placeholder rows for the server rows in one cache write so the
      // list never flashes back to stale data. A placeholder the user deleted
      // while the POST was in flight is dropped and its new server row is
      // removed again (compensating DELETE) — it must not come back.
      const created: ScheduleSubject[] = [];
      results.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const row = r.value?.data as ScheduleSubject | undefined;
        if (!row?.id) return;
        if (optimistic[i] && consumeOptimisticCancelled(optimistic[i].id)) {
          void apiClient
            .delete(`/api/admin/schedule/subjects/${row.id}`)
            .catch(() => undefined);
          return;
        }
        created.push(row);
      });
      const optimisticIds = new Set(optimistic.map((s) => s.id));
      patchSubjectLists(qc, (list) => {
        const base = list.filter((s) => !optimisticIds.has(s.id));
        const known = new Set(base.map((s) => s.id));
        return [...base, ...created.filter((s) => s.id && !known.has(s.id))];
      });
      if (okIndexes.size > 0) {
        invalidateSchedule();
        toast.success({
          title: `${okIndexes.size} subject${okIndexes.size === 1 ? "" : "s"} created`,
          description: "Usable in the timetable immediately.",
        });
      }
      if (failed.length > 0) {
        const details = results
          .map((r, i) =>
            r.status === "rejected"
              ? `${items[i].name.trim() || `row ${i + 1}`}: ${getErrorMessage(r.reason, "failed")}`
              : null,
          )
          .filter(Boolean)
          .join("; ");
        setRows(failed.map((r) => ({ ...r })));
        setFormError(`${failed.length} failed: ${details}`);
        toast.error({ title: "Some subjects were not created", description: details });
      } else {
        onClose();
      }
    },
    onError: (_err, vars) => {
      // Mutation-level failure (no per-row results): drop the placeholders.
      const optimisticIds = new Set(vars.optimistic.map((s) => s.id));
      patchSubjectLists(qc, (list) => list.filter((s) => !optimisticIds.has(s.id)));
    },
    onSettled: () => {
      onProgress?.(null);
    },
  });
  const handleCreate = useCallback(() => {
    if (duplicateName) {
      setFormError(`"${duplicateName}" appears twice — each subject name must be different.`);
      return;
    }
    if (filled.length === 0) {
      setFormError("Add at least one subject.");
      return;
    }
    setFormError(null);
    onProgress?.({
      count: filled.length,
      gradeLabel: `Grade ${gradeLevel.replace("G", "")}`,
      categoryLabel: category === "ELECTIVE" ? "Elective" : "Core",
    });
    // Optimistic catalog write + instant dismiss: the new rows are already in
    // the board (and animate in) before the requests are sent.
    const stamp = Date.now();
    const optimistic: ScheduleSubject[] = filled.map((r, i) => ({
      id: `optimistic-${stamp}-${i}`,
      name: r.name.trim(),
      code: subjectCodePreview(r.name, gradeLevel),
      gradeLevel,
      category,
    }));
    patchSubjectLists(qc, (list) => [...list, ...optimistic]);
    onClose();
    createMany.mutate({ items: filled, gradeLevel, category, optimistic });
  }, [category, createMany, duplicateName, filled, gradeLevel, onClose, onProgress, qc]);
  return {
    rows,
    setRows,
    patchRow,
    filled,
    gradeLevel,
    setGradeLevel,
    category,
    setCategory,
    formError,
    createMany,
    handleCreate,
  };
}
