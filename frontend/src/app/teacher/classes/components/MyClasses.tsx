"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, useLiveQuery } from "@/lib/api/live";

import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Clock,
  Coffee,
  GraduationCap,
  KeyRound,
  Layers,
  Loader2,
  MapPin,
  NotebookPen,
  UserRound,
  Utensils,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatDeck } from "@/components/ui/stat-deck";
import { TeacherSearchField, searchEmptyMessage } from "@/app/teacher/components/TeacherSearchField";
import { cn } from "@/lib/utils";
import { KanbanOverlay } from "@/components/ui/kanban-overlay";
import { useTerm } from "@/lib/term/TermContext";
import emptyStyles from "@/components/schedule/schedule-empty.module.css";
import { UnlinkCodeDialog } from "./UnlinkCodeDialog";
import { Pill } from "@/components/ui/pill";
import { useDock } from "@/components/dock/dock-store";
import { getErrorMessage } from "./get-error-message";
import kanbanStyles from "@/components/schedule/subject-kanban.module.css";
import { KanbanBoard } from "@/components/ui/kanban-board";
import type { LinkedName } from "./timetable-sidebar";
import { TeacherCodeClaim } from "@/components/schedule/TeacherCodeClaim";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildTimetable,
  DEFAULT_DAY_CONFIG,
  formatClock,
  formatRange,
  type DayConfig,
} from "@/components/schedule/schedule-time";
import { WEEK_LABELS_SHORT } from "@/services/teacher/schedule";

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

interface MySlot {
  day: number;
  period: number;
  status: string;
  subject: { id: string; name: string; code: string };
  section: { id: string; name: string; gradeLevel: string };
}

interface MyLoad {
  classes: MyClass[];
  slots?: MySlot[];
  config?: DayConfig;
}

/** Monday–Friday, the only days a section grid can hold. */
const DAYS = [1, 2, 3, 4, 5] as const;

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
  const needle = query.trim().toLowerCase();

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
  const slotsByCell = useMemo(() => {
    const map = new Map<string, MySlot[]>();
    for (const slot of slots) {
      const key = `${slot.day}:${slot.period}`;
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return map;
  }, [slots]);
  const placedPairs = useMemo(
    () => new Set(slots.map((slot) => `${slot.subject.id}|${slot.section.id}`)),
    [slots],
  );
  const unplacedClasses = useMemo(
    () => classes.filter((c) => !placedPairs.has(`${c.subjectId}|${c.sectionId}`)),
    [classes, placedPairs],
  );
  const filtersActive = grade != null || needle.length > 0;
  const slotMatches = (slot: MySlot) => {
    if (grade != null && slot.section.gradeLevel !== grade) return false;
    if (!needle) return true;
    return (
      slot.subject.name.toLowerCase().includes(needle) ||
      slot.subject.code.toLowerCase().includes(needle) ||
      slot.section.name.toLowerCase().includes(needle)
    );
  };
  const matchingSlotCount = slots.filter(slotMatches).length;
  const todayCount = todayDow == null ? 0 : slots.filter((s) => s.day === todayDow).length;

  const [selectedClass, setSelectedClass] = useState<MyClass | null>(null);
  const openSlot = (slot: MySlot) => {
    const pair = `${slot.subject.id}|${slot.section.id}`;
    setSelectedClass(
      classes.find((c) => `${c.subjectId}|${c.sectionId}` === pair) ?? {
        subjectId: slot.subject.id,
        subjectName: slot.subject.name,
        subjectCode: slot.subject.code,
        sectionId: slot.section.id,
        sectionName: slot.section.name,
        gradeLevel: slot.section.gradeLevel,
      },
    );
  };
  const selectedSlots = useMemo(() => {
    if (!selectedClass) return [];
    return slots
      .filter(
        (slot) =>
          slot.subject.id === selectedClass.subjectId &&
          slot.section.id === selectedClass.sectionId,
      )
      .sort((a, b) => a.day - b.day || a.period - b.period);
  }, [selectedClass, slots]);
  const selectedMinutes = selectedSlots.reduce((sum, slot) => {
    const time = periodTimes.get(slot.period);
    return sum + (time ? time.endMin - time.startMin : 0);
  }, 0);
  const selectedTimeLabel =
    selectedMinutes >= 60
      ? `${Math.floor(selectedMinutes / 60)}h${selectedMinutes % 60 ? ` ${selectedMinutes % 60}m` : ""}`
      : `${selectedMinutes}m`;
  const selectedDays = useMemo(
    () => Array.from(new Set(selectedSlots.map((slot) => slot.day))).sort((a, b) => a - b),
    [selectedSlots],
  );
  const nextSlot = useMemo(() => {
    if (selectedSlots.length === 0) return null;
    const sorted = [...selectedSlots].sort((a, b) => a.day - b.day || a.period - b.period);
    if (todayDow == null || nowMin == null) return sorted[0];
    return (
      sorted.find((slot) => {
        if (slot.day !== todayDow) return slot.day > todayDow;
        const time = periodTimes.get(slot.period);
        return time ? time.endMin > nowMin : true;
      }) ?? sorted[0]
    );
  }, [selectedSlots, todayDow, nowMin, periodTimes]);
  const nextSlotLabel = (() => {
    if (!nextSlot) return null;
    const time = periodTimes.get(nextSlot.period);
    return `${WEEK_LABELS_SHORT[nextSlot.day - 1]} · ${
      time ? formatRange(time.startMin, time.endMin) : `Period ${nextSlot.period + 1}`
    }`;
  })();

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
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 flex-col gap-5">
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
              <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-busy="true" aria-label="Loading timetable">
                <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-32 rounded-md" />
                      <Skeleton className="h-3 w-48 rounded-md" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-40 rounded-full" />
                </div>
                <div className="flex flex-col">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[104px_repeat(5,minmax(0,1fr))] gap-2 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <Skeleton className="h-9 w-16 rounded-md" />
                      {[0, 1, 2, 3, 4].map((cell) => (
                        <Skeleton
                          key={cell}
                          className={cn(
                            "h-9 w-full rounded-md",
                            (i + cell) % 3 === 0 && "opacity-40",
                          )}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* The shared stat deck: load figures + the linked teacher code. */}
              <StatDeck
                title="My classes"
                icon={BookOpen}
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
                    value: linked?.code ?? "—",
                    hint: linked ? `${linked.name} · tap to unlink` : "No code on file",
                    onClick: () => setConfirmReleaseOpen(true),
                    indicator: "none",
                    ariaLabel: `Linked teacher ${linked?.name ?? "none"} — unlink code`,
                  },
                ]}
              />

              {classes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
                  <p className="text-sm font-medium">No classes published yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                    Your timetable hasn&rsquo;t been published yet — the administrator
                    publishes section schedules.
                  </p>
                </div>
              ) : (
                <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
                  {/* Timetable header: what is placed, today, and how to narrow it down. */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3.5 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <CalendarDays size={15} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          Weekly timetable
                          {todayDow != null && todayDow >= 1 && todayDow <= 5 ? (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                              Today · {WEEK_LABELS_SHORT[todayDow - 1]}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          {slots.length === 0
                            ? "No published timeslot yet"
                            : `${slots.length} weekly ${slots.length === 1 ? "session" : "sessions"} · ${
                                classes.length - unplacedClasses.length
                              } of ${classes.length} classes placed${
                                todayCount > 0 ? ` · ${todayCount} today` : ""
                              }`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                        className="w-56 max-w-full"
                        placeholder="Find a subject or section…"
                        value={query}
                        onChange={setQuery}
                        aria-label="Find a class"
                      />
                    </div>
                  </div>

                  {/* Week grid: Mon–Fri columns, one row per period, break bands in between. */}
                  <div className="overflow-x-auto">
                    <table
                      className="w-full min-w-[54rem] border-collapse text-[12px]"
                      aria-label="Weekly class timetable"
                    >
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            className="w-[104px] border-b border-border px-3 py-2 text-left text-[12px] font-medium text-muted-foreground"
                          >
                            Time
                          </th>
                          {DAYS.map((day) => {
                            const isToday = todayDow === day;
                            return (
                              <th
                                key={day}
                                scope="col"
                                className={cn(
                                  "border-b border-l border-border px-2 py-2 text-center",
                                  isToday && "bg-amber-500/[0.06]",
                                )}
                              >
                                <span
                                  className={cn(
                                    "text-[12px] font-semibold uppercase tracking-[0.08em]",
                                    isToday
                                      ? "text-amber-700 dark:text-amber-400"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {WEEK_LABELS_SHORT[day - 1]}
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => {
                          if (row.kind !== "period") {
                            const isLunch = row.kind === "lunch";
                            return (
                              <tr key={`break-${ri}`}>
                                <td
                                  colSpan={DAYS.length + 1}
                                  className="border-b border-border bg-muted/40 px-3 py-1 text-center text-[12px] text-muted-foreground"
                                >
                                  {isLunch ? (
                                    <Utensils size={11} className="mr-1 inline" aria-hidden />
                                  ) : (
                                    <Coffee size={11} className="mr-1 inline" aria-hidden />
                                  )}
                                  {isLunch ? "Lunch break" : row.label} ·{" "}
                                  {formatRange(row.startMin, row.endMin)}
                                </td>
                              </tr>
                            );
                          }
                          const isNowRow =
                            todayDow != null &&
                            nowMin != null &&
                            nowMin >= row.startMin &&
                            nowMin < row.endMin;
                          return (
                            <tr
                              key={`period-${row.periodIndex}`}
                              className={cn(isNowRow && "bg-amber-500/[0.03]")}
                            >
                              <th
                                scope="row"
                                className="border-b border-border px-3 py-2 text-left align-middle font-normal"
                              >
                                <span
                                  className={cn(
                                    "block text-[12px] font-semibold tabular-nums",
                                    isNowRow
                                      ? "text-amber-700 dark:text-amber-400"
                                      : "text-foreground",
                                  )}
                                >
                                  {formatClock(row.startMin)}
                                </span>
                                <span className="block text-[12px] tabular-nums text-muted-foreground">
                                  {formatClock(row.endMin)}
                                </span>
                              </th>
                              {DAYS.map((day) => {
                                const cellSlots = (
                                  slotsByCell.get(`${day}:${row.periodIndex}`) ?? []
                                ).filter(slotMatches);
                                const isToday = todayDow === day;
                                return (
                                  <td
                                    key={day}
                                    className={cn(
                                      "border-b border-l border-border p-1.5 align-top",
                                      isToday && "bg-amber-500/[0.04]",
                                      isToday && isNowRow && "bg-amber-500/[0.09]",
                                    )}
                                  >
                                    {cellSlots.length === 0 ? (
                                      <div className="h-11" aria-hidden />
                                    ) : (
                                      <div className="flex flex-col gap-1">
                                        {cellSlots.map((slot) => {
                                          const time = periodTimes.get(slot.period);
                                          return (
                                            <button
                                              key={`${slot.subject.id}|${slot.section.id}|${slot.day}|${slot.period}`}
                                              type="button"
                                              onClick={() => openSlot(slot)}
                                              title={`${slot.subject.name} · ${slot.section.name}${
                                                time
                                                  ? ` · ${formatRange(time.startMin, time.endMin)}`
                                                  : ""
                                              }`}
                                              className="flex w-full min-w-0 flex-col gap-0.5 rounded-lg border border-amber-500/35 bg-amber-500/[0.09] px-2 py-1.5 text-left transition-colors duration-150 hover:border-amber-500/70 hover:bg-amber-500/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                                            >
                                              <span className="flex w-full min-w-0 items-center gap-1">
                                                <MapPin
                                                  size={11}
                                                  aria-hidden
                                                  className="shrink-0 text-amber-600 dark:text-amber-400"
                                                />
                                                <span className="truncate text-[12px] font-semibold">
                                                  {slot.section.name}
                                                </span>
                                              </span>
                                              <span className="w-full truncate text-[12px] text-muted-foreground">
                                                {slot.subject.name}
                                              </span>
                                              <span className="mt-0.5 flex w-full min-w-0 items-center gap-1">
                                                <Pill
                                                  field="grade"
                                                  className="px-1.5 py-0"
                                                >
                                                  {slot.section.gradeLevel}
                                                </Pill>
                                                <span className="truncate text-[12px] font-medium text-muted-foreground">
                                                  {slot.subject.code}
                                                </span>
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {filtersActive && matchingSlotCount === 0 ? (
                    <p className="border-t border-border px-3.5 py-3 text-center text-[12px] text-muted-foreground">
                      {searchEmptyMessage(query, "classes", "Try another grade or search term.")}
                    </p>
                  ) : null}

                  {/* Classes the administrator has not placed on the grid yet. */}
                  {unplacedClasses.length > 0 ? (
                    <div className="border-t border-border px-3.5 py-3">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Classes without a published timeslot
                      </p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {unplacedClasses.map((c) => (
                          <li
                            key={`${c.subjectId}|${c.sectionId}`}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5"
                          >
                            <BookOpen
                              size={13}
                              aria-hidden
                              className="shrink-0 text-muted-foreground"
                            />
                            <button
                              type="button"
                              onClick={() => setSelectedClass(c)}
                              className="min-w-0 truncate text-[13px] font-medium hover:underline"
                            >
                              {c.subjectName}
                            </button>
                            <Pill tone="amber" label="Subject code">
                              {c.subjectCode}
                            </Pill>
                            <Pill field="grade">Grade {c.gradeLevel.replace("G", "")}</Pill>
                            <Pill field="section">{c.sectionName}</Pill>
                            <span className="ml-auto flex items-center gap-1">
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 bg-card px-2 text-[12px]"
                              >
                                <Link href="/teacher/grading">Gradebook</Link>
                              </Button>
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 bg-card px-2 text-[12px]"
                              >
                                <Link href="/teacher/attendance">Attendance</Link>
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
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

      {/* Class detail modal: the subject's published weekly timeslots. */}
      {selectedClass ? (
        <KanbanOverlay
          open
          onClose={() => setSelectedClass(null)}
          width="xl"
          title={selectedClass.subjectName}
          icon={
            <span className="text-amber-600 dark:text-amber-400" aria-hidden>
              <BookOpen size={14} />
            </span>
          }
          description={`Weekly schedule · ${selectedClass.sectionName}`}
          footer={
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <p className="hidden min-w-0 flex-1 truncate text-[12px] text-muted-foreground sm:block">
                {nextSlotLabel ? `Next session · ${nextSlotLabel}` : "No published timeslot yet"}
              </p>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[12px]"
                >
                  <Link href="/teacher/grading">
                    <NotebookPen size={12} aria-hidden />
                    Gradebook
                  </Link>
                </Button>
                <Button asChild size="sm" className="h-6 gap-1 px-2 text-[12px]">
                  <Link href="/teacher/attendance">
                    <CalendarCheck size={12} aria-hidden />
                    Attendance
                  </Link>
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone="amber" label="Subject code">
                {selectedClass.subjectCode}
              </Pill>
              <Pill field="grade">Grade {selectedClass.gradeLevel.replace("G", "")}</Pill>
              <Pill field="section">{selectedClass.sectionName}</Pill>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_172px]">
              {/* The week at a glance — one column per school day. */}
              <section
                aria-label="Week at a glance"
                className="min-w-0 overflow-hidden rounded-lg border border-border"
              >
                <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Week at a glance
                  </p>
                  <span className="text-[12px] text-muted-foreground">
                    {selectedSlots.length} {selectedSlots.length === 1 ? "session" : "sessions"}
                  </span>
                </header>
                <div className="grid grid-cols-5">
                  {DAYS.map((day) => {
                    const daySlots = selectedSlots.filter((slot) => slot.day === day);
                    const isToday = todayDow === day;
                    return (
                      <div
                        key={day}
                        className={cn(
                          "flex min-h-[128px] min-w-0 flex-col gap-1.5 border-l border-border p-2 first:border-l-0",
                          isToday && "bg-amber-500/[0.06]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-between gap-1 text-[12px] font-semibold uppercase tracking-[0.08em]",
                            isToday
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {WEEK_LABELS_SHORT[day - 1]}
                          {isToday ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                              title="Today"
                            />
                          ) : null}
                        </span>
                        {daySlots.length === 0 ? (
                          <span className="text-[12px] text-muted-foreground/70">—</span>
                        ) : (
                          daySlots.map((slot) => {
                            const time = periodTimes.get(slot.period);
                            return (
                              <span
                                key={`${slot.day}:${slot.period}`}
                                className="rounded-md border border-amber-500/35 bg-amber-500/10 px-1 py-1 text-center text-[12px] font-semibold tabular-nums text-amber-700 dark:text-amber-400"
                              >
                                {time ? formatClock(time.startMin) : `Period ${slot.period + 1}`}
                                {time ? (
                                  <span className="block font-normal text-muted-foreground">
                                    {formatClock(time.endMin)}
                                  </span>
                                ) : null}
                              </span>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Facts rail. */}
              <aside className="flex min-w-0 flex-col gap-2">
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Time in class
                  </p>
                  <p className="mt-1 flex items-baseline gap-1 text-lg font-semibold tabular-nums leading-none">
                    <Clock
                      size={14}
                      aria-hidden
                      className="translate-y-0.5 text-muted-foreground"
                    />
                    {selectedTimeLabel}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Meetup days
                  </p>
                  <p className="mt-1 text-[13px] font-medium">
                    {selectedDays.length === 0
                      ? "—"
                      : selectedDays.map((d) => WEEK_LABELS_SHORT[d - 1]).join(" · ")}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Where
                  </p>
                  <p className="mt-1 flex items-start gap-1 text-[13px] font-medium">
                    <MapPin
                      size={13}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                    />
                    <span className="min-w-0 break-words">{selectedClass.sectionName}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Grade {selectedClass.gradeLevel.replace("G", "")}
                  </p>
                </div>
              </aside>
            </div>

            {selectedSlots.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
                No published timeslot for this class this term yet — the administrator has not
                released its grid.
              </p>
            ) : null}
          </div>
        </KanbanOverlay>
      ) : null}
    </div>
  );
}
