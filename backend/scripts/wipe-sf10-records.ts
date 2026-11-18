/**
 * Wipe every SF10 record in the system.
 *
 * Deletes `Sf10Record` rows and their version history (`Sf10RecordVersion`,
 * cascade), across both desks (record keeper G7–10 + registrar G11–12). Nothing
 * else is touched: learner accounts, grades, attendance, adviser access
 * requests (they store LRNs, not record ids) and the audit trail stay as-is.
 *
 * The uploaded files in Supabase Storage are NOT removed by default — pass
 * `--purge-storage` to delete the objects their `uploadedFileUrl` points at as
 * well (best-effort; a missing object is ignored).
 *
 * Dry-run by default:
 *   npx tsx scripts/wipe-sf10-records.ts
 * Actually delete:
 *   npx tsx scripts/wipe-sf10-records.ts --apply
 * Delete rows + stored files:
 *   npx tsx scripts/wipe-sf10-records.ts --apply --purge-storage
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

const APPLY = process.argv.includes("--apply");
const PURGE_STORAGE = process.argv.includes("--purge-storage");

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

/** Supabase Storage object key for a stored public URL, or null. */
function objectKeyFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/";
    const i = parsed.pathname.indexOf(marker);
    if (i < 0) return null;
    // `<bucket>/<...key>` — the bucket is the first segment after the marker.
    const rest = parsed.pathname.slice(i + marker.length);
    const slash = rest.indexOf("/");
    return slash < 0 ? null : rest.slice(slash + 1);
  } catch {
    return null;
  }
}

async function main() {
  const records = await prisma.sf10Record.findMany({
    select: {
      id: true,
      desk: true,
      source: true,
      status: true,
      uploadedFileUrl: true,
      student: { select: { lrn: true, user: { select: { fullName: true } } } },
      _count: { select: { versions: true } },
    },
    orderBy: [{ desk: "asc" }, { uploadedAt: "asc" }],
  });

  const byDesk = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.desk] = (acc[r.desk] ?? 0) + 1;
    return acc;
  }, {});
  const versions = records.reduce((n, r) => n + r._count.versions, 0);

  console.log(`SF10 records : ${records.length}`);
  console.log(`Versions     : ${versions}`);
  for (const [desk, n] of Object.entries(byDesk)) console.log(`  ${desk.padEnd(13)} ${n}`);
  console.log("");
  for (const r of records.slice(0, 15)) {
    console.log(
      `  ${r.desk.padEnd(13)} ${String(r.student.lrn).padEnd(14)} ${r.student.user.fullName} — ${r.status}, v${r._count.versions}`,
    );
  }
  if (records.length > 15) console.log(`  … and ${records.length - 15} more`);

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply to wipe these records.");
    return;
  }

  if (PURGE_STORAGE) {
    const { createClient } = await import("@supabase/supabase-js");
    const { getEnv } = await import("../src/config/env.js");
    const { getSf10Bucket } = await import("../src/lib/storage.js");
    const env = getEnv();
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY,
    );
    const bucket = getSf10Bucket();
    const keys = records
      .map((r) => objectKeyFromUrl(r.uploadedFileUrl))
      .filter((k): k is string => k !== null);
    let purged = 0;
    let failed = 0;
    // Chunked: Storage accepts a batch of paths per call.
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      const { data, error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) failed += chunk.length;
      else purged += data?.length ?? chunk.length;
    }
    console.log(`\nStorage objects deleted: ${purged}${failed ? ` (${failed} failed)` : ""}`);
  }

  // Versions cascade from the record, but delete explicitly so the count in
  // the output is the number of rows that actually left the table.
  const [deletedVersions, deletedRecords] = await prisma.$transaction([
    prisma.sf10RecordVersion.deleteMany({}),
    prisma.sf10Record.deleteMany({}),
  ]);
  console.log(
    `\nDeleted ${deletedRecords.count} SF10 record(s) and ${deletedVersions.count} version(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
