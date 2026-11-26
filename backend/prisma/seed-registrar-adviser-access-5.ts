import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

/**
 * Five pending adviser SF10 access requests for the registrar adviser-access
 * desk (/registrar/adviser-access), band G11–G12 — enough to fill the request
 * strip and the workbench with different states:
 *
 *   1. Grade 11 - STEM (Rizal)      · unchecked, 3 learners (1 attached)
 *   2. Grade 12 - ABM (Bonifacio)   · checked, 1 granted + 1 reported missing
 *   3. Grade 11 - HUMSS (Mabini)    · unchecked, 3 learners (1 attached)
 *   4. Grade 12 - STEM (Del Pilar)  · checked, 1 of 3 granted
 *   5. Grade 12 - HUMSS (Silang)    · unchecked, 2 learners (none attached)
 *
 * Sections 3–5 are seeded here (roster-only learners under the second adviser)
 * so the five cards don't all repeat the same section. SF10 rows are filed for
 * the learners the "attached" counters read (desk = registrar).
 *
 * Idempotent — sections by (name, school year), roster by (LRN, school year),
 * SF10 by (LRN, desk), requests by adviser + section + reason. Safe to re-run.
 *
 * Run: npm run prisma:seed:registrar-adviser-access-5
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

type RosterLearner = { lrn: string; fullName: string; gradeLevel: "G11" | "G12" };

const NEW_SECTIONS: {
  name: string;
  gradeLevel: "G11" | "G12";
  learners: RosterLearner[];
}[] = [
  {
    name: "Grade 11 - HUMSS (Mabini)",
    gradeLevel: "G11",
    learners: [
      { lrn: "136140000001", fullName: "Angela Mae Bautista", gradeLevel: "G11" },
      { lrn: "136140000002", fullName: "Kier Aldrin Mercado", gradeLevel: "G11" },
      { lrn: "136140000003", fullName: "Trisha Nicole Lim", gradeLevel: "G11" },
    ],
  },
  {
    name: "Grade 12 - STEM (Del Pilar)",
    gradeLevel: "G12",
    learners: [
      { lrn: "136140000004", fullName: "Marco Luis Tan", gradeLevel: "G12" },
      { lrn: "136140000005", fullName: "Bianca Rose Villamor", gradeLevel: "G12" },
      { lrn: "136140000006", fullName: "Jayson Rey Ocampo", gradeLevel: "G12" },
    ],
  },
  {
    name: "Grade 12 - HUMSS (Silang)",
    gradeLevel: "G12",
    learners: [
      { lrn: "136140000007", fullName: "Precious Ann Delos Reyes", gradeLevel: "G12" },
      { lrn: "136140000008", fullName: "Gabriel A. Soriano", gradeLevel: "G12" },
    ],
  },
];

/** SF10 rows that make a learner count as "attached" on the desk. */
const SF10_ATTACHED = [
  { lrn: "136130000001", learnerName: "Hannah Grace Dizon", gradeLevel: "G11" as const },
  { lrn: "136130000004", learnerName: "Daniel James Fernandez", gradeLevel: "G12" as const },
  { lrn: "136140000001", learnerName: "Angela Mae Bautista", gradeLevel: "G11" as const },
  { lrn: "136140000004", learnerName: "Marco Luis Tan", gradeLevel: "G12" as const },
];

async function ensureSection(
  name: string,
  gradeLevel: "G11" | "G12",
  schoolYearId: string,
  adviserId: string,
) {
  const existing = await prisma.section.findFirst({
    where: { name, schoolYearId },
    select: { id: true },
  });
  if (existing) {
    await prisma.section.update({ where: { id: existing.id }, data: { adviserId } });
    return existing.id;
  }
  const created = await prisma.section.create({
    data: { name, gradeLevel, schoolYearId, adviserId },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const schoolYear = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!schoolYear) throw new Error("No active school year — run the roles seed first.");

  const [rowena, marilou, registrar] = await Promise.all([
    prisma.user.findFirst({ where: { email: "rowena.bautista@zentra.test" }, select: { id: true } }),
    prisma.user.findFirst({ where: { email: "adviser@zentra.test" }, select: { id: true } }),
    prisma.user.findFirst({ where: { role: "registrar", status: "active" }, select: { id: true } }),
  ]);
  if (!rowena) throw new Error("Rowena Bautista not found — run the registrar demo seed first.");
  if (!marilou) throw new Error("adviser@zentra.test not found — run the roles seed first.");

  // ---- Companion sections + roster-only learners --------------------------
  const sectionIds = new Map<string, string>();
  for (const def of NEW_SECTIONS) {
    const sectionId = await ensureSection(def.name, def.gradeLevel, schoolYear.id, marilou.id);
    sectionIds.set(def.name, sectionId);
    for (const l of def.learners) {
      await prisma.studentRoster.upsert({
        where: { lrn_schoolYearId: { lrn: l.lrn, schoolYearId: schoolYear.id } },
        update: { fullName: l.fullName, gradeLevel: l.gradeLevel, sectionId },
        create: {
          lrn: l.lrn,
          fullName: l.fullName,
          gradeLevel: l.gradeLevel,
          sectionId,
          schoolYearId: schoolYear.id,
        },
      });
    }
  }

  // ---- SF10 rows the "attached" counters read -----------------------------
  for (const rec of SF10_ATTACHED) {
    await prisma.sf10Record.upsert({
      where: { lrn_desk: { lrn: rec.lrn, desk: "registrar" } },
      update: { status: "available", learnerName: rec.learnerName, gradeLevel: rec.gradeLevel },
      create: {
        lrn: rec.lrn,
        learnerName: rec.learnerName,
        gradeLevel: rec.gradeLevel,
        desk: "registrar",
        source: "manual",
        status: "available",
        uploadedFileUrl: `https://example.test/sf10/${rec.lrn}.pdf`,
        uploadedAt: daysAgo(20),
      },
    });
  }

  // ---- The five requests --------------------------------------------------
  const rizal = await prisma.section.findFirst({
    where: { name: "Grade 11 - STEM (Rizal)" },
    select: { id: true },
  });
  const abm = await prisma.section.findFirst({
    where: { name: "Grade 12 - ABM (Bonifacio)" },
    select: { id: true },
  });
  if (!rizal) throw new Error("Grade 11 - STEM (Rizal) not found — run the registrar demo seed first.");
  if (!abm) throw new Error("Grade 12 - ABM (Bonifacio) not found — run the registrar demo seed first.");

  const now = new Date();
  const requests: {
    adviserId: string;
    sectionId: string;
    gradeLevel: "G11" | "G12";
    reason: string;
    requestedLrns: string[];
    requestedAt: Date;
    checked: boolean;
    approvedLrns?: string[];
    reportedMissingLrns?: string[];
  }[] = [
    {
      adviserId: rowena.id,
      sectionId: rizal.id,
      gradeLevel: "G11",
      reason: "Advisory SF10 review — 3rd term grades (registrar demo)",
      requestedLrns: ["136130000001", "136130000002", "136130000003"],
      requestedAt: daysAgo(1),
      checked: false,
    },
    {
      adviserId: rowena.id,
      sectionId: abm.id,
      gradeLevel: "G12",
      reason: "Learner records for advisory monitoring (registrar demo)",
      requestedLrns: ["136130000004", "136130000005"],
      requestedAt: daysAgo(2),
      checked: true,
      approvedLrns: ["136130000004"],
      reportedMissingLrns: ["136130000005"],
    },
    {
      adviserId: marilou.id,
      sectionId: sectionIds.get("Grade 11 - HUMSS (Mabini)")!,
      gradeLevel: "G11",
      reason: "Transfer-in credential check for three advisees (registrar demo)",
      requestedLrns: ["136140000001", "136140000002", "136140000003"],
      requestedAt: daysAgo(0.25),
      checked: false,
    },
    {
      adviserId: marilou.id,
      sectionId: sectionIds.get("Grade 12 - STEM (Del Pilar)")!,
      gradeLevel: "G12",
      reason: "Scholarship endorsement — SF10 copy needed (registrar demo)",
      requestedLrns: ["136140000004", "136140000005", "136140000006"],
      requestedAt: daysAgo(3),
      checked: true,
      approvedLrns: ["136140000004"],
    },
    {
      adviserId: marilou.id,
      sectionId: sectionIds.get("Grade 12 - HUMSS (Silang)")!,
      gradeLevel: "G12",
      reason: "Advisory exit interview records (registrar demo)",
      requestedLrns: ["136140000007", "136140000008"],
      requestedAt: daysAgo(0.5),
      checked: false,
    },
  ];

  for (const r of requests) {
    const approvedLrns = r.approvedLrns ?? [];
    const reportedMissingLrns = r.reportedMissingLrns ?? [];
    const data = {
      gradeLevel: r.gradeLevel,
      status: "pending" as const,
      requestedLrns: r.requestedLrns,
      requestedAt: r.requestedAt,
      checkedAt: r.checked ? daysAgo(0.5) : null,
      checkedBy: r.checked ? registrar?.id ?? null : null,
      checkSummary: r.checked
        ? {
            total: r.requestedLrns.length,
            has: r.requestedLrns.length - reportedMissingLrns.length,
            missing: reportedMissingLrns.length,
            at: daysAgo(0.5).toISOString(),
          }
        : undefined,
      approvedLrns,
      approvedLrnAt: approvedLrns.length
        ? Object.fromEntries(approvedLrns.map((l) => [l, now.toISOString()]))
        : undefined,
      reportedMissingLrns,
      reportedLrnAt: reportedMissingLrns.length
        ? Object.fromEntries(reportedMissingLrns.map((l) => [l, now.toISOString()]))
        : undefined,
      decidedAt: null,
      decidedBy: null,
      decisionReason: null,
    };

    const existing = await prisma.adviserSf10AccessRequest.findFirst({
      where: { adviserId: r.adviserId, sectionId: r.sectionId, reason: r.reason },
      select: { id: true },
    });
    if (existing) {
      await prisma.adviserSf10AccessRequest.update({ where: { id: existing.id }, data });
    } else {
      await prisma.adviserSf10AccessRequest.create({
        data: { adviserId: r.adviserId, sectionId: r.sectionId, reason: r.reason, ...data },
      });
    }
  }

  const pending = await prisma.adviserSf10AccessRequest.count({
    where: { gradeLevel: { in: ["G11", "G12"] }, status: "pending" },
  });
  console.log(`\nDone — ${pending} pending request(s) in band G11–G12.`);
  console.log("Refresh /registrar/adviser-access (the list cache clears within ~30s).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
