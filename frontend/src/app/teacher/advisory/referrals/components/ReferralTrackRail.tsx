"use client";

import * as React from "react";
import { CalendarClock, Check, Clock, History, MapPin, MessageSquareText } from "lucide-react";
import { StudentMascot } from "@/components/student-mascot/StudentMascot";
import { buildAdmTrackSteps } from "@/components/adm-tracker/adm-track-data";
import type { TrackerCaseInput } from "@/components/adm-tracker/adm-stage-activity";
import { sessionTypeLabel } from "@/lib/labels/sessions";
import type { TrackableReferral } from "./ReferralTrackDialog";
import styles from "./referrals.module.css";

function humanize(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return `${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} | ${d.toTimeString().slice(0, 5)}`;
}

const SOURCE_LABEL: Record<string, string> = {
  referrals: "Referral",
  counseling_sessions: "Session",
  adm_parent_meetings: "Meeting",
  case: "Case update",
};

const REVIEWER_LABELS: Record<string, string> = {
  nurse: "School Nurse",
  guidance_counselor: "Guidance Counselor",
  lrpc: "LRPC",
};

/** ADM stages where the case still sits with the consultation reviewer. */
const EARLY_ADM_STAGES = new Set(["anecdotal", "consultation"]);

type RailTimelineEntry = TrackableReferral["timeline"][number];

/** Which ADM stage a logged update belongs to — the rail nests its feed there. */
function activityStage(entry: RailTimelineEntry): string {
  if (entry.stage) return entry.stage;
  if (entry.action === "adm_approved") return "principal_approval";
  if (entry.source === "adm_parent_meetings") {
    return entry.homeVisit ? "home_visitation" : "meeting_parents";
  }
  // Counselors and the nurse work the consultation loop, so session updates and
  // referral notes belong to that stage.
  return "consultation";
}

/** One desk update inside an expanded stage. */
function StageActivityRow({ entry }: { entry: RailTimelineEntry }) {
  return (
    <li className={styles.trackFeedItem}>
      <span
        className={styles.trackFeedDot}
        data-source={entry.source ?? "case"}
        aria-hidden
      />
      <div className={styles.trackFeedBody}>
        <p className={styles.trackFeedLabel}>{entry.label}</p>
        {entry.detail?.trim() ? (
          <p className={styles.trackFeedDetail}>{entry.detail}</p>
        ) : null}
        <p className={styles.trackFeedMeta}>
          {entry.byRole ? humanize(entry.byRole) : "Receiving desk"}
          <span className={styles.trackDot} aria-hidden>|</span>
          {SOURCE_LABEL[entry.source ?? "case"] ?? "Case update"}
          <span className={styles.trackDot} aria-hidden>|</span>
          {formatDateTime(entry.at ?? entry.date)}
        </p>
      </div>
    </li>
  );
}

type RailStep = TrackableReferral["timeline"][number] & { step: number };

type RailItem = {
  key: string;
  label: string;
  meta: string;
  detail: string;
  logged?: string;
  state: "done" | "current" | "todo";
};

/**
 * Tracking rail — the case beside the casebook, built like a run plan: a
 * segmented progress bar over the full step list (every ADM stage, or every
 * logged update for a general referral) where the open step expands into its
 * activity, and the recorded reason stays pinned at the base.
 */
export function ReferralTrackRail({
  referral,
  /** Renders bare inside a drawer (no sticky card chrome of its own). */
  embedded = false,
}: {
  referral: TrackableReferral | null;
  embedded?: boolean;
}) {
  if (!referral) return <RailEmpty embedded={embedded} />;

  return <RailBody referral={referral} embedded={embedded} />;
}

function RailEmpty({ embedded }: { embedded?: boolean }) {
  return (
    <aside
      className={`${styles.trackRail} ${embedded ? styles.trackRailEmbedded : ""}`}
      aria-label="Referral tracking"
    >
      <div className={styles.trackEmpty}>
        <span className={styles.trackEmptyIcon} aria-hidden>
          <History size={16} />
        </span>
        <p className={styles.trackEmptyTitle}>Pick a referral</p>
        <p className={styles.trackEmptyCopy}>
          Select a case on the left to follow its updates, sessions and
          hand-offs here.
        </p>
      </div>
    </aside>
  );
}

function RailBody({
  referral,
  embedded = false,
}: {
  referral: TrackableReferral;
  embedded?: boolean;
}) {
  const isAdm = referral.track === "adm";
  const trackInput: TrackerCaseInput | null = isAdm
    ? {
        stage: referral.admStage ?? null,
        referralStatus: referral.status,
        dismissedByRole: referral.dismissedByRole ?? null,
        consultReviewer: referral.consultReviewer ?? null,
        referredBy: null,
        anecdotalDate: referral.observationDate ?? null,
        referredDate: referral.referredAt,
        meetingAttended: referral.meetingAttended ?? null,
        lastMeetingAt: referral.lastMeetingAt ?? null,
        hasHomeVisit: referral.hasHomeVisit ?? false,
        approved: referral.admApproved ?? false,
        approvedAt: referral.admApprovedAt ?? null,
        modulesSubmitted: referral.modulesSubmitted ?? 0,
        modulesTotal: referral.modulesTotal ?? 0,
        lastModuleAt: referral.lastModuleAt ?? null,
        devicesReturned: referral.devicesReturned ?? 0,
        certificationAt: referral.certificationAt ?? null,
        resolvedAt: referral.resolvedAt ?? null,
        timeline: (referral.timeline ?? []).map((t) => ({
          label: t.label,
          detail: t.detail ?? null,
          date: t.date,
          at: t.at ?? t.date,
          action: t.action ?? "",
          byRole: t.byRole ?? null,
          source: t.source ?? "case",
          stage: t.stage ?? null,
          homeVisit: t.homeVisit ?? false,
        })),
      }
    : null;

  // Newest update first; numbering stays chronological.
  const steps: RailStep[] = (referral.timeline ?? [])
    .map((step, index) => ({ ...step, step: index + 1 }))
    .reverse();

  const withReviewer =
    referral.targetRole === "adm_coordinator" &&
    !!referral.consultReviewer &&
    EARLY_ADM_STAGES.has(referral.admStage ?? "consultation");
  const deskNow =
    withReviewer && referral.consultReviewer
      ? (REVIEWER_LABELS[referral.consultReviewer] ??
        humanize(referral.consultReviewer))
      : humanize(referral.targetRole);

  const admSteps = trackInput ? buildAdmTrackSteps(trackInput) : [];
  // Segmented plan bar: one segment per ADM stage (or case update).
  const segments: Array<"done" | "current" | "upcoming"> = isAdm
    ? admSteps.map((step) =>
        step.state === "todo" ? "upcoming" : step.state,
      )
    : steps.map((_, index) => (index === 0 ? "current" : "done"));
  const doneCount = segments.filter((state) => state === "done").length;
  const progressPct =
    segments.length > 0 ? Math.round((doneCount / segments.length) * 100) : 0;

  // ADM cases show the whole pipeline (done → amber, upcoming → dim); other
  // referrals show their logged updates, newest first.
  const railItems: RailItem[] = isAdm
    ? admSteps.map((step) => ({
        key: step.stage,
        label: step.label,
        meta: step.owner,
        detail: step.detail,
        state: step.state,
      }))
    : steps.map((step, index) => ({
        key: `${step.label}-${step.at ?? step.date}-${index}`,
        label: step.label,
        meta: `${SOURCE_LABEL[step.source ?? "case"] ?? "Case update"} | ${formatShortDate(
          step.at ?? step.date,
        )}`,
        detail: step.detail ?? "",
        logged: `${formatDateTime(step.at ?? step.date)}${
          step.byRole ? ` | ${humanize(step.byRole)}` : ""
        }`,
        state: index === 0 ? "current" : "done",
      }));

  const [activeStep, setActiveStep] = React.useState(() => {
    if (!isAdm) return 0;
    const currentIndex = railItems.findIndex((item) => item.state === "current");
    return currentIndex >= 0 ? currentIndex : 0;
  });

  // ADM stages are generic; the timeline carries what the other desks actually
  // did (booked/moved sessions, meeting minutes, coordinator moves, sign-off).
  // Bucket those updates by the stage they belong to so each step can show its
  // own desk activity when expanded.
  const activitiesByStage = React.useMemo(() => {
    const map = new Map<string, TrackableReferral["timeline"]>();
    for (const entry of referral.timeline ?? []) {
      const key = activityStage(entry);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => ((a.at ?? a.date) < (b.at ?? b.date) ? 1 : -1));
    }
    return map;
  }, [referral.timeline]);

  // A cancelled/rejected case records why in its dismissal timeline entry —
  // surface that note here, not just the original reason for referral.
  const dismissal =
    referral.status === "dismissed"
      ? ([...(referral.timeline ?? [])]
          .reverse()
          .find((entry) => entry.action === "referral_dismissed") ?? null)
      : null;
  const closedByTeacher =
    !referral.dismissedByRole ||
    referral.dismissedByRole === "adviser" ||
    referral.dismissedByRole === "subject_teacher";
  const closingLabel = closedByTeacher ? "Cancellation note" : "Rejection note";
  const closingNote = dismissal?.detail?.trim() ?? "";

  return (
    <aside
      className={`${styles.trackRail} ${embedded ? styles.trackRailEmbedded : ""}`}
      aria-label="Referral tracking"
    >
      <header className={styles.trackHead}>
        <p className={styles.trackEyebrow}>
          <History size={12} aria-hidden />
          Referral pathway
        </p>
        <div className={styles.trackIdentity}>
          <StudentMascot
            name={referral.studentName}
            seed={referral.lrn}
            character={referral.mascot ?? undefined}
            size={34}
          />
          <div className={styles.trackIdentityText}>
            <h2 className={styles.trackName} title={referral.studentName}>
              {referral.studentName}
            </h2>
            <p className={styles.trackMetaLine}>
              <span>
                LRN:{" "}
                <span className={styles.trackMetaValue}>{referral.lrn}</span>
              </span>
              <span className={styles.trackMetaSep} aria-hidden>
                |
              </span>
              <span>
                Status:{" "}
                <span className={styles.trackMetaValue}>
                  {referral.statusLabel}
                </span>
              </span>
              <span className={styles.trackMetaSep} aria-hidden>
                |
              </span>
              <span>
                Type:{" "}
                <span className={styles.trackMetaValue}>
                  {referral.typeLabel}
                </span>
              </span>
            </p>
          </div>
        </div>

        {referral.bookedSession && referral.status !== "dismissed" ? (
          <div className={styles.trackBooking}>
            <span className={styles.trackBookingIcon} aria-hidden>
              <CalendarClock size={12} />
            </span>
            <div className={styles.trackBookingBody}>
              <p className={styles.trackBookingLabel}>Booked session</p>
              <p className={styles.trackBookingValue}>
                {sessionTypeLabel(referral.bookedSession.sessionType)}
                <span className={styles.trackDot} aria-hidden>|</span>
                {formatDateTime(referral.bookedSession.scheduledAt)}
              </p>
              <p className={styles.trackBookingMeta}>
                <MapPin size={10} aria-hidden />
                {referral.bookedSession.venue?.trim() || "Venue not set"}
              </p>
            </div>
          </div>
        ) : null}

        <p className={styles.trackMetaLine}>
          <span>
            Handled by:{" "}
            <span className={styles.trackMetaValue}>
              {deskNow}
            </span>
          </span>
          <span className={styles.trackMetaSep} aria-hidden>
            |
          </span>
          <span>
            Progress:{" "}
            <span className={styles.trackMetaValue}>
              {isAdm
                ? `${doneCount} of ${admSteps.length} stages`
                : `${steps.length} update${steps.length === 1 ? "" : "s"}`}
            </span>
          </span>
        </p>

        {segments.length > 0 ? (
          <div
            className={styles.trackSegments}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={isAdm ? "ADM pipeline progress" : "Case update progress"}
          >
            {segments.map((state, index) => (
              <span
                key={`segment-${index}`}
                className={styles.trackSegment}
                data-state={state}
              />
            ))}
          </div>
        ) : null}
      </header>

      {railItems.length > 0 ? (
        <div className={styles.trackScroll}>
          <ol
            className={styles.trackSteps}
            aria-label={isAdm ? "ADM pipeline" : "Case updates"}
          >
            {railItems.map((item, index) => {
              const stageEntries =
                isAdm ? (activitiesByStage.get(item.key) ?? []) : [];
              return (
              <li key={item.key}>
                <button
                  type="button"
                  className={`${styles.trackStep} ${
                    index === activeStep ? styles.trackStepActive : ""
                  } ${item.state === "todo" ? styles.trackStepTodo : ""}`}
                  onClick={() => setActiveStep(index)}
                  aria-pressed={index === activeStep}
                  aria-label={
                    isAdm && stageEntries.length > 0
                      ? `${item.label}, ${stageEntries.length} desk update${
                          stageEntries.length === 1 ? "" : "s"
                        }`
                      : undefined
                  }
                >
                  <span
                    className={styles.trackStepMarker}
                    data-state={item.state}
                    aria-hidden
                  >
                    {item.state === "done" ? (
                      <Check size={10} strokeWidth={3.25} />
                    ) : item.state === "current" ? (
                      <span className={styles.trackStepPulse} />
                    ) : null}
                  </span>
                  <span className={styles.trackStepText}>
                    <span className={styles.trackStepLabel}>{item.label}</span>
                    <span className={styles.trackStepMeta}>{item.meta}</span>
                  </span>
                  {stageEntries.length > 0 ? (
                    <span
                      className={styles.trackStepCount}
                      title={`${stageEntries.length} desk update${
                        stageEntries.length === 1 ? "" : "s"
                      }`}
                      aria-hidden
                    >
                      {stageEntries.length}
                    </span>
                  ) : null}
                </button>

                {index === activeStep ? (
                  <div className={styles.trackActivities} aria-live="polite">
                    <div className={styles.trackActivity}>
                      <span className={styles.trackActivityIcon} aria-hidden>
                        <MessageSquareText size={11} />
                      </span>
                      <span className={styles.trackActivityLabel}>
                        {isAdm ? "Stage" : "Note"}
                      </span>
                      <span
                        className={styles.trackActivityValue}
                        data-muted={!item.detail.trim() || undefined}
                      >
                        {item.detail.trim()
                          ? item.detail
                          : "No note was recorded with this update."}
                      </span>
                    </div>
                    {item.logged ? (
                      <div className={styles.trackActivity}>
                        <span className={styles.trackActivityIcon} aria-hidden>
                          <Clock size={11} />
                        </span>
                        <span className={styles.trackActivityLabel}>Logged</span>
                        <span className={styles.trackActivityValue}>
                          {item.logged}
                        </span>
                      </div>
                    ) : null}
                    {isAdm ? (
                      stageEntries.length > 0 ? (
                        <ul
                          className={styles.trackStageFeed}
                          aria-label={`Desk activity for ${item.label}`}
                        >
                          {stageEntries.map((entry, entryIndex) => (
                            <StageActivityRow
                              key={`${entry.label}-${entry.at ?? entry.date}-${entryIndex}`}
                              entry={entry}
                            />
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.trackStageEmpty}>
                          Nothing logged by the desk on this stage yet.
                        </p>
                      )
                    ) : null}
                  </div>
                ) : null}
              </li>
              );
            })}
          </ol>

          {referral.status === "dismissed" ? (
            <footer className={styles.trackFoot}>
              <p className={styles.trackFootLabel}>{closingLabel}</p>
              <p className={styles.trackFootText}>
                {closingNote ||
                  (closedByTeacher
                    ? "No note was left when the referral was cancelled."
                    : "No note was left when the desk rejected the referral.")}
              </p>
            </footer>
          ) : null}

          {referral.reason.trim() ? (
            <footer className={styles.trackFoot}>
              <p className={styles.trackFootLabel}>Reason for referral</p>
              <p className={styles.trackFootText}>{referral.reason}</p>
            </footer>
          ) : null}
        </div>
      ) : (
        <div className={styles.trackNoSteps}>
          <p className={styles.trackEmptyTitle}>No updates yet</p>
          <p className={styles.trackEmptyCopy}>
            The desk has not logged anything on this case. Its first update
            will appear here.
          </p>
        </div>
      )}
    </aside>
  );
}
