"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import {
  BookSessionDialog,
  type BookSessionFields,
  type BookSessionStudentCard,
} from "@/components/session-booking/BookSessionDialog";
import { useDock } from "@/components/dock/dock-store";
import { referralSessionsManageable } from "../../components/ReferralSessionButtons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { apiErrorMessage } from "@/lib/api/errors";
import { SESSION_KIND_OPTIONS } from "@/lib/labels/sessions";
import { fetchDaySchedule, scheduleSession } from "@/services/guidance/sessions.service";
import {
  scheduleFollowUpSession,
  startFollowUp,
} from "@/services/guidance/interventions.service";
import type {
  AtRiskStudentItem,
  CounselingSessionType,
} from "@/services/guidance/interventions.types";
import type { GuidanceReferralItem } from "@/services/guidance/guidance.types";
import styles from "./guidance-alerts-table.module.css";

function studentCardOf(item: AtRiskStudentItem): BookSessionStudentCard {
  const level = item.riskLevel;
  return {
    name: item.student,
    sub: [item.grade, item.section].filter(Boolean).join(" · "),
    lrn: item.lrn,
    // The board card shows the section pill next to the LRN.
    grade: item.section,
    badgeText: level ? `${level} risk` : undefined,
    badgeVariant:
      level === "High" ? "red" : level === "Moderate" ? "amber" : "outline",
  };
}

/**
 * Booked-session control. With no sessions it renders a "Book session" button
 * so a schedule can be booked straight from the alerts board; once a session
 * exists it collapses to the 24px calendar icon. Both open the same wide
 * booking overlay used by the ADM coordinator (student only, no attendees).
 */
export function GuidanceBookedSessionButton({
  item,
  onBeforeOpen,
  keepOverlayOnOpen = false,
}: {
  item: AtRiskStudentItem;
  onBeforeOpen?: () => void;
  /** Keep the surrounding case overlay mounted while the board is open. */
  keepOverlayOnOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const dock = useDock();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const sessions = item.intervention?.sessions ?? [];
  const hasSessions = sessions.length > 0;
  const hasActiveSession = sessions.some((s) => s.status === "scheduled");

  // A live booking is already surfaced by the row's status/session pills — drop
  // the extra calendar icon so the actions column stays uncluttered.
  if (hasActiveSession) return null;

  const submit = async (fields: BookSessionFields) => {
    const followUpId = item.intervention?.id ?? null;
    const sessionType = (fields.sessionType || "individual") as CounselingSessionType;
    setBusy(true);
    setOpen(false);
    // Confirm always dismisses every alert overlay — the booking board and any
    // case-detail overlay open underneath it.
    onBeforeOpen?.();

    let taskId: string | null = null;
    try {
      taskId = dock.startTask({
        kind: "generic",
        title: "Booking session",
        description: `${item.student} · ${new Date(fields.scheduledAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`,
      });
    } catch {
      taskId = null;
    }

    try {
      const payload = {
        scheduledAt: fields.scheduledAt,
        sessionType,
        ...(fields.venue ? { venue: fields.venue } : {}),
      };
      if (followUpId) {
        await scheduleFollowUpSession(followUpId, payload);
      } else {
        // Legacy alert rows can exist before the engine opened a follow-up.
        await startFollowUp(item.studentKey, {
          recommendedAction: "Schedule a counseling session",
          priority:
            item.riskLevel === "High"
              ? "high"
              : item.riskLevel === "Moderate"
                ? "normal"
                : "low",
          firstSession: payload,
        });
      }
      if (taskId) dock.completeTask(taskId, "Session booked.");
      await queryClient.invalidateQueries({ queryKey: ["guidance-alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["guidance-interventions"] });
    } catch (error) {
      const message = apiErrorMessage(
        error,
        "We couldn't book this session. Please try again.",
      );
      if (taskId) dock.failTask(taskId, message);
      toast.error({
        title: "Couldn't book the session",
        description: message,
      });
    } finally {
      setBusy(false);
    }
  };

  const control = hasSessions ? (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={styles.actionIconButton}
            aria-label={`Booked sessions for ${item.student}`}
            onClick={(event) => {
              event.stopPropagation();
              if (!keepOverlayOnOpen) onBeforeOpen?.();
              setOpen(true);
            }}
          >
            <CalendarCheck className={styles.actionIcon} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <span className="font-medium">Booked session</span>
          <span className="opacity-60">
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <Button
      type="button"
      size="xs"
      variant="default"
      className="h-6 shrink-0 gap-1 px-2 text-[12px] font-semibold"
      onClick={(event) => {
        event.stopPropagation();
        if (!keepOverlayOnOpen) onBeforeOpen?.();
        setOpen(true);
      }}
      aria-label={`Book a session for ${item.student}`}
    >
      <CalendarPlus size={13} aria-hidden />
      Book session
    </Button>
  );

  return (
    <>
      {control}
      {/*
        The board dialog portals to <body>, but React still bubbles its clicks
        through this tree — stop them here so picking a date/time never reaches
        the alert row's "open case" handler.
      */}
      <div
        style={{ display: "contents" }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <BookSessionDialog
          open={open}
          onClose={() => {
            if (busy) return;
            setOpen(false);
          }}
          onSubmit={submit}
          title="Book session"
          description={`Schedule a counseling session for ${item.student}.`}
          studentCard={studentCardOf(item)}
          fetchTakenTimes={(dateKey, signal) => fetchDaySchedule(dateKey, { signal })}
          venueHint="Held at the guidance office unless another venue is given."
          venuePlaceholder="Guidance office"
          showSessionType
          sessionTypeOptions={SESSION_KIND_OPTIONS}
          hasActiveSession={hasActiveSession}
          busy={busy}
          idPrefix="alerts-book"
          variant="board"
        />
      </div>
    </>
  );
}

/**
 * Booking control for a referral case shown on the alerts drawer. Referrals
 * are booked through the referrals API (the intervention-based button above
 * only serves engine follow-ups), so ADM and counseling cases get their own
 * "Book session" action when no session exists yet.
 */
export function GuidanceReferralBookSessionButton({
  referral,
  onBeforeOpen,
}: {
  referral: GuidanceReferralItem;
  /** Called on confirm so the surrounding drawer closes and the dock shows. */
  onBeforeOpen?: () => void;
}) {
  const queryClient = useQueryClient();
  const dock = useDock();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const hasActiveSession = referral.sessions.some((s) => s.status === "scheduled");
  if (hasActiveSession) return null;
  // A closed or endorsed case takes no new bookings — nothing left to schedule.
  if (!referralSessionsManageable(referral)) return null;

  const studentCard: BookSessionStudentCard = {
    name: referral.student,
    sub: [referral.grade, referral.section].filter(Boolean).join(" · "),
    lrn: referral.lrn,
    section: referral.section,
    grade: referral.grade,
  };

  const submit = async (fields: BookSessionFields) => {
    setBusy(true);
    setOpen(false);
    // Confirm dismisses the drawer under the booking board so the shared task
    // dock (bottom-right) is visible while the session is being saved.
    onBeforeOpen?.();

    let taskId: string | null = null;
    try {
      taskId = dock.startTask({
        kind: "generic",
        title: "Booking session",
        description: `${referral.student} · ${new Date(fields.scheduledAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`,
      });
    } catch {
      taskId = null;
    }

    try {
      await scheduleSession(referral.id, {
        scheduledAt: fields.scheduledAt,
        sessionType: (fields.sessionType || "individual") as CounselingSessionType,
        ...(fields.venue ? { venue: fields.venue } : {}),
      });
      if (taskId) dock.completeTask(taskId, "Session booked.");
      toast.success({
        title: "Session booked",
        description: `${referral.student}'s session is now on the guidance schedule.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["guidance-alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["guidance-referrals"] });
      await queryClient.invalidateQueries({ queryKey: ["guidance-referrals-highlight"] });
      await queryClient.invalidateQueries({ queryKey: ["guidance-interventions"] });
    } catch (error) {
      const message = apiErrorMessage(
        error,
        "We couldn't book this session. Please try again.",
      );
      if (taskId) dock.failTask(taskId, message);
      toast.error({
        title: "Couldn't book the session",
        description: message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="default"
        className="h-6 shrink-0 gap-1 px-2 text-[12px] font-semibold"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Book a session for ${referral.student}`}
      >
        <CalendarPlus size={13} aria-hidden />
        Book session
      </Button>
      {/*
        The board dialog portals to <body>, but React still bubbles its clicks
        through this tree — stop them here so picking a date/time never reaches
        the drawer's own handlers.
      */}
      <div
        style={{ display: "contents" }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <BookSessionDialog
          open={open}
          onClose={() => {
            if (busy) return;
            setOpen(false);
          }}
          onSubmit={submit}
          title="Book session"
          description={`Schedule a counseling session for ${referral.student}.`}
          studentCard={studentCard}
          fetchTakenTimes={(dateKey, signal) => fetchDaySchedule(dateKey, { signal })}
          venueHint="Held at the guidance office unless another venue is given."
          venuePlaceholder="Guidance office"
          showSessionType
          sessionTypeOptions={SESSION_KIND_OPTIONS}
          hasActiveSession={hasActiveSession}
          busy={busy}
          idPrefix="alerts-ref-book"
          variant="board"
        />
      </div>
    </>
  );
}
