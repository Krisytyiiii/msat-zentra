"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, useLiveQuery } from "@/lib/api/live";

import {
  BookOpen,
  GraduationCap,
  Layers,
  NotebookPen,
  UserRound,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatDeck } from "@/components/ui/stat-deck";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { useTerm } from "@/lib/term/TermContext";
import { UnlinkCodeDialog } from "./UnlinkCodeDialog";
import { Pill } from "@/components/ui/pill";
import { useDock } from "@/components/dock/dock-store";
import { getErrorMessage } from "./get-error-message";
import type { LinkedName } from "./timetable-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildTimetable,
  DEFAULT_DAY_CONFIG,
  type DayConfig,
} from "@/components/schedule/schedule-time";
import { ClassCardGrid } from "./ClassCardGrid";
import { ClassDetailDrawer } from "./ClassDetailDrawer";
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
  const [grade, setGrade] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  const gradeLevels = useMemo(
    () =>
      Array.from(new Set(classes.map((c) => c.gradeLevel))).sort(
        (a, b) => (Number(a.replace("G", "")) || 0) - (Number(b.replace("G", "")) || 0),
      ),
    [classes],
  );
  const sectionCount = useMemo(() => new Set(classes.map((c) => c.sectionId)).size, [classes]);

  // School-day shape: one row per period, plus the lunch/recess bands.
  const rows = useMemo(
    () => buildTimetable(loadQuery.data?.config ?? DEFAULT_DAY_CONFIG),
    [loadQuery.data?.config],
  );

  // Period → clock range, from the school-day shape the API sends with the load.
  const periodTimes = useMemo(() => {
    const map = new Map<number, { startMin: number; endMin: number }>();
    for (const row of rows) {
      if (row.kind === "period") map.set(row.periodIndex, { startMin: row.startMin, endMin: row.endMin });
    }
    return map;
  }, [rows]);

  // "Today" + the live period are client-only — the server render has no clock.
  const [todayDow, setTodayDow] = useState<number | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTodayDow(now.getDay());
      setNowMin(now.getHours() * 60 + now.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const slots = useMemo(() => loadQuery.data?.slots ?? [], [loadQuery.data]);
  const [selectedClass, setSelectedClass] = useState<MyClass | null>(null);

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

  const needle = query.trim().toLowerCase();
  const hasVisibleClass = classes.some((cls) => {
    if (grade != null && cls.gradeLevel !== grade) return false;
    if (!needle) return true;
    return (
      cls.subjectName.toLowerCase().includes(needle) ||
      cls.subjectCode.toLowerCase().includes(needle) ||
      cls.sectionName.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="flex flex-col gap-5">
      {loadQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load your classes.
        </p>
      ) : loadQuery.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading classes">
          <div className="rounded-xl border border-border bg-card p-3.5">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-20 rounded-md" />
                  <Skeleton className="h-7 w-12 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
              >
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-36 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-5 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* The shared stat deck: load figures + the linked teacher code. */}
          <StatDeck
            title="My classes"
            icon={NotebookPen}
            ariaLabel="Teaching load at a glance"
            headerExtra={
              <span className="flex flex-wrap items-center gap-1.5">
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
            }
            items={[
              {
                key: "classes",
                icon: NotebookPen,
                label: "Subject assignments",
                unit: classes.length === 1 ? "class" : "classes",
                value: classes.length,
                hint: "Subject × section load",
              },
              {
                key: "sections",
                icon: Layers,
                label: "Sections",
                unit: sectionCount === 1 ? "section" : "sections",
                value: sectionCount,
                hint: "Distinct sections you handle",
              },
              {
                key: "grades",
                icon: GraduationCap,
                label: "Grade levels",
                unit: "",
                value: gradeLevels.length,
                hint: gradeLevels.join(", ") || "No grade levels",
              },
              {
                key: "linked",
                icon: UserRound,
                label: "Teacher code",
                unit: "",
                value: linked.code ?? "—",
                hint: `${linked.name} · tap to unlink`,
                onClick: () => setConfirmReleaseOpen(true),
                indicator: "none",
                ariaLabel: `Linked teacher ${linked.name} — unlink code`,
              },
            ]}
          />

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
            <section className="flex min-w-0 flex-col gap-3.5" aria-label="My classes">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <FilterTabs
                  label="Filter by grade level"
                  options={[
                    { value: "all", label: "All grades" },
                    ...gradeLevels.map((g) => ({
                      value: g,
                      label: `Grade ${g.replace("G", "")}`,
                    })),
                  ]}
                  value={grade ?? "all"}
                  onChange={(next) => setGrade(next === "all" ? null : next)}
                />
                <TeacherSearchField
                  className="w-64 max-w-full"
                  placeholder="Find a subject, code, or section…"
                  value={query}
                  onChange={setQuery}
                  aria-label="Find a class"
                />
              </div>

              {hasVisibleClass ? (
                <ClassCardGrid
                  classes={classes}
                  slots={slots}
                  periodTimes={periodTimes}
                  todayDow={todayDow}
                  nowMin={nowMin}
                  grade={grade}
                  query={query}
                  onOpen={setSelectedClass}
                />
              ) : (
                <p className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-[12px] text-muted-foreground">
                  {searchEmptyMessage(query, "classes", "Try another grade or search term.")}
                </p>
              )}
            </section>
          )}
        </>
      )}

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

      <ClassDetailDrawer
        selectedClass={selectedClass}
        slots={slots}
        periodTimes={periodTimes}
        todayDow={todayDow}
        nowMin={nowMin}
        onClose={() => setSelectedClass(null)}
      />
    </div>
  );
}
