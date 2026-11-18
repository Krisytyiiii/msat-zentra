"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Check, Clock, Inbox, Pencil, Undo2 } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { useDock } from "@/components/dock/dock-store";
import {
  buildTimetable,
  type DayConfig,
} from "@/app/teacher/schedule/components/schedule-time";
import { findSectionByRef } from "../../components/section-path";
interface SubmissionEntry {
  day: number;
  period: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED";
  subject: { id: string; name: string; code: string };
  teacherName: { id: string; name: string } | null;
  submittedAt: string | null;
  submitter: { fullName: string } | null;
  reviewNote?: string | null;
}
interface Submission {
  id: string;
  name: string;
  gradeLevel: string;
  adviser: { fullName: string } | null;
  timetableEntries: SubmissionEntry[];
}
function getErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; message?: unknown } } })?.response?.data;
  const message = data?.error?.message ?? data?.message;
  if (typeof message === "string" && message) return message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
export function usePrincipalScheduleSection(sectionRef: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dock = useDock();
  const dockIdRef = useRef<string | null>(null);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const sectionsQuery = useQuery<{ sections: Submission[] }, unknown, Submission | null>({
    queryKey: ["principal-schedule-sections"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ sections: Submission[] }>(
        "/api/academics/schedule/sections",
      );
      return data;
    },
    select: (d) => findSectionByRef(d.sections, sectionRef),
    staleTime: 30_000,
  });
  const configQuery = useQuery<{ config: DayConfig }>({
    queryKey: ["principal-schedule-config"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ config: DayConfig }>("/api/teacher/schedule/config");
      return data;
    },
  });
  const submission = sectionsQuery.data ?? null;
  const review = useMutation({
    mutationFn: async (vars: { decision: "approve" | "reject"; note?: string }) => {
      if (!submission) throw new Error("Section is not loaded yet.");
      const { data } = await apiClient.post("/api/academics/schedule/review", {
        sectionId: submission.id,
        decision: vars.decision,
        note: vars.note,
      });
      return data as { approved?: number; rejected?: number };
    },
    onSuccess: (data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["principal-schedule-sections"] });
      const name = submission?.name ?? "Section";
      setPendingAction(null);
      if (dockIdRef.current) {
        dock.completeTask(
          dockIdRef.current,
          vars.decision === "approve" ? `${name} approved` : `${name} sent back`,
        );
        dockIdRef.current = null;
      }
      // Close the overlay before navigating so it never flashes on the list.
      setReviewOpen(false);
      if (vars.decision === "approve") {
        toast.success({
          title: "Schedule approved",
          description: `${data.approved ?? 0} slots for ${name} are now official.`,
        });
      } else {
        toast.success({
          title: "Sent back for revision",
          description: `${name} returned to draft with your note.`,
        });
      }
      router.push("/principal/academics/schedule");
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, "Failed to record decision.");
      setPendingAction(null);
      setFormError(message);
      if (dockIdRef.current) {
        dock.failTask(dockIdRef.current, message);
        dockIdRef.current = null;
      }
      toast.error({ title: "Could not record decision", description: message });
    },
  });
  const config = configQuery.data?.config ?? null;
  const rows = config ? buildTimetable(config) : [];
  const entryByKey = new Map(
    (submission?.timetableEntries ?? []).map((e) => [`${e.day}:${e.period}`, e]),
  );
  const entries = submission?.timetableEntries ?? [];
  const submittedCount = entries.filter((e) => e.status === "SUBMITTED").length;
  const counts = {
    total: entries.length,
    submitted: submittedCount,
    approved: entries.filter((e) => e.status === "APPROVED").length,
    draft: entries.filter((e) => e.status === "DRAFT").length,
  };
  // Every cell the master teacher could still fill: 5 weekdays × the number of
  // period rows in the day config (break rows are not slots).
  const capacity =
    rows.filter((row) => row.kind === "period").length * 5;
  const emptyCount = Math.max(0, capacity - counts.total);
  // A draft slot carrying a review note is a timetable this desk sent back, so
  // the summary says so instead of the generic "draft".
  const returnedNote =
    entries.find((e) => e.status === "DRAFT" && e.reviewNote?.trim())?.reviewNote?.trim() ?? null;
  const handleReview = (decision: "approve" | "reject") => {
    if (!submission || review.isPending) return;
    if (decision === "reject" && !note.trim()) {
      setFormError("A revision note is required to send a schedule back.");
      return;
    }
    setFormError(null);
    setPendingAction(decision);
    dockIdRef.current = dock.startTask({
      kind: "generic",
      title: decision === "approve" ? "Approving schedule" : "Sending schedule back",
      description: `${submission?.name ?? "Section"} · Grade ${(submission?.gradeLevel ?? "G-").replace("G", "")}`,
    });
    // Close the overlay right away — the shared dock tracks the request and
    // the list refresh happens once the decision settles.
    setReviewOpen(false);
    review.mutate({ decision, note: note.trim() || undefined });
  };
  const rejecting = review.isPending && pendingAction === "reject";
  const approving = review.isPending && pendingAction === "approve";
  const statusVariant =
    submittedCount > 0
      ? "blue"
      : returnedNote
        ? "amber"
        : counts.total === 0
          ? "gray"
          : counts.approved === counts.total
            ? "green"
            : "red";
  const statusMeta = {
    blue: {
      title: "Submitted",
      message: `${submittedCount} slot${submittedCount === 1 ? "" : "s"} awaiting your review.`,
      from: "#3b82f6",
      to: "#2563d1",
      chip: "bg-blue-500/15",
      icon: "text-blue-500",
      Icon: Clock,
    },
    green: {
      title: "Approved",
      message: "Official schedule.",
      from: "#22c55e",
      to: "#16a34a",
      chip: "bg-green-500/15",
      icon: "text-green-500",
      Icon: Check,
    },
    red: {
      title: "Draft",
      message: "Not yet submitted for review.",
      from: "#ef4444",
      to: "#dc2626",
      chip: "bg-red-500/15",
      icon: "text-red-500",
      Icon: Pencil,
    },
    amber: {
      title: "Returned",
      message: "Sent back to the master teacher with your note.",
      from: "#f59e0b",
      to: "#d97706",
      chip: "bg-amber-500/15",
      icon: "text-amber-500",
      Icon: Undo2,
    },
    gray: {
      title: "Empty",
      message: "No timetable yet.",
      from: "#9ca3af",
      to: "#6b7280",
      chip: "bg-gray-500/15",
      icon: "text-gray-500",
      Icon: Inbox,
    },
  }[statusVariant];
  return {
    sectionsQuery,
    configQuery,
    submission,
    config,
    rows,
    entryByKey,
    submittedCount,
    counts,
    capacity,
    emptyCount,
    returnedNote,
    review,
    note,
    setNote,
    formError,
    setFormError,
    reviewOpen,
    setReviewOpen,
    pendingAction,
    handleReview,
    rejecting,
    approving,
    statusVariant,
    statusMeta,
  };
}
export type { Submission, SubmissionEntry };
export type SlotFilter = "all" | "submitted" | "approved" | "draft";
