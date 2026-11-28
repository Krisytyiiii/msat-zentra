import { randomInt } from "node:crypto";
import { prisma } from "../../lib/prisma.js";

/**
 * School-issued learner link codes.
 *
 * Mirror of `adviserCode.ts` / `TeacherName.code`: a short, human-readable token
 * staff hand to the learner's family out of band. It is NOT an identity — the
 * hosted roster row is the truth, and the code only lets an approved account
 * claim/confirm that row (or a guardian request a link to it).
 */
export const LEARNER_CODE_PREFIX = "LNK-";

// No I, O, 0, 1 — read over the phone or copied off a printed slip.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function mintLearnerCode(): string {
  let suffix = "";
  for (let i = 0; i < 5; i += 1) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `${LEARNER_CODE_PREFIX}${suffix}`;
}

export function normalizeLearnerCode(code: string | null | undefined): string {
  return String(code ?? "").trim().toUpperCase();
}

export function matchesLearnerCode(
  storedCode: string | null | undefined,
  enteredCode: string | null | undefined,
): boolean {
  const stored = normalizeLearnerCode(storedCode);
  const entered = normalizeLearnerCode(enteredCode);
  if (!stored || !entered) return false;
  return stored === entered;
}

/**
 * Mint a code that is not already used by another roster row. The unique index
 * is the real guarantee; this only avoids the obvious collision so a request
 * does not fail on a retryable P2002.
 */
export async function mintUniqueLearnerLinkCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = mintLearnerCode();
    const clash = await prisma.studentRoster.findUnique({
      where: { linkCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error("Could not mint a unique learner link code");
}
