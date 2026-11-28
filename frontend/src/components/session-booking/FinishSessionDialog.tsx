"use client";

import * as React from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock,
  ListChecks,
  Loader2,
  MapPin,
  NotebookPen,
  Paperclip,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FormDropdown } from "@/app/guidance/referrals/components/form-dropdown";
import {
  ClinicDatePicker,
  ClinicTimePicker,
} from "@/app/nurse/overview/components/ClinicDateTimePicker";
import styles from "./BookSessionDialog.module.css";
import board from "./FinishSessionDialog.board.module.css";

export interface FinishSessionFields {
  sessionNotes: string;
  outcome?: string;
  followUpSession?: {
    scheduledAt: string;
    sessionType: string;
    venue?: string;
  };
}

interface FinishSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: FinishSessionFields) => void;
  /** One quiet line under the title. Optional when `sessionMeta` is given. */
  description?: string;
  /**
   * The booking being closed, shown as chips above the fields (kind, booked
   * time, venue) so the desk sees which session it is acting on without
   * reading a sentence.
   */
  sessionMeta?: {
    type?: string;
    when?: string;
    venue?: string;
  };
  followUpTitle?: string;
  followUpHint?: string;
  followUpDateLabel?: string;
  followUpTimeLabel?: string;
  venuePlaceholder?: string;
  showSessionType?: boolean;
  sessionTypeOptions?: { value: string; label: string }[];
  defaultSessionType?: string;
  showFollowUpVenue?: boolean;
  docsSection?: React.ReactNode;
  notStarted?: boolean;
  notStartedMessage?: string;
  busy?: boolean;
  serverError?: string | null;
  submitLabel?: string;
  idPrefix?: string;
}

/** Local calendar day — follow-up values are local wall-clock time, so a UTC
    key would let yesterday stay pickable for eight hours every evening. */
function todayKey(): string {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${n.getFullYear()}-${m}-${d}`;
}

/** Local current time as "HH:MM" — the floor for today's follow-up clock. */
function currentTimeKey(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

/** True when `dateKey` + `HH:MM` is already behind us (this minute is fine). */
function isPastMoment(dateKey: string, time: string): boolean {
  if (!dateKey || !time) return false;
  const at = new Date(`${dateKey}T${time}:00`).getTime();
  if (!Number.isFinite(at)) return false;
  return at < Math.floor(Date.now() / 60_000) * 60_000;
}

function toScheduledAt(date: string, time: string): string | null {
  if (!date || !time) return null;
  const at = new Date(`${date}T${time}:00`);
  if (Number.isNaN(at.getTime())) return null;
  return `${date}T${time}:00`;
}

/** One board lane inside the dialog — accent icon chip, title + hint, and the
    matching control below, on a bordered tinted surface. */
function Lane({
  icon,
  title,
  hint,
  tone = "amber",
  required,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  tone?: "amber" | "green" | "blue" | "violet";
  required?: boolean;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "green"
      ? board.toneGreen
      : tone === "blue"
        ? board.toneBlue
        : tone === "violet"
          ? board.toneViolet
          : board.toneAmber;
  return (
    <section className={board.lane}>
      <div className={board.laneHead}>
        <span className={`${board.laneIcon} ${toneClass}`} aria-hidden>
          {icon}
        </span>
        <span className={board.laneText}>
          <p className={board.laneTitle}>{title}</p>
          {hint ? <p className={board.laneHint}>{hint}</p> : null}
        </span>
        <span className={`${board.tag} ${required ? board.tagRequired : ""}`}>
          {required ? "Required" : "Optional"}
        </span>
      </div>
      {children}
    </section>
  );
}

/**
 * "Mark session done" — a single focused board on a blurred backdrop (the same
 * overlay shape as the teacher-shell dialogs). Each field group is its own
 * lane card with an accent icon chip, mirroring the book-session board, and
 * closing is the header X / backdrop / Escape — a Cancel button competing with
 * the primary action is gone.
 */
export function FinishSessionDialog({
  open,
  onClose,
  onSubmit,
  description,
  sessionMeta,
  followUpTitle,
  followUpHint,
  followUpDateLabel = "Follow-up date (optional)",
  followUpTimeLabel = "Follow-up time (optional)",
  venuePlaceholder = "e.g. School clinic",
  showSessionType = false,
  sessionTypeOptions = [],
  defaultSessionType = "individual",
  showFollowUpVenue = true,
  docsSection,
  notStarted = false,
  notStartedMessage = "This session hasn't started yet — you can mark it done once the scheduled time arrives.",
  busy = false,
  serverError = null,
  submitLabel = "Mark done",
  idPrefix = "finish-session",
}: FinishSessionDialogProps) {
  const [notes, setNotes] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [followDate, setFollowDate] = React.useState("");
  const [followTime, setFollowTime] = React.useState("");
  const [followType, setFollowType] = React.useState(defaultSessionType);
  const [venue, setVenue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const openKey = open ? defaultSessionType : null;
  const [prevOpenKey, setPrevOpenKey] = React.useState<string | null>(null);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    setNotes("");
    setOutcome("");
    setFollowDate("");
    setFollowTime("");
    setFollowType(defaultSessionType);
    setVenue("");
    setError(null);
  }

  // Escape closes the overlay — the same affordance as the other kanban
  // overlays (the backdrop button covers pointer users).
  React.useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      setError(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const canSave = !busy && !notStarted && notes.trim() !== "";

  function save() {
    if (notStarted) {
      setError(notStartedMessage);
      return;
    }
    if (!notes.trim()) {
      setError("Write what happened in the session first.");
      return;
    }
    let followUpSession: FinishSessionFields["followUpSession"];
    if (followDate || followTime) {
      const scheduledAt = toScheduledAt(followDate, followTime);
      if (!scheduledAt) {
        setError("Pick both a date and a time for the follow-up — or leave both empty.");
        return;
      }
      if (isPastMoment(followDate, followTime)) {
        setError("Pick the current time or a later date and time for the follow-up.");
        return;
      }
      followUpSession = {
        scheduledAt,
        sessionType: followType,
        ...(venue.trim() ? { venue: venue.trim() } : {}),
      };
    }
    setError(null);
    onSubmit({
      sessionNotes: notes.trim(),
      ...(outcome.trim() ? { outcome: outcome.trim() } : {}),
      ...(followUpSession ? { followUpSession } : {}),
    });
  }

  function closeDialog() {
    onClose();
    setError(null);
  }

  const metaItems: {
    icon: React.ReactNode;
    label: string;
    strong?: boolean;
  }[] = [];
  if (sessionMeta?.type) {
    metaItems.push({
      icon: <ClipboardCheck size={12} aria-hidden />,
      label: sessionMeta.type,
      strong: true,
    });
  }
  if (sessionMeta?.when) {
    metaItems.push({
      icon: <Clock size={12} aria-hidden />,
      label: sessionMeta.when,
    });
  }
  if (sessionMeta?.venue) {
    metaItems.push({
      icon: <MapPin size={12} aria-hidden />,
      label: sessionMeta.venue,
    });
  }

  return (
    <div
      className="whitespace-normal fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mark session done"
      aria-busy={busy || undefined}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={closeDialog}
        disabled={busy}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px] animate-in fade-in-0 duration-150 dark:bg-black/70"
      />
      <div className="relative w-full max-w-2xl animate-in fade-in-0 zoom-in-95 duration-150">
        <KanbanBoard
          className={`flex max-h-[90vh] flex-col overflow-hidden bg-card shadow-2xl [&>div:first-of-type]:shrink-0`}
          title="Mark session done"
          icon={
            <span className="text-amber-500" aria-hidden>
              <ClipboardCheck size={14} />
            </span>
          }
          actions={
            /* 24px close X — same as the other overlay kanbans. */
            <button
              type="button"
              onClick={closeDialog}
              disabled={busy}
              autoFocus
              aria-label="Close dialog"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <X size={14} aria-hidden="true" />
            </button>
          }
          description={description}
        >
          <div className={board.body}>
            {notStarted ? (
              <div
                className={`${board.notice} ${board.noticeWarn}`}
                role="alert"
              >
                <AlertCircle
                  size={14}
                  aria-hidden
                  className={board.noticeIcon}
                />
                <span>{notStartedMessage}</span>
              </div>
            ) : null}

            <div className={`${board.scroll} ${styles.dialogScrollHidden}`}>
              {metaItems.length > 0 ? (
                <div className={board.meta}>
                  {metaItems.map((item) => (
                    <span
                      key={`${item.label}-${item.strong ? "strong" : "quiet"}`}
                      className={`${board.metaItem} ${
                        item.strong ? board.metaType : ""
                      }`}
                      title={item.label}
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              <Lane
                icon={<NotebookPen size={14} />}
                title="Session notes"
                hint="What happened and what was discussed."
                tone="amber"
                required
              >
                <Textarea
                  id={`${idPrefix}-notes`}
                  aria-label="Session notes (required)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What happened? What was discussed…"
                  maxLength={5000}
                  className="min-h-28 resize-y bg-card"
                />
                <p className={board.charCount}>{notes.length} / 5000</p>
              </Lane>

              <div className={docsSection ? board.lanes : undefined}>
                <Lane
                  icon={<ListChecks size={14} />}
                  title="Outcome"
                  hint="The result or the next step."
                  tone="green"
                >
                  <Textarea
                    id={`${idPrefix}-outcome`}
                    aria-label="Outcome (optional)"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="Result or next step…"
                    maxLength={2000}
                    className="min-h-24 resize-y bg-card"
                  />
                </Lane>

                {docsSection ? (
                  <Lane
                    icon={<Paperclip size={14} />}
                    title="Documentation photos"
                    hint="Attach now, or file them later from the session list."
                    tone="blue"
                  >
                    {docsSection}
                  </Lane>
                ) : null}
              </div>

              <Lane
                icon={<CalendarClock size={14} />}
                title={followUpTitle ?? "Follow-up session"}
                hint={
                  followUpHint ??
                  "Book the next session while the details are fresh."
                }
                tone="violet"
              >
                <div className={board.grid}>
                  <ClinicDatePicker
                    id={`${idPrefix}-follow-date`}
                    label={followUpDateLabel}
                    value={followDate}
                    onChange={setFollowDate}
                    min={todayKey()}
                  />
                  <ClinicTimePicker
                    id={`${idPrefix}-follow-time`}
                    label={followUpTimeLabel}
                    value={followTime}
                    onChange={setFollowTime}
                    minTime={
                      followDate === "" || followDate === todayKey()
                        ? currentTimeKey()
                        : undefined
                    }
                  />
                  {showSessionType && sessionTypeOptions.length > 0 ? (
                    <FormDropdown
                      id={`${idPrefix}-follow-type`}
                      label="Follow-up kind"
                      value={followType}
                      onChange={setFollowType}
                      placeholder="Pick a kind"
                      options={sessionTypeOptions}
                    />
                  ) : null}
                  {showFollowUpVenue ? (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${idPrefix}-venue`}>
                        Venue (optional)
                      </Label>
                      <Input
                        id={`${idPrefix}-venue`}
                        value={venue}
                        onChange={(e) => setVenue(e.target.value)}
                        placeholder={venuePlaceholder}
                        maxLength={200}
                        className="bg-card"
                      />
                    </div>
                  ) : null}
                </div>
              </Lane>

              {error || serverError ? (
                <div
                  className={`${board.notice} ${board.noticeError}`}
                  role="alert"
                >
                  <AlertCircle
                    size={14}
                    aria-hidden
                    className={board.noticeIcon}
                  />
                  <span>{error ?? serverError}</span>
                </div>
              ) : null}
            </div>

            <div className={board.footer}>
              <div className={board.summary}>
                <span
                  className={`${board.chip} ${notes.trim() ? board.chipOn : ""}`}
                >
                  {notes.trim() ? <Check size={12} aria-hidden /> : null}
                  Session notes
                </span>
                <span
                  className={`${board.chip} ${
                    followDate || followTime ? board.chipOn : ""
                  }`}
                >
                  {followDate || followTime ? (
                    <Check size={12} aria-hidden />
                  ) : null}
                  {followDate || followTime
                    ? "Follow-up booked"
                    : "Follow-up optional"}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs"
                onClick={save}
                disabled={!canSave}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Marking done…
                  </>
                ) : (
                  <>
                    <ClipboardCheck size={13} aria-hidden />
                    {submitLabel}
                  </>
                )}
              </Button>
            </div>
          </div>
        </KanbanBoard>
      </div>
    </div>
  );
}
