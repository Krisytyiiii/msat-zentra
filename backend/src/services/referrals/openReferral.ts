import { prisma } from "../../lib/prisma.js";

type ReferralDesk = "nurse" | "guidance_counselor" | "adm_coordinator" | "principal";

export interface OpenReferralCandidate {
  id: string;
  status: string;
  referredToRole: ReferralDesk;
  /** Completed / scheduled sessions close a clinic or guidance case. */
  counselingSessions: { status: string }[];
  /** Newest ADM case attached to the referral, if any. */
  admProfiles: { stage: string }[];
}

/**
 * A case counts as finished even when its referral row was never flipped to
 * `resolved`:
 *  - the clinic/guidance desks derive "Done" from a completed session with no
 *    new one booked (the referral stays `in_progress` on older rows);
 *  - an ADM case is done once it reaches the `completion` stage.
 * The adviser board renders exactly this, so the duplicate-referral guard has
 * to agree — otherwise a learner shown as "Done" (or a finished ADM case)
 * keeps blocking a fresh referral.
 */
export function isReferralEffectivelyDone(
  referral: OpenReferralCandidate,
): boolean {
  if (referral.status === "resolved" || referral.status === "dismissed") {
    return true;
  }
  if (referral.referredToRole === "adm_coordinator") {
    return referral.admProfiles[0]?.stage === "completion";
  }
  const onCounselingDesk =
    referral.referredToRole === "nurse" ||
    referral.referredToRole === "guidance_counselor";
  if (!onCounselingDesk || referral.status === "follow_up") return false;
  const completed = referral.counselingSessions.some(
    (s) => s.status === "completed",
  );
  const scheduled = referral.counselingSessions.some(
    (s) => s.status === "scheduled",
  );
  return completed && !scheduled;
}

/**
 * The one live referral a learner may hold per desk and term. The adviser's
 * referrals board is term-scoped, so the guard is too: a case left open in an
 * earlier term is no longer visible to the teacher or to the desk (their
 * queues are term-scoped as well) and must not block this term's referral.
 */
export async function findBlockingOpenReferral(input: {
  referredToRole: ReferralDesk;
  termId: string;
  studentId?: string | null;
  rosterId?: string | null;
  excludeId?: string;
}): Promise<{ id: string } | null> {
  const candidates = await prisma.referral.findMany({
    where: {
      referredToRole: input.referredToRole,
      termId: input.termId,
      status: { notIn: ["dismissed", "resolved"] },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      ...(input.studentId
        ? { studentId: input.studentId }
        : { rosterId: input.rosterId }),
    },
    select: {
      id: true,
      status: true,
      referredToRole: true,
      counselingSessions: { select: { status: true } },
      admProfiles: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { stage: true },
      },
    },
  });
  const blocking = candidates.find((r) => !isReferralEffectivelyDone(r));
  return blocking ? { id: blocking.id } : null;
}
