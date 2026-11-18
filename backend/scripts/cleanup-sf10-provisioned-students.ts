/**
 * One-off cleanup: list (and optionally delete) student accounts that the OLD
 * SF10 upload flow provisioned from a file — `<lrn>@sf10-provisioned.local`.
 *
 * `uploadAuto` no longer creates learners (the LRN must match an existing
 * profile), so these rows are leftovers. Each one is a real `StudentProfile`
 * (and would show up in student lists), but most hold nothing but the SF10
 * file that created them.
 *
 * Dry-run by default:
 *   npx tsx scripts/cleanup-sf10-provisioned-students.ts
 * Delete only the empty shells (no grades/attendance/records/etc.):
 *   npx tsx scripts/cleanup-sf10-provisioned-students.ts --apply
 * Also delete the ones that already carry data (destructive — cascades):
 *   npx tsx scripts/cleanup-sf10-provisioned-students.ts --apply --include-with-data
 * Save the report as JSON:
 *   npx tsx scripts/cleanup-sf10-provisioned-students.ts --out qa-output/sf10-provisioned.json
 *
 * A learner that still has a matching `StudentRoster` row (enlisted) is kept
 * unless `--include-with-data` is passed: deleting the account would orphan
 * their enlistment code path, so that is a deliberate choice, not a default.
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

const APPLY = process.argv.includes("--apply");
const INCLUDE_WITH_DATA = process.argv.includes("--include-with-data");
const OUT_FLAG = process.argv.indexOf("--out");
const OUT_PATH = OUT_FLAG >= 0 ? process.argv[OUT_FLAG + 1] : null;

const PROVISIONED_SUFFIX = "@sf10-provisioned.local";

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const COUNTED = {
  studentGrades: true,
  finalGrades: true,
  attendanceRecords: true,
  anecdotalRecords: true,
  referrals: true,
  interventions: true,
  riskSnapshots: true,
  sf10Records: true,
  healthRecords: true,
  homeVisitations: true,
  admProfiles: true,
  gradeFlags: true,
  parentLinks: true,
  advisoryModuleSubmissions: true,
} as const;

interface Row {
  userId: string;
  lrn: string;
  fullName: string;
  gradeLevel: string;
  sectioned: boolean;
  roster: boolean;
  counts: Record<string, number>;
  dataTotal: number;
  verdict: "empty" | "has-data";
}

async function main() {
  const profiles = await prisma.studentProfile.findMany({
    where: { user: { email: { endsWith: PROVISIONED_SUFFIX }, role: "student" } },
    select: {
      userId: true,
      lrn: true,
      gradeLevel: true,
      sectionId: true,
      createdAt: true,
      user: { select: { fullName: true, email: true, status: true } },
      _count: { select: COUNTED },
    },
    orderBy: [{ gradeLevel: "asc" }, { lrn: "asc" }],
  });

  if (profiles.length === 0) {
    console.log(`No ${PROVISIONED_SUFFIX} learners found. Nothing to clean.`);
    return;
  }

  const lrns = profiles.map((p) => p.lrn);
  const rosters = await prisma.studentRoster.findMany({
    where: { lrn: { in: lrns } },
    select: { lrn: true },
  });
  const rosterLrns = new Set(rosters.map((r) => r.lrn));

  const rows: Row[] = profiles.map((p) => {
    const counts: Record<string, number> = {};
    let dataTotal = 0;
    for (const key of Object.keys(COUNTED) as Array<keyof typeof COUNTED>) {
      const n = p._count[key] ?? 0;
      if (n > 0) counts[key] = n;
      dataTotal += n;
    }
    const sectioned = !!p.sectionId;
    if (sectioned) dataTotal += 1;
    return {
      userId: p.userId,
      lrn: p.lrn,
      fullName: p.user.fullName,
      gradeLevel: String(p.gradeLevel),
      sectioned,
      roster: rosterLrns.has(p.lrn),
      counts,
      dataTotal,
      verdict: dataTotal === 0 && !rosterLrns.has(p.lrn) ? "empty" : "has-data",
    };
  });

  const empty = rows.filter((r) => r.verdict === "empty");
  const withData = rows.filter((r) => r.verdict === "has-data");

  console.log(`${rows.length} SF10-provisioned learner account(s) found:\n`);
  for (const r of rows) {
    const bits = Object.entries(r.counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    const flags = [r.sectioned ? "sectioned" : "", r.roster ? "on-roster" : ""]
      .filter(Boolean)
      .join(" ");
    console.log(
      `  ${r.lrn}  ${r.gradeLevel.padEnd(4)}  ${r.verdict === "empty" ? "empty        " : "HAS DATA     "}` +
        `  ${r.fullName}` +
        (flags ? `  [${flags}]` : "") +
        (bits ? `  (${bits})` : ""),
    );
  }

  const targets = INCLUDE_WITH_DATA ? rows : empty;
  console.log(
    `\n${empty.length} empty shell(s), ${withData.length} with data/roster.` +
      `\n${INCLUDE_WITH_DATA ? "Including learners with data (--include-with-data)." : "Learners with data or a roster row are kept."}`,
  );

  if (!APPLY) {
    console.log(
      `\nDry run. ${targets.length} account(s) would be deleted` +
        ` (cascades to their profile, SF10 file record(s) and any other rows).` +
        `\nRe-run with --apply to delete.`,
    );
    await saveReport(rows, targets, "dry-run");
    return;
  }

  let deleted = 0;
  const failures: Array<{ lrn: string; error: string }> = [];
  for (const r of targets) {
    try {
      await prisma.user.delete({ where: { id: r.userId } });
      deleted += 1;
      console.log(`  deleted ${r.lrn}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push({ lrn: r.lrn, error: message });
      console.error(`  FAILED  ${r.lrn}: ${message}`);
    }
  }

  console.log(`\nDone. Deleted ${deleted} account(s).`);
  if (failures.length > 0) {
    console.log(`${failures.length} could not be deleted — see messages above.`);
    process.exitCode = 1;
  }
  await saveReport(rows, targets, "applied");
}

async function saveReport(rows: Row[], targets: Row[], mode: string) {
  if (!OUT_PATH) return;
  const payload = {
    generatedAt: new Date().toISOString(),
    mode,
    suffix: PROVISIONED_SUFFIX,
    found: rows.length,
    targets: targets.map((r) => r.lrn),
    learners: rows.map(({ userId, ...rest }) => ({ ...rest, userId })),
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Report written to ${OUT_PATH}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
