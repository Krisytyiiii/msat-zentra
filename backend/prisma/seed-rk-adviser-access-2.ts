import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

/**
 * Two pending adviser SF10 access requests for the record-keeper
 * adviser-access desk (/record-keeper/adviser-access), band G7–G10.
 *
 *   Request A (new) — 4 picked advisees, never checked → "Pending checking".
 *   Request B (reuses an existing pending demo request when one is present,
 *             otherwise creates it) — 3 picked advisees, already checked
 *             (1 attached, 2 missing) with one per-student grant and one
 *             "report missing" mark → awaiting / approved / reported cards.
 *
 * Also files the SF10 row the check verdict depends on (desk record_keeper).
 * Idempotent: requests keyed by adviser + section + reason, SF10 by
 * (studentId, desk). Safe to re-run.
 *
 * Run: npm run prisma:seed:rk-adviser-access-2
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const REASON_A = "Advisory SF10 review — 3rd term grades (demo seed)";
const REASON_B = "Learner records for advisory monitoring (demo seed)";
const BAND = ["G7", "G8", "G9", "G10"] as const;

type Advisee = { lrn: string; name: string };

async function main() {
  const section = await prisma.section.findFirst({
    where: { gradeLevel: { in: [...BAND] }, adviserId: { not: null } },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
    select: { id: true, name: true, gradeLevel: true, adviserId: true },
  });
  if (!section?.adviserId) {
    throw new Error("No G7–G10 section with an adviser — run the school seed first.");
  }
  const sectionId = section.id;
  const adviserId = section.adviserId;
  const gradeLevel = section.gradeLevel as (typeof BAND)[number];

  const [profiles, rosters] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { sectionId },
      orderBy: { lrn: "asc" },
      select: { lrn: true, user: { select: { fullName: true } } },
    }),
    prisma.studentRoster.findMany({
      where: { sectionId },
      orderBy: { lrn: "asc" },
      select: { lrn: true, fullName: true },
    }),
  ]);
  const advisees: Advisee[] = [];
  const seen = new Set<string>();
  for (const p of profiles) {
    if (seen.has(p.lrn)) continue;
    seen.add(p.lrn);
    advisees.push({ lrn: p.lrn, name: p.user.fullName });
  }
  for (const r of rosters) {
    if (seen.has(r.lrn)) continue;
    seen.add(r.lrn);
    advisees.push({ lrn: r.lrn, name: r.fullName });
  }
  if (advisees.length < 4) {
    throw new Error(`Section ${section.name} has only ${advisees.length} advisees — need at least 4.`);
  }
  const registered = profiles.length > 0 ? profiles[0].lrn : null;

  const recordKeeper = await prisma.user.findFirst({
    where: { role: "record_keeper", status: "active" },
    select: { id: true },
  });

  // ---- Request A: 4 picked advisees, unchecked ----------------------------
  const pickedA = advisees.slice(0, 4).map((a) => a.lrn);
  const existingA = await prisma.adviserSf10AccessRequest.findFirst({
    where: { adviserId, sectionId, reason: REASON_A },
    select: { id: true },
  });
  const dataA = {
    status: "pending" as const,
    gradeLevel,
    requestedLrns: pickedA,
    requestedAt: new Date(),
    checkedAt: null,
    checkedBy: null,
    checkSummary: undefined,
    approvedLrns: [] as string[],
    approvedLrnAt: undefined,
    reportedMissingLrns: [] as string[],
    reportedLrnAt: undefined,
    decidedAt: null,
    decidedBy: null,
    decisionReason: null,
  };
  const idA = existingA
    ? (
        await prisma.adviserSf10AccessRequest.update({
          where: { id: existingA.id },
          data: dataA,
          select: { id: true },
        })
      ).id
    : (
        await prisma.adviserSf10AccessRequest.create({
          data: { adviserId, sectionId, reason: REASON_A, ...dataA },
          select: { id: true },
        })
      ).id;
  console.log(`request A ready: ${idA} · ${section.name} (${gradeLevel}) · ${pickedA.length} picked · unchecked`);

  // ---- Request B: reuses a pre-existing pending request when present ------
  const pickedB = advisees.slice(0, 3);
  const matchedLrn = registered && pickedB.some((p) => p.lrn === registered) ? registered : pickedB[0].lrn;
  const missingLrns = pickedB.map((p) => p.lrn).filter((l) => l !== matchedLrn);

  // File the SF10 row the check verdict reads (only registered profiles can
  // own one; roster-only advisees stay missing).
  if (registered) {
    const profile = await prisma.studentProfile.findFirst({
      where: { lrn: registered },
      select: { userId: true },
    });
    if (profile) {
      await prisma.sf10Record.upsert({
        where: { studentId_desk: { studentId: profile.userId, desk: "record_keeper" } },
        update: { status: "available", source: "manual", uploadedFileUrl: "https://example.test/sf10/demo.pdf" },
        create: {
          studentId: profile.userId,
          desk: "record_keeper",
          source: "manual",
          status: "available",
          uploadedFileUrl: "https://example.test/sf10/demo.pdf",
          uploadedAt: new Date(),
        },
      });
    }
  }

  const existingB =
    (await prisma.adviserSf10AccessRequest.findFirst({
      where: { adviserId, sectionId, status: "pending", reason: { not: REASON_A } },
      orderBy: { requestedAt: "desc" },
      select: { id: true },
    })) ??
    (await prisma.adviserSf10AccessRequest.findFirst({
      where: { adviserId, sectionId, reason: REASON_B },
      select: { id: true },
    }));
  const now = new Date();
  const dataB = {
    status: "pending" as const,
    gradeLevel,
    requestedLrns: pickedB.map((p) => p.lrn),
    requestedAt: now,
    checkedAt: now,
    checkedBy: recordKeeper?.id ?? null,
    checkSummary: { total: pickedB.length, has: 1, missing: pickedB.length - 1, at: now.toISOString() },
    approvedLrns: [matchedLrn],
    approvedLrnAt: { [matchedLrn]: now.toISOString() },
    reportedMissingLrns: missingLrns,
    reportedLrnAt: Object.fromEntries(missingLrns.map((l) => [l, now.toISOString()])),
    decidedAt: null,
    decidedBy: null,
    decisionReason: null,
  };
  const idB = existingB
    ? (
        await prisma.adviserSf10AccessRequest.update({
          where: { id: existingB.id },
          data: dataB,
          select: { id: true },
        })
      ).id
    : (
        await prisma.adviserSf10AccessRequest.create({
          data: { adviserId, sectionId, reason: REASON_B, ...dataB },
          select: { id: true },
        })
      ).id;
  console.log(
    `request B ready: ${idB} · ${section.name} (${gradeLevel}) · ${pickedB.length} picked · 1 attached · 1 granted · ${missingLrns.length} reported missing`,
  );

  const pending = await prisma.adviserSf10AccessRequest.count({
    where: { gradeLevel: { in: [...BAND] }, status: "pending" },
  });
  console.log(`\nDone — ${pending} pending request(s) in band G7–G10. Refresh /record-keeper/adviser-access.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
