import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { INTERNAL_AGGREGATE_ROW_CAP } from "../../lib/pagination.js";
import { GRADE_LABELS } from "../../lib/grades.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedReferences,
} from "../../lib/learnerVisibility.js";

/** A month grid can span six weeks; two months of padding is plenty. */
const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

export interface NurseCalendarContext {
  userId: string;
  termId: string | null;
}

/** What an event on the nurse calendar is. */
export type NurseCalendarTrack = "clinic" | "adm" | "adm_meeting";

export interface NurseCalendarEvent {
  id: string;
  track: NurseCalendarTrack;
  learner: string;
  lrn: string;
  /** Display label ("Grade 11"), so the drawer card needs no extra lookup. */
  grade: string;
  section: string;
  /** Stored sprite mascot, so the card matches every other desk surface. */
  mascot: string | null;
  sessionType: string;
  /** ISO instant — the client renders it in the browser's local time. */
  start: string;
  venue: string;
  status: string;
  outcome: string;
  referralId: string | null;
  interventionId: string | null;
  admProfileId: string | null;
  /** Parent meetings only: is this nurse one of the booking's invitees? */
  invited: boolean | null;
  /**
   * False once the booking can no longer move: the session is done/cancelled,
   * its case is resolved/dismissed or the ADM consultation was endorsed (the
   * case is with the coordinator). Mirrors the server-side guards.
   */
  reschedulable: boolean;
}

export interface NurseCalendarQuery {
  from: string;
  to: string;
  status: "all" | "scheduled";
}

export interface NurseCalendarData {
  range: { from: string; to: string };
  status: NurseCalendarQuery["status"];
  counts: Record<NurseCalendarTrack, number>;
  events: NurseCalendarEvent[];
}

/** ADM meetings may only move before the case is certified. */
const PRE_CERT_STAGES = new Set(["anecdotal", "consultation", "meeting_parents"]);

/** Only a booked session on a live, unendorsed case can still be moved. */
function sessionReschedulable(
  status: string,
  referral: {
    status: string;
    consultReviewedAt: Date | null;
    admProfiles: { approvedBy: string | null }[];
  } | null,
): boolean {
  if (status !== "scheduled" || !referral) return false;
  if (referral.status === "resolved" || referral.status === "dismissed") return false;
  if (referral.consultReviewedAt) return false;
  return referral.admProfiles.every((profile) => !profile.approvedBy);
}

const STUDENT_SELECT = {
  lrn: true,
  gradeLevel: true,
  mascot: true,
  user: { select: { fullName: true } },
  section: { select: { name: true } },
} as const;

const ROSTER_SELECT = {
  lrn: true,
  gradeLevel: true,
  fullName: true,
  mascot: true,
  section: { select: { name: true } },
} as const;

type LearnerHolder = {
  student?: {
    lrn: string;
    gradeLevel: string;
    mascot: string | null;
    user: { fullName: string } | null;
    section: { name: string } | null;
  } | null;
  roster?: {
    lrn: string;
    gradeLevel: string;
    fullName: string;
    mascot: string | null;
    section: { name: string } | null;
  } | null;
};

/** The nurse desk scope, mirrored from `listQueue` in `queues.desk.service.ts`. */
const NURSE_REFERRAL_SCOPE = {
  OR: [
    { referredToRole: "nurse" as const },
    { status: "escalated" as const, escalatedTo: "nurse" },
    { referredToRole: "adm_coordinator" as const, consultReviewer: "nurse" },
  ],
} as const;

/**
 * Learners an adviser removed from their advisory list are hidden from every
 * desk board; the nurse calendar honours the same null-safe archive filter
 * (a roster-only row must not be dropped because its studentId is NULL).
 */
const SESSION_LEARNER_REFS = [{ relation: "referral", fk: "referralId" }] as const;

const MEETING_LEARNER_REFS = [
  { relation: "referral", fk: "referralId" },
  { relation: "admLearnerProfile", fk: "admLearnerProfileId", roster: false, studentNullable: false },
] as const;

function learnerOf(holder: LearnerHolder | null | undefined) {
  return {
    learner: holder?.student?.user?.fullName ?? holder?.roster?.fullName ?? "Unknown learner",
    lrn: holder?.student?.lrn ?? holder?.roster?.lrn ?? "",
    grade:
      GRADE_LABELS[holder?.student?.gradeLevel ?? holder?.roster?.gradeLevel ?? ""] ?? "",
    section: holder?.student?.section?.name ?? holder?.roster?.section?.name ?? "",
    mascot: holder?.student?.mascot ?? holder?.roster?.mascot ?? null,
  };
}

/**
 * Everything the clinic desk has booked in one date window: counseling
 * sessions on referrals on the nurse desk (clinic matters and the ADM
 * consultations the nurse reviews) plus ADM parent meetings the nurse is
 * invited to or that belong to a case on the nurse desk.
 *
 * The window is sent as ISO instants so the browser's local month/week
 * boundary is respected; the desk stays term-scoped server-side like every
 * other nurse read.
 */
export async function getNurseCalendar(
  ctx: NurseCalendarContext,
  query: NurseCalendarQuery,
): Promise<NurseCalendarData> {
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (
    !query.from ||
    !query.to ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime())
  ) {
    throw new AppError(400, "INVALID_RANGE", "Pick a valid date range.");
  }
  if (from.getTime() > to.getTime()) {
    throw new AppError(400, "INVALID_RANGE", "The range ends before it starts.");
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new AppError(400, "INVALID_RANGE", "Pick a range of at most two months.");
  }

  const scheduledOnly = query.status !== "all";
  const archived = await archivedAdvisoryLearnerIds();

  const sessionWhere: any = {
    AND: [
      { scheduledAt: { gte: from, lte: to } },
      ...(scheduledOnly ? [{ status: "scheduled" }] : []),
      ...(ctx.termId ? [{ referral: { termId: ctx.termId } }] : []),
      { referral: { OR: NURSE_REFERRAL_SCOPE.OR } },
      excludeArchivedReferences(archived, SESSION_LEARNER_REFS),
    ],
  };

  const meetingWhere: any = {
    AND: [
      { meetingDatetime: { gte: from, lte: to } },
      ...(scheduledOnly ? [{ attended: false }] : []),
      ...(ctx.termId
        ? [
            {
              OR: [
                { referral: { termId: ctx.termId } },
                { admLearnerProfile: { termId: ctx.termId } },
              ],
            },
          ]
        : []),
      {
        OR: [
          { referral: { OR: NURSE_REFERRAL_SCOPE.OR } },
          { admLearnerProfile: { referral: { OR: NURSE_REFERRAL_SCOPE.OR } } },
          { invitees: { some: { userId: ctx.userId } } },
        ],
      },
      excludeArchivedReferences(archived, MEETING_LEARNER_REFS),
    ],
  };

  const [sessions, meetings] = await Promise.all([
    prisma.counselingSession.findMany({
      where: sessionWhere,
      orderBy: { scheduledAt: "asc" },
      take: INTERNAL_AGGREGATE_ROW_CAP,
      select: {
        id: true,
        sessionType: true,
        scheduledAt: true,
        venue: true,
        status: true,
        outcome: true,
        referral: {
          select: {
            id: true,
            referredToRole: true,
            escalatedTo: true,
            status: true,
            consultReviewedAt: true,
            admProfiles: { select: { approvedBy: true } },
            student: { select: STUDENT_SELECT },
            roster: { select: ROSTER_SELECT },
          },
        },
      },
    }),
    prisma.admParentMeeting.findMany({
      where: meetingWhere,
      orderBy: { meetingDatetime: "asc" },
      take: INTERNAL_AGGREGATE_ROW_CAP,
      select: {
        id: true,
        meetingDatetime: true,
        venue: true,
        attended: true,
        referral: {
          select: {
            id: true,
            status: true,
            consultReviewer: true,
            student: { select: STUDENT_SELECT },
            roster: { select: ROSTER_SELECT },
          },
        },
        admLearnerProfile: {
          select: {
            id: true,
            approvedBy: true,
            stage: true,
            student: { select: STUDENT_SELECT },
            referral: { select: { id: true, status: true, consultReviewer: true } },
          },
        },
        invitees: { select: { userId: true } },
      },
    }),
  ]);

  const events: NurseCalendarEvent[] = [];

  for (const s of sessions) {
    if (!s.referral) continue;
    const adm =
      s.referral.referredToRole === "adm_coordinator" ||
      s.referral.escalatedTo === "adm_coordinator";
    events.push({
      id: `session:${s.id}`,
      track: adm ? "adm" : "clinic",
      ...learnerOf(s.referral),
      sessionType: s.sessionType,
      start: s.scheduledAt.toISOString(),
      venue: s.venue ?? "",
      status: s.status,
      outcome: s.outcome ?? "",
      referralId: s.referral.id,
      interventionId: null,
      admProfileId: null,
      invited: null,
      reschedulable: sessionReschedulable(s.status, s.referral),
    });
  }

  for (const m of meetings) {
    const holder = m.referral ?? m.admLearnerProfile;
    if (!holder) continue;
    const ref = m.referral ?? m.admLearnerProfile?.referral ?? null;
    const profile = m.admLearnerProfile;
    const underReview =
      ref?.status === "pending" &&
      (ref.consultReviewer === "nurse" ||
        ref.consultReviewer === "guidance_counselor");
    events.push({
      id: `meeting:${m.id}`,
      track: "adm_meeting",
      ...learnerOf(holder),
      sessionType: "parent_conference",
      start: m.meetingDatetime.toISOString(),
      venue: m.venue ?? "",
      status: m.attended ? "completed" : "scheduled",
      outcome: "",
      referralId: m.referral?.id ?? m.admLearnerProfile?.referral?.id ?? null,
      interventionId: null,
      admProfileId: m.admLearnerProfile?.id ?? null,
      invited: m.invitees.some((i) => i.userId === ctx.userId),
      reschedulable:
        !m.attended &&
        (!ref || (ref.status !== "resolved" && ref.status !== "dismissed")) &&
        !underReview &&
        (!profile ||
          (!profile.approvedBy && PRE_CERT_STAGES.has(profile.stage))),
    });
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const counts: Record<NurseCalendarTrack, number> = {
    clinic: 0,
    adm: 0,
    adm_meeting: 0,
  };
  for (const event of events) counts[event.track] += 1;

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    status: query.status,
    counts,
    events,
  };
}
