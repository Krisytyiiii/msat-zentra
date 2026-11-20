"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, useLiveQuery } from "@/lib/api/live";

import { KeyRound, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTerm } from "@/lib/term/TermContext";
import emptyStyles from "@/components/schedule/schedule-empty.module.css";
import { UnlinkCodeDialog } from "./UnlinkCodeDialog";
import { Pill } from "@/components/ui/pill";
import { useDock } from "@/components/dock/dock-store";
import { getErrorMessage } from "./get-error-message";
import kanbanStyles from "@/components/schedule/subject-kanban.module.css";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { TimetableSidebar, type LinkedName } from "./timetable-sidebar";
import { TeacherCodeClaim } from "@/components/schedule/TeacherCodeClaim";
import { Skeleton } from "@/components/ui/skeleton";

interface TermGrant {
  via: string;
  attendanceVerified: boolean;
}

interface MyClass {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  sectionId: string;
  sectionName: string;
  gradeLevel: string;
}

interface MyLoad {
  classes: MyClass[];
}

/**
 * My Classes: the published teaching load as a plain list — the timetable
 * itself (grid, day/period cells) lives on the administrator desk only. The
 * code-link card in the rail still lets a teacher attach their login to the
 * published teacher-name row.
 */
export function MyClasses() {
  const queryClient = useQueryClient();
  const dock = useDock();
  const dockRef = useRef(dock);
  useEffect(() => {
    dockRef.current = dock;
  }, [dock]);
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);
  // Unlink progress now lives in the single shared Dock.
  const unlinkTaskRef = useRef<string | null>(null);
  // Term-entry verification also reports into the shared Dock.
  const verifyTaskRef = useRef<string | null>(null);
  const { activeTerm } = useTerm();
  const termLabel = activeTerm
    ? `${activeTerm.schoolYearName} · Term ${activeTerm.termNumber}`
    : "this term";
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  const [attCode, setAttCode] = useState("");
  const [attCodeError, setAttCodeError] = useState<string | null>(null);

  const meQuery = useLiveQuery<{ teacherName: LinkedName | null; termGrant: TermGrant | null }>({
    queryKey: ["teacher-schedule-me", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        teacherName: LinkedName | null;
        termGrant: TermGrant | null;
      }>("/api/teacher/schedule/teachers/me");
      return data;
    },
    ...liveQueryOptions,
  });

  const linked = meQuery.data?.teacherName ?? null;
  const termGrant = meQuery.data?.termGrant ?? null;

  const loadQuery = useLiveQuery<MyLoad>({
    queryKey: ["teacher-my-load", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<MyLoad>("/api/teacher/my-load");
      return data;
    },
    enabled: linked !== null,
    ...liveQueryOptions,
  });
  const classes = loadQuery.data?.classes ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["teacher-schedule-me"] });
    void queryClient.invalidateQueries({ queryKey: ["teacher-my-load"] });
    // Unlinking clears classes + grading + attendance together.
    void queryClient.invalidateQueries({ queryKey: ["teacher-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["teacher-overview-gradebook"] });
    void queryClient.invalidateQueries({ queryKey: ["teacher-overview-secondary"] });
    void queryClient.invalidateQueries({ queryKey: ["offered-subjects"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-sheet-marks"] });
    void queryClient.invalidateQueries({ queryKey: ["attendance-section-roster"] });
    void queryClient.invalidateQueries({ queryKey: ["teacher-grading-class"] });
  };

  const release = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete("/api/teacher/schedule/teachers/me");
      return data;
    },
    onSuccess: () => {
      const id = unlinkTaskRef.current;
      unlinkTaskRef.current = null;
      try {
        if (id)
          dockRef.current.completeTask(
            id,
            "Code unlinked · classes, grading, attendance cleared",
          );
      } catch {
        /* ignore */
      }
      refresh();
      toast.success({
        title: "Code unlinked",
        description:
          "Your link code was removed — classes, grading, and attendance are now cleared.",
      });
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, "Failed to unlink code.");
      const id = unlinkTaskRef.current;
      unlinkTaskRef.current = null;
      try {
        if (id) dockRef.current.failTask(id, message);
      } catch {
        /* ignore */
      }
      toast.error({ title: "Could not unlink code", description: message });
    },
  });

  const handleUnlinkConfirm = () => {
    if (!linked || release.isPending) return;
    try {
      unlinkTaskRef.current = dockRef.current.startTask({
        kind: "unlink-code",
        title: "Unlinking code",
        description: linked.code ? `Unlinking ${linked.code}…` : "Unlinking code…",
      });
    } catch {
      unlinkTaskRef.current = null;
    }
    setConfirmReleaseOpen(false);
    release.mutate();
  };

  const verify = useMutation({
    mutationFn: async (teacherCode: string) => {
      const { data } = await apiClient.post(
        "/api/teacher/schedule/teachers/verify-attendance",
        { code: teacherCode },
      );
      return data;
    },
    onSuccess: () => {
      setAttCodeError(null);
      const id = verifyTaskRef.current;
      verifyTaskRef.current = null;
      try {
        if (id) dockRef.current.completeTask(id, "Term entered · classes are open");
      } catch {
        /* ignore */
      }
      void queryClient.invalidateQueries({ queryKey: ["teacher-schedule-me"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher-notifications"] });
      toast.success({
        title: "Term entered",
        description: `Your code matches — classes are now open for ${termLabel}.`,
      });
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, "Could not verify teacher code.");
      setAttCodeError(message);
      const id = verifyTaskRef.current;
      verifyTaskRef.current = null;
      try {
        if (id) dockRef.current.failTask(id, message);
      } catch {
        /* ignore */
      }
      toast.error({ title: "Could not verify code", description: message });
    },
  });

  const handleVerify = () => {
    if (verify.isPending) return;
    if (!attCode.trim()) {
      setAttCodeError("Enter your teacher code to open this term.");
      return;
    }
    setAttCodeError(null);
    try {
      verifyTaskRef.current = dockRef.current.startTask({
        kind: "link-code",
        title: "Entering term",
        description: `Verifying ${attCode.trim().toUpperCase()} for ${termLabel}`,
      });
    } catch {
      verifyTaskRef.current = null;
    }
    verify.mutate(attCode.trim());
  };

  if (meQuery.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading classes">
        <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="min-w-0">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="mt-1 h-5 w-64" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-xl border border-border p-4"
                >
                  <Skeleton className="h-5 w-32 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load your classes.
      </p>
    );
  }

  if (!linked) {
    return (
      <div aria-label="Link teacher code">
        <TeacherCodeClaim
          title="Link your teacher code"
          description="Enter the code next to your name in the administrator's teacher list (e.g. MS-101). Your assigned subjects and sections will attach to this login."
        />
      </div>
    );
  }

  if (!termGrant) {
    return (
      <div className={emptyStyles.emptyWrap}>
        <div className={`${kanbanStyles.column} mx-auto w-full max-w-md`}>
          <KanbanBoard
            title="Enter"
            icon={
              <span className="text-amber-500" aria-hidden>
                <KeyRound size={14} />
              </span>
            }
            actions={
              <span className="flex items-center gap-1.5">
                {termLabel
                  .split("·")
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .map((part) => (
                    <Pill key={part} tone="amber" label="Term">
                      {part}
                    </Pill>
                  ))}
              </span>
            }
            description="Enter your teacher code once to open your classes — it stays valid for every term of this school year."
          >
            <div className="flex flex-col px-1 py-1">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Input
                  placeholder="TEACHER CODE (E.G. MS-101)..."
                  value={attCode}
                  onChange={(e) => {
                    setAttCode(e.target.value);
                    setAttCodeError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleVerify();
                  }}
                  aria-label="Teacher code"
                  className="h-6 min-w-0 flex-1 rounded-lg text-center text-xs uppercase placeholder:text-[12px]"
                />
                <Button
                  onClick={handleVerify}
                  disabled={verify.isPending}
                  className="h-6 shrink-0 rounded-lg bg-black px-3 text-xs text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                >
                  {verify.isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      <span aria-live="polite">Verifying…</span>
                    </>
                  ) : (
                    "Verify code"
                  )}
                </Button>
              </div>
              {attCodeError ? (
                <p role="alert" className="text-center text-sm text-destructive">
                  {attCodeError}
                </p>
              ) : null}
            </div>
          </KanbanBoard>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">My Classes</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The subject sections assigned to you this term.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              {termLabel
                .split("·")
                .map((part) => part.trim())
                .filter(Boolean)
                .map((part, index) => (
                  <Pill
                    key={part}
                    tone="amber"
                    label={index === 0 ? "School year" : "Active term"}
                  >
                    {part}
                  </Pill>
                ))}
            </span>
          </div>

          {loadQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load your classes.
            </p>
          ) : loadQuery.isPending ? (
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              aria-busy="true"
              aria-label="Loading classes"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-xl border border-border p-4"
                >
                  <Skeleton className="h-5 w-32 rounded-md" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
              ))}
            </div>
          ) : classes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
              <p className="text-sm font-medium">No classes published yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your timetable hasn&rsquo;t been published yet — the administrator
                publishes section schedules.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((c) => (
                <li
                  key={`${c.subjectId}|${c.sectionId}`}
                  className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {c.subjectName}
                    </span>
                    <Pill tone="amber" label="Subject code">
                      {c.subjectCode}
                    </Pill>
                  </div>
                  <span className="truncate text-sm text-muted-foreground">
                    {c.gradeLevel} · {c.sectionName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <TimetableSidebar
          linked={linked}
          onReleaseRequest={() => setConfirmReleaseOpen(true)}
        />
      </div>

      {confirmReleaseOpen && linked ? (
        <UnlinkCodeDialog
          linked={linked}
          pending={release.isPending}
          onClose={() => {
            if (!release.isPending) setConfirmReleaseOpen(false);
          }}
          onConfirm={handleUnlinkConfirm}
        />
      ) : null}
    </div>
  );
}
