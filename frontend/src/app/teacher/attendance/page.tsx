"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { liveQueryOptions, useLiveQuery } from "@/lib/api/live";
import { markSelfNotified } from "@/lib/realtime/teacherChannel";
import { useTeacherInvalidate } from "../components/use-teacher-invalidate";
import { apiClient } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/errors";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { ShimmerSkeleton } from "@/components/ui/shimmer-skeleton";
import { AttendanceRosterTable } from "./components/AttendanceRosterTable";
import { AttendanceTermGate, AttendanceLinkGate } from "./components/AttendanceTermGate";
import { VerifyCodeCard } from "./components/verify-code-card";
import { AttendanceSheetDrawer } from "./components/attendance-sheet-drawer";
import {
  AttendanceTimetable,
  AttendanceTimetableSkeleton,
  type AttendanceCell,
} from "./components/attendance-timetable";
import { useAttendancePairs, type LinkedName } from "./components/use-attendance-pairs";
import {
  isEditableDay,
  phTodayKey,
  useMeetupDates,
  useOfferedSubjects,
  useSectionRoster,
  useSheetContext,
} from "@/services/teacher/attendance.service";
import type { SheetContext } from "@/services/teacher/attendance.types";
import { TeacherGateCard } from "@/app/teacher/components/TeacherGateCard";
import { useTerm } from "@/lib/term/TermContext";
import {
  buildTimetable,
  DEFAULT_DAY_CONFIG,
  formatClock,
} from "@/components/schedule/schedule-time";
import type { AttendanceLive } from "./components/AttendanceRosterTable";
import styles from "./components/attendance-sheet.module.css";
interface TermGrant {
  via: string;
  attendanceVerified: boolean;
}

function SheetLiveNotice({ title, message }: { title: string; message: string }) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      title={`${title} — ${message}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
      <span className="truncate">
        <span className="font-medium text-foreground">{title}</span>
        <span aria-hidden> · </span>
        {message}
      </span>
    </span>
  );
}

/** Most recent date (Manila) that falls on the picked weekday — today's slot
 * opens today, an earlier weekday opens that day this week. */
function defaultDateForDow(day: number): string {
  const todayKey = phTodayKey();
  const base = new Date(`${todayKey}T00:00:00Z`);
  const todayDow = ((base.getUTCDay() + 6) % 7) + 1;
  const back = (todayDow - day + 7) % 7;
  return new Date(base.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

export default function TeacherAdvisoryAttendancePage() {
  const invalidateTeacher = useTeacherInvalidate();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [date, setDate] = useState(phTodayKey);
  const [attCode, setAttCode] = useState("");
  const [attCodeError, setAttCodeError] = useState<string | null>(null);
  const [blocksMode, setBlocksMode] = useState(false);
  const { activeTerm } = useTerm();
  const termLabel = activeTerm
    ? `${activeTerm.schoolYearName} · Term ${activeTerm.termNumber}`
    : "this term";
  const termKey = `${activeTerm?.schoolYearId ?? ""}:${activeTerm?.termId ?? ""}`;
  const meQuery = useLiveQuery<{ teacherName: LinkedName | null; termGrant: TermGrant | null }>({
    queryKey: ["teacher-schedule-me", termKey],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        teacherName: LinkedName | null;
        termGrant: TermGrant | null;
      }>("/api/teacher/schedule/teachers/me");
      return data;
    },
    retry: false,
    staleTime: 30_000,
    ...liveQueryOptions,
  });
  const linked = meQuery.data?.teacherName ?? null;
  const termGrant = meQuery.data?.termGrant ?? null;
  // Every teacher — master included — must link a code and enter the term.
  const { pairs, mySlotsQuery, configQuery } = useAttendancePairs(termKey, linked);
  const sheetContext = useSheetContext();
  const advisorySectionId = sheetContext.data?.sectionId ?? null;
  const verify = useMutation({
    mutationFn: async (teacherCode: string) => {
      const { data } = await apiClient.post<{
        verified: boolean;
        teacherName: { id: string };
      }>("/api/teacher/schedule/teachers/verify-attendance", {
        code: teacherCode,
      });
      return data;
    },
    onSuccess: (data) => {
      setAttCodeError(null);
      if (data?.teacherName?.id) markSelfNotified(data.teacherName.id);
      invalidateTeacher.schedule();
      toast.success({
        title: "Attendance unlocked",
        description: `Your code matches — per-subject sheets are now open for ${termLabel}.`,
      });
    },
    onError: (err: unknown) => {
      const message = apiErrorMessage(err, "Could not verify teacher code.");
      setAttCodeError(message);
      toast.error({ title: "Could not verify code", description: message });
    },
  });
  // The slot picked on the week grid; the drawer only opens with one.
  const [picked, setPicked] = useState<{
    key: string;
    pairKey: string;
    day: number;
    period: number;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Save state lifted out of the roster so the drawer can own the bottom action.
  const [saveState, setSaveState] = useState<{
    open: () => void;
    count: number;
    disabled: boolean;
  } | null>(null);
  const selectedPair = pairs.find((p) => p.key === picked?.pairKey) ?? pairs[0];
  const resolvedSectionId = selectedPair?.section.id;
  const rosterQuery = useSectionRoster(resolvedSectionId);
  // Memoize the wrapper: rebuilding { ctx } every render gave the roster
  // table a new effectiveCtx identity per render, which retriggered every
  // downstream memo/effect and locked the main thread on this page.
  /* eslint-disable react-hooks/preserve-manual-memoization -- load-bearing manual memo */
  const rosterOverride = useMemo<{
    ctx: SheetContext | null;
    pending: boolean;
    error: boolean;
    requestedSectionId: string | null;
  }>(() => {
    const data = rosterQuery.data;
    return {
      ctx: data
        ? {
            sectionId: data.sectionId,
            sectionName: data.sectionName,
            termId: data.termId,
            students: data.students,
          }
        : null,
      pending: rosterQuery.isPending,
      error: rosterQuery.isError,
      requestedSectionId: resolvedSectionId ?? null,
    };
  }, [
    rosterQuery.data,
    rosterQuery.isPending,
    rosterQuery.isError,
    resolvedSectionId,
  ]);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const offeredQuery = useOfferedSubjects(resolvedSectionId, rosterQuery.data?.termId);
  const offered = offeredQuery.data ?? [];
  const myOffered = offered.filter((s) => s.canMark && (s.isMine ?? true));
  const resolvedSubjectId =
    selectedPair?.subject?.id ??
    myOffered.find((s) => s.canMark)?.subjectId ??
    myOffered[0]?.subjectId ??
    offered.find((s) => s.canMark)?.subjectId ??
    offered[0]?.subjectId;
  const resolvedOffered = offered.find((s) => s.subjectId === resolvedSubjectId);
  const resolvedAssignmentId = resolvedOffered?.myAssignmentId ?? resolvedOffered?.assignmentId;
  const takenByOther =
    !!resolvedOffered && (resolvedOffered.takenByOther || ((resolvedOffered.isMine === false) && !resolvedOffered.myAssignmentId));
  /* eslint-disable react-hooks/preserve-manual-memoization -- load-bearing manual memo */
  const resolvedMeetupDays = useMemo(() => {
    const daySet = new Set(
      (mySlotsQuery.data?.slots ?? [])
        .filter(
          (s) =>
            s.section.id === resolvedSectionId &&
            (!resolvedSubjectId || s.subject.id === resolvedSubjectId),
        )
        .map((s) => s.day),
    );
    const days = [1, 2, 3, 4, 5].filter((d) => daySet.has(d));
    return days.length > 0 ? days : [1, 2, 3, 4, 5];
  }, [mySlotsQuery.data, resolvedSectionId, resolvedSubjectId]);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const { dateKeys: meetupDateKeys, noClassDays: subjectNoClassDays } = useMeetupDates(
    resolvedSectionId,
    resolvedSubjectId,
    resolvedMeetupDays,
  );
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayDow = now.getDay();
  const todayKey = now.toISOString().slice(0, 10);
  // Administrator "no class" declaration for the selected date. Whole-day rows
  // always cancel; AM/PM rows cancel only when every one of this subject's
  // meetups that weekday falls inside the cancelled half.
  /* eslint-disable react-hooks/preserve-manual-memoization -- plain derived value */
  const noClassForDate = useMemo(() => {
    const hit = subjectNoClassDays.find((n) => n.date === date);
    if (!hit) return null;
    if (hit.scope === "whole_day") return hit;
    const cfg = configQuery.data?.config;
    if (!cfg) return null;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const day = dow === 0 ? 7 : dow;
    const periods = (selectedPair?.slots ?? [])
      .filter((s) => s.day === day)
      .map((s) => s.period);
    if (periods.length === 0) return hit;
    const outside = periods.some(
      (p) => (p < cfg.lunch.afterPeriod ? "am" : "pm") !== hit.scope,
    );
    return outside ? null : hit;
  }, [subjectNoClassDays, date, configQuery.data, selectedPair]);
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const gate: { live: AttendanceLive; slot: number } = (() => {
    const base = { nowMin, todayKey, todayEnd: null as number | null };
    const todayPH = phTodayKey();
    if (noClassForDate) {
      return {
        live: {
          ...base,
          locked: true,
          tone: "lock",
          message: `No class on ${date}${noClassForDate.scope === "whole_day" ? "" : ` (${noClassForDate.scope.toUpperCase()} only)`} — ${noClassForDate.reason}`,
        },
        slot: 1,
      };
    }
    if (date < todayPH) {
      const subjectName = selectedPair?.subject?.name;
      // The API locks anything before this week (PAST_LOCKED); mirror it here
      // so old sheets read as locked instead of looking editable and failing
      // only on save. Past days inside the current week stay editable.
      if (!isEditableDay(date)) {
        return {
          live: {
            ...base,
            locked: true,
            tone: "lock",
            message: subjectName
              ? `${subjectName} · sheet ${date} is from a previous week — attendance is locked.`
              : `Sheet ${date} is from a previous week — attendance is locked.`,
          },
          slot: 1,
        };
      }
      return {
        live: {
          ...base,
          locked: false,
          tone: "info",
          message: subjectName
            ? `${subjectName} · past sheet ${date} — you can still edit these marks.`
            : `Past sheet ${date} — you can still edit these marks.`,
        },
        slot: 1,
      };
    }
    if (date > todayPH) {
      return {
        live: { ...base, locked: true, tone: "lock", message: "Future sheets are not available." },
        slot: 1,
      };
    }
    if (!selectedPair) {
      return {
        live: { ...base, locked: true, tone: "lock", message: "Select a subject to take attendance." },
        slot: 1,
      };
    }
    if (!selectedPair.subject || selectedPair.slots.length === 0) {
      return { live: { ...base, locked: false, tone: "info", message: null }, slot: 1 };
    }
    const cfg = configQuery.data?.config;
    if (!cfg) {
      return {
        live: { ...base, locked: true, tone: "lock", message: "Loading schedule times…" },
        slot: 1,
      };
    }
    const rows = buildTimetable(cfg);
    const timed = selectedPair.slots.flatMap((s) => {
      if (s.day !== todayDow) return [];
      const row = rows.find((r) => r.kind === "period" && r.periodIndex === s.period);
      return row && row.kind === "period" ? [{ ...s, start: row.startMin, end: row.endMin }] : [];
    });
    if (timed.length === 0) {
      return {
        live: {
          ...base,
          locked: true,
          tone: "lock",
          message: `No meetup today for ${selectedPair.subject.name}.`,
        },
        slot: 1,
      };
    }
    const todayEnd = Math.max(...timed.map((t) => t.end));
    const withEnd = { ...base, todayEnd };
    const liveSlot = timed.find((t) => nowMin >= t.start && nowMin < t.end);
    if (liveSlot) {
      return {
        live: {
          ...withEnd,
          locked: false,
          tone: "info",
          message: `${selectedPair.subject.name} is live now · ends ${formatClock(liveSlot.end)}.`,
        },
        // Slots are 1-based on the wire (timetable periods are 0-based).
        slot: liveSlot.period + 1,
      };
    }
    const done = [...timed]
      .filter((t) => nowMin >= t.end)
      .sort((a, b) => b.end - a.end)[0];
    if (done) {
      return {
        live: {
          ...withEnd,
          locked: false,
          tone: "info",
          message: `${selectedPair.subject.name} ended at ${formatClock(done.end)} — you can still edit these marks.`,
        },
        slot: done.period + 1,
      };
    }
    const next = [...timed].filter((t) => nowMin < t.start).sort((a, b) => a.start - b.start)[0]!;
    return {
      live: {
        ...withEnd,
        locked: true,
        tone: "lock",
        message: `Locked — ${selectedPair.subject.name} starts at ${formatClock(next.start)}. Attendance opens when class is live.`,
      },
      slot: next.period + 1,
    };
  })();
  // A picked grid cell is explicit: its period is the sheet slot, even when the
  // subject meets different periods on other days.
  const slot = picked ? picked.period + 1 : gate.slot;
  const rows = useMemo(
    () => buildTimetable(configQuery.data?.config ?? DEFAULT_DAY_CONFIG),
    [configQuery.data?.config],
  );
  const hasGrant = termGrant !== null;
  const isAdvisoryPair =
    !!advisorySectionId && (selectedPair?.section.id ?? null) === advisorySectionId;
  const canMarkPair = !!termGrant && (!!termGrant.attendanceVerified || isAdvisoryPair);
  const needsVerifyForPair = hasGrant && !canMarkPair;
  // Memoize the live prop: the gate builds a fresh object every render and
  // the roster table memos on it — an unstable identity re-ran every table
  // memo/effect per render and wedged the main thread.
  const liveLocked = gate.live.locked || needsVerifyForPair || takenByOther;
  const liveMessage = gate.live.message;
  const liveTone = gate.live.tone;
  const liveNowMin = gate.live.nowMin;
  const liveTodayKey = gate.live.todayKey;
  const liveTodayEnd = gate.live.todayEnd;
  /* eslint-disable react-hooks/preserve-manual-memoization -- load-bearing manual memo */
  const live = useMemo<AttendanceLive>(
    () => ({
      locked: liveLocked,
      tone: liveTone,
      message: liveMessage,
      nowMin: liveNowMin,
      todayKey: liveTodayKey,
      todayEnd: liveTodayEnd,
    }),
    [liveLocked, liveTone, liveMessage, liveNowMin, liveTodayKey, liveTodayEnd],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const handlePick = (cell: AttendanceCell) => {
    setPicked({
      key: cell.key,
      pairKey: cell.pairKey,
      day: cell.day,
      period: cell.period,
    });
    setDate(defaultDateForDow(cell.day));
    setDrawerOpen(true);
  };
  if (meQuery.isPending || (linked && mySlotsQuery.isPending)) {
    return (
      <section className={styles.page} aria-busy="true" aria-label="Loading attendance">
        <div className={styles.body}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              <ShimmerSkeleton className="h-4 w-44" />
              <ShimmerSkeleton className="h-3 w-64 max-w-full" />
            </div>
            <ShimmerSkeleton className="h-4 w-40" />
          </div>
          <AttendanceTimetableSkeleton />
        </div>
      </section>
    );
  }
  if (!linked) {
    return <AttendanceLinkGate termLabel={termLabel} />;
  }
  const handleVerify = () => {
    if (verify.isPending) return;
    if (!attCode.trim()) {
      setAttCodeError("Enter your teacher code to open attendance.");
      return;
    }
    setAttCodeError(null);
    verify.mutate(attCode.trim());
  };
  if (!hasGrant) {
    return (
      <AttendanceTermGate termLabel={termLabel} />
    );
  }
  return (
    <section className={styles.page}>
      {pairs.length === 0 ? (
        <TeacherGateCard
          icon={CalendarDays}
          title={`No records for ${termLabel} yet`}
          subtitle={`Nothing scheduled for ${linked?.name ?? "your linked name"} this term`}
          status="No sheets"
          tone="neutral"
          description="Your classes appear here once the administrator publishes the section schedules. Records are kept per term, so switching term loads that term's own sheets."
          termLabel={termLabel}
          facts={[
            "Sheets follow the published section grid of the selected term.",
            "Nothing is lost when you switch terms — each term keeps its own records.",
            "Ask the administrator if your subject is missing from the grid.",
          ]}
          actionLabel="Open classes"
          href="/teacher/classes"
        />
      ) : (
        <div className={styles.body}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight">Weekly attendance</h1>
              <p className="text-xs text-muted-foreground">
                Pick a time slot to open its attendance sheet.
              </p>
            </div>
            {picked && gate.live.message && gate.live.tone !== "lock" ? (
              <SheetLiveNotice
                title={gate.live.message.includes("live now") ? "Live now" : "Editable"}
                message={gate.live.message}
              />
            ) : null}
          </div>
          <AttendanceTimetable
            rows={rows}
            pairs={pairs}
            todayDow={todayDow}
            nowMin={nowMin}
            activeKey={picked?.key ?? null}
            onPick={handlePick}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Draft
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-blue-500" aria-hidden />
              Submitted
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-green-500" aria-hidden />
              Approved
            </span>
            <span>Tap any slot to record that class&apos;s attendance.</span>
          </div>
        </div>
      )}
      <AttendanceSheetDrawer
        open={drawerOpen && !!picked}
        onClose={() => setDrawerOpen(false)}
        pair={selectedPair ?? null}
        termNumber={activeTerm?.termNumber ?? null}
        schoolYearName={activeTerm?.schoolYearName ?? null}
        date={date}
        onDateChange={setDate}
        meetupDates={meetupDateKeys}
        blocksMode={blocksMode}
        onToggleBlocks={() => setBlocksMode((v) => !v)}
        footer={
          picked ? (
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => saveState?.open()}
              disabled={!saveState || saveState.disabled}
            >
              Save{saveState && saveState.count > 0 ? ` (${saveState.count})` : ""}
            </Button>
          ) : undefined
        }
      >
        {picked ? (
          <>
            {needsVerifyForPair ? (
              <VerifyCodeCard
                sectionName={selectedPair?.section.name}
                termLabel={termLabel}
                attCode={attCode}
                attCodeError={attCodeError}
                verifyPending={verify.isPending}
                onAttCodeChange={(value) => {
                  setAttCode(value);
                  setAttCodeError(null);
                }}
                onVerify={handleVerify}
              />
            ) : null}
            {takenByOther && resolvedOffered ? (
              <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                This subject ({resolvedOffered.name}) is linked to {resolvedOffered.ownerTeacherName ?? resolvedOffered.teacherName} — only their linked students can be marked here. Select your own linked subject.
              </div>
            ) : null}
            {noClassForDate ? (
              <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                <span className="font-medium">No class on this date.</span>{" "}
                {noClassForDate.scope === "whole_day"
                  ? "Classes are cancelled for the whole day."
                  : `Classes are cancelled in the ${noClassForDate.scope.toUpperCase()} only for this subject's meetups.`}{" "}
                <span className="text-muted-foreground">Reason: {noClassForDate.reason}</span>
              </div>
            ) : null}
            <AttendanceRosterTable
              date={date}
              subjectId={resolvedSubjectId}
              assignmentId={resolvedAssignmentId}
              slot={slot}
              roster={resolvedSectionId ? rosterOverride : undefined}
              meetupDays={resolvedMeetupDays}
              live={live}
              blocksMode={blocksMode}
              onBlocksModeChange={setBlocksMode}
              externalSave
              onSaveStateChange={setSaveState}
            />
          </>
        ) : null}
      </AttendanceSheetDrawer>
    </section>
  );
}
