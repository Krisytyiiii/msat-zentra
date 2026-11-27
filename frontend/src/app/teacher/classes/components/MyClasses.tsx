"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, useLiveQuery } from "@/lib/api/live";

import { BookOpen } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { useTerm } from "@/lib/term/TermContext";
import { useDock } from "@/components/dock/dock-store";
import { getErrorMessage } from "./get-error-message";
import type { LinkedName } from "./timetable-sidebar";
import { ClassesTimetableSkeleton } from "./ClassesTimetableSkeleton";
import {
  buildTimetable,
  DEFAULT_DAY_CONFIG,
  type DayConfig,
} from "@/components/schedule/schedule-time";
import { ClassTimetable } from "./ClassTimetable";
import { TeacherCodeCard, TeacherCodeDrawer } from "./TeacherCodeCard";
import type { MyClass, MySlot } from "./class-types";
import cardStyles from "@/app/principal/academics/assign/components/sections-kanban.module.css";
import scheduleCardStyles from "@/app/admin/academics/schedule/components/schedule-overview-board.module.css";

interface TermGrant {
  via: string;
  attendanceVerified: boolean;
}

interface MyLoad {
  classes: MyClass[];
  slots?: MySlot[];
  config?: DayConfig;
}

/**
 * My Classes: the published teaching load as a read-only week grid — the same
 * day × period timetable the administrator's section workspace renders. The
 * code-link card still lets a teacher attach their login to the published
 * teacher-name row; the grid itself is owned by the administrator desk.
 */
export function MyClasses() {
  const queryClient = useQueryClient();
  const dock = useDock();
  const dockRef = useRef(dock);
  useEffect(() => {
    dockRef.current = dock;
  }, [dock]);
  // Term-entry verification also reports into the shared Dock.
  const verifyTaskRef = useRef<string | null>(null);
  const claimTaskRef = useRef<string | null>(null);
  const { activeTerm } = useTerm();
  const termLabel = activeTerm
    ? `${activeTerm.schoolYearName} · Term ${activeTerm.termNumber}`
    : "this term";
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;

  const [attCode, setAttCode] = useState("");
  const [attCodeError, setAttCodeError] = useState<string | null>(null);
  const [codeDrawerOpen, setCodeDrawerOpen] = useState(false);

  // Deep link from the grading / lock-grades / attendance gate cards: their
  // "Link now" sends the teacher here with ?link=1 so the code drawer slides in
  // on arrival. The param is then cleared so a reload does not reopen it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("link") !== "1") return;
    params.delete("link");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
    // Hand the intent over after mount instead of setting state in the effect
    // body (the react-compiler gate rejects a synchronous setState here).
    queueMicrotask(() => setCodeDrawerOpen(true));
  }, []);

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
      // The selected term is the source of truth: a class that only exists in
      // another term's grid must not show up here (or be gradeable from it).
      const { data } = await apiClient.get<MyLoad>("/api/teacher/my-load?strict=1");
      return data;
    },
    enabled: linked !== null,
    ...liveQueryOptions,
  });
  const classes = useMemo(() => loadQuery.data?.classes ?? [], [loadQuery.data]);

  // School-day shape: one row per period, plus the lunch/recess bands.
  const rows = useMemo(
    () => buildTimetable(loadQuery.data?.config ?? DEFAULT_DAY_CONFIG),
    [loadQuery.data?.config],
  );

  // "Today" is client-only — the server render has no clock.
  const [todayDow, setTodayDow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      setTodayDow(new Date().getDay());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const slots = useMemo(() => loadQuery.data?.slots ?? [], [loadQuery.data]);

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

  // Link-mode submit: same dock/toast flow as the shared TeacherCodeClaim card,
  // now driven from the card's drawer.
  const claim = useMutation({
    mutationFn: async (teacherCode: string) => {
      const { data } = await apiClient.post<{ teacherName: LinkedName }>(
        "/api/teacher/schedule/teachers/claim",
        { code: teacherCode },
      );
      return data;
    },
    onSuccess: (data) => {
      setAttCode("");
      setAttCodeError(null);
      setCodeDrawerOpen(false);
      const id = claimTaskRef.current;
      claimTaskRef.current = null;
      try {
        if (id) dockRef.current.completeTask(id, `Linked to ${data.teacherName.name}`);
      } catch {
        /* dock is best-effort */
      }
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["teacher-notifications"] });
      toast.success({
        title: "Teacher code linked",
        description: `Your classes now follow ${data.teacherName.name}'s scheduled subjects and timeslots.`,
      });
    },
    onError: (err: unknown) => {
      const message = getErrorMessage(err, "Failed to link teacher code.");
      setAttCodeError(message);
      const id = claimTaskRef.current;
      claimTaskRef.current = null;
      try {
        if (id) dockRef.current.failTask(id, message);
      } catch {
        /* dock is best-effort */
      }
      toast.error({ title: "Could not link code", description: message });
    },
  });

  const handleLink = () => {
    if (claim.isPending) return;
    if (!attCode.trim()) {
      setAttCodeError("Enter the code from your teacher list entry (e.g. MS-101).");
      return;
    }
    setAttCodeError(null);
    try {
      claimTaskRef.current = dockRef.current.startTask({
        kind: "link-code",
        title: "Linking teacher code",
        description: `Matching ${attCode.trim().toUpperCase()} to your teacher list entry`,
      });
    } catch {
      claimTaskRef.current = null;
    }
    claim.mutate(attCode.trim());
  };

  const handleCodeChange = (value: string) => {
    setAttCode(value);
    setAttCodeError(null);
  };

  if (meQuery.isPending) {
    return <ClassesTimetableSkeleton />;
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
      <div
        className="flex flex-1 items-center justify-center"
        aria-label="Link teacher code"
      >
        <div className="w-full max-w-md">
          <TeacherCodeCard
            mode="link"
            termLabel={termLabel}
            onOpen={() => setCodeDrawerOpen(true)}
          />
        </div>
        <TeacherCodeDrawer
          open={codeDrawerOpen}
          mode="link"
          termLabel={termLabel}
          code={attCode}
          error={attCodeError}
          pending={claim.isPending}
          onCodeChange={handleCodeChange}
          onSubmit={handleLink}
          onClose={() => setCodeDrawerOpen(false)}
        />
      </div>
    );
  }

  if (!termGrant) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        aria-label="Enter this term"
      >
        <div className="w-full max-w-md">
          <TeacherCodeCard
            mode="term"
            termLabel={termLabel}
            linkedName={linked.name}
            linkedCode={linked.code}
            onOpen={() => setCodeDrawerOpen(true)}
          />
        </div>
        <TeacherCodeDrawer
          open={codeDrawerOpen}
          mode="term"
          termLabel={termLabel}
          linkedName={linked.name}
          code={attCode}
          error={attCodeError}
          pending={verify.isPending}
          onCodeChange={handleCodeChange}
          onSubmit={handleVerify}
          onClose={() => setCodeDrawerOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {loadQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load your classes.
        </p>
      ) : loadQuery.isPending ? (
        <ClassesTimetableSkeleton />
      ) : (
        <>
          {classes.length === 0 ? (
            <div className="flex justify-center py-6">
              <div className="w-full max-w-md">
                <article className={scheduleCardStyles.card} aria-label="No classes published yet">
                  <header className={cardStyles.cardHead}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <BookOpen size={16} aria-hidden />
                    </span>
                    <div className={cardStyles.cardId}>
                      <span className={cardStyles.sectionName}>No classes published yet</span>
                      <span className={cardStyles.teacher}>Waiting for the administrator</span>
                    </div>
                  </header>
                  <p className={scheduleCardStyles.progressLine}>
                    Your section schedules have not been published for this term yet.
                    Classes appear here once the administrator releases the grid.
                  </p>
                </article>
              </div>
            </div>
          ) : (
            <section className="flex min-w-0 flex-col gap-3.5" aria-label="Weekly timetable">
              <ClassTimetable rows={rows} slots={slots} todayDow={todayDow} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
