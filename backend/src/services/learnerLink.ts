import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { writeAudit } from "../lib/audit.js";
import { fanoutNotification } from "../lib/notify.js";
import { invalidateTags } from "../lib/cache.js";
import { bumpRiskCohortVersion } from "../lib/riskCohortCache.js";
import { LEARNER_CODE_PREFIX, normalizeLearnerCode } from "../modules/academics/learnerCode.js";
import type { GradeLevel } from "../generated/prisma/client.js";

// The client is extended (retry-on-read middleware), so the transaction
// callback's client type is not `Prisma.TransactionClient`. Derive the real one.
type AppTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Learner ↔ class linking.
 *
 * The roster row (`StudentRoster`, unique per LRN + school year) is the school's
 * placement truth. A learner account is "placed" when its `StudentProfile`
 * points at a section of the selected school year (or a roster row resolves).
 * Linking is the only operation that copies prior roster-only records onto a
 * newly registered account.
 */

const LINK_TAGS = ["teacher", "roster", "registrar-accounts", "overview", "academics", "principal"];

export interface RosterPlacement {
  sectionId: string;
  gradeLevel: GradeLevel;
}

/**
 * Point `StudentProfile` at the roster's section and carry the roster-only
 * records onto the account.
 *
 * Deliberately re-points EXACTLY the five tables account approval has always
 * moved. `Intervention`, `RiskSnapshot`, `AdvisoryModuleSubmission` and
 * `AdviserArchivedStudent` stay on the roster identity: the roster row remains
 * valid history, and moving submissions can violate
 * `@@unique([moduleId, studentId])`.
 */
export async function linkProfileToRoster(
  tx: AppTx,
  studentId: string,
  lrn: string,
  placement: RosterPlacement,
): Promise<void> {
  await tx.studentProfile.update({
    where: { userId: studentId },
    data: { sectionId: placement.sectionId, gradeLevel: placement.gradeLevel },
  });

  const rosterRows = await tx.studentRoster.findMany({
    where: { lrn },
    select: { id: true },
  });
  const rosterIds = rosterRows.map((r) => r.id);
  if (rosterIds.length === 0) return;

  const carry = { studentId, rosterId: null };
  await tx.studentGrade.updateMany({ where: { rosterId: { in: rosterIds } }, data: carry });
  await tx.finalGrade.updateMany({ where: { rosterId: { in: rosterIds } }, data: carry });
  await tx.attendanceRecord.updateMany({ where: { rosterId: { in: rosterIds } }, data: carry });
  await tx.anecdotalRecord.updateMany({ where: { rosterId: { in: rosterIds } }, data: carry });
  await tx.referral.updateMany({ where: { rosterId: { in: rosterIds } }, data: carry });
}

export type PlacementState = "placed" | "unplaced";

export interface LearnerPlacement {
  state: PlacementState;
  lrn: string | null;
  sectionId: string | null;
  sectionName: string | null;
  hasProfile: boolean;
  hasRosterRow: boolean;
}

/**
 * One derived placement state for a student account in a school year. Used by
 * the portal gate and the staff desks; never throws for a missing profile —
 * "active account, no class yet" is a state, not an error.
 */
export async function placementForStudent(
  studentId: string,
  yearId: string | null,
): Promise<LearnerPlacement> {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { lrn: true } }),
    prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: {
        lrn: true,
        sectionId: true,
        section: { select: { name: true, schoolYearId: true } },
      },
    }),
  ]);

  const lrn = profile?.lrn ?? user?.lrn ?? null;
  const roster =
    lrn && yearId
      ? await prisma.studentRoster.findUnique({
          where: { lrn_schoolYearId: { lrn, schoolYearId: yearId } },
          select: { sectionId: true, section: { select: { name: true } } },
        })
      : null;

  const profilePlaced =
    profile?.sectionId != null &&
    profile.section != null &&
    (yearId == null || profile.section.schoolYearId === yearId);

  if (profilePlaced) {
    return {
      state: "placed",
      lrn,
      sectionId: profile.sectionId,
      sectionName: profile.section?.name ?? null,
      hasProfile: true,
      hasRosterRow: roster != null,
    };
  }
  if (roster) {
    return {
      state: "placed",
      lrn,
      sectionId: roster.sectionId,
      sectionName: roster.section?.name ?? null,
      hasProfile: profile != null,
      hasRosterRow: true,
    };
  }
  return {
    state: "unplaced",
    lrn,
    sectionId: null,
    sectionName: null,
    hasProfile: profile != null,
    hasRosterRow: false,
  };
}

export interface RedeemResult {
  lrn: string;
  sectionId: string;
  sectionName: string;
  alreadyPlaced: boolean;
}

/**
 * Student redemption of a learner link code (`POST /api/student/link`).
 *
 * Guards, in order: known code, not revoked, active school year, the account's
 * LRN matches the code's LRN (a code never rewrites an identity), no other
 * profile owns the LRN, and no conflicting placement in the roster's year.
 */
export async function redeemLearnerCode(userId: string, rawCode: string): Promise<RedeemResult> {
  const raw = normalizeLearnerCode(rawCode);
  if (!raw) throw new AppError(400, "CODE_REQUIRED", "Enter the code from your enrolment slip");
  // Accept a code typed without the LNK- prefix.
  const code = raw.startsWith(LEARNER_CODE_PREFIX) ? raw : `${LEARNER_CODE_PREFIX}${raw}`;

  const roster = await prisma.studentRoster.findUnique({
    where: { linkCode: code },
    select: {
      id: true,
      lrn: true,
      gradeLevel: true,
      sectionId: true,
      schoolYearId: true,
      mascot: true,
      linkCodeRevokedAt: true,
      section: { select: { name: true, adviserId: true } },
      schoolYear: { select: { isActive: true } },
    },
  });
  // Never reveal whether a roster row / LRN exists.
  if (!roster) {
    throw new AppError(404, "CODE_NOT_FOUND", "Check the code on your enrolment slip");
  }
  if (roster.linkCodeRevokedAt) {
    throw new AppError(409, "CODE_REVOKED", "This code was replaced — ask your adviser for the new one");
  }
  if (!roster.schoolYear.isActive) {
    throw new AppError(409, "CODE_EXPIRED", "This code is for a school year that is no longer active");
  }

  const [account, profile, owner] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { lrn: true, fullName: true } }),
    prisma.studentProfile.findUnique({
      where: { userId },
      select: {
        userId: true,
        lrn: true,
        sectionId: true,
        section: { select: { schoolYearId: true } },
      },
    }),
    prisma.studentProfile.findUnique({
      where: { lrn: roster.lrn },
      select: { userId: true },
    }),
  ]);
  if (!account) throw new AppError(404, "USER_NOT_FOUND", "User not found");

  if (account.lrn && account.lrn.trim() !== roster.lrn.trim()) {
    throw new AppError(
      409,
      "CODE_LRN_MISMATCH",
      "This code belongs to a different LRN. Ask your adviser to check your learner record.",
    );
  }
  if (profile && profile.lrn !== roster.lrn) {
    throw new AppError(
      409,
      "CODE_LRN_MISMATCH",
      "This account is already linked under a different LRN. Ask the administrator to correct it.",
    );
  }
  if (owner && owner.userId !== userId) {
    throw new AppError(
      409,
      "LRN_ALREADY_PROVISIONED",
      "This LRN already has a learner account. Ask an administrator to merge the accounts.",
    );
  }

  // Scope is the roster row's school year, never the caller's term headers.
  const placedSameYear =
    profile?.sectionId != null && profile.section?.schoolYearId === roster.schoolYearId;
  if (placedSameYear) {
    if (profile.sectionId === roster.sectionId) {
      return {
        lrn: roster.lrn,
        sectionId: roster.sectionId,
        sectionName: roster.section.name,
        alreadyPlaced: true,
      };
    }
    throw new AppError(
      409,
      "ALREADY_PLACED",
      "You are already placed in another section this school year",
    );
  }

  await prisma.$transaction(async (tx) => {
    if (!account.lrn) {
      await tx.user.update({ where: { id: userId }, data: { lrn: roster.lrn } });
    }
    if (!profile) {
      await tx.studentProfile.create({
        data: {
          userId,
          lrn: roster.lrn,
          gradeLevel: roster.gradeLevel,
          sectionId: roster.sectionId,
          mascot: roster.mascot ?? null,
        },
      });
    }
    await linkProfileToRoster(tx, userId, roster.lrn, {
      sectionId: roster.sectionId,
      gradeLevel: roster.gradeLevel,
    });
  });

  await invalidateTags(LINK_TAGS);
  bumpRiskCohortVersion();
  await writeAudit({
    userId,
    actionType: "update",
    sourceTable: "student_roster",
    sourceId: roster.id,
    reason: `Redeemed link code — placed in ${roster.section.name}`,
  });
  if (roster.section.adviserId) {
    void fanoutNotification({
      userId: roster.section.adviserId,
      sourceTable: "student_roster",
      action: "link",
      sourceId: roster.id,
      message: `${account.fullName} (LRN ${roster.lrn}) linked their account and joined ${roster.section.name}.`,
    }).catch(() => undefined);
  }

  return {
    lrn: roster.lrn,
    sectionId: roster.sectionId,
    sectionName: roster.section.name,
    alreadyPlaced: false,
  };
}
