import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

/**
 * Wipe every row in the public schema **except** the accounts and the school
 * calendar spine.
 *
 *   npx tsx prisma/wipe-keep-accounts.ts        # (npm run prisma:wipe:keep-accounts)
 *
 * Kept: `User` (every login, one per role + any extra learner/parent logins),
 * their `StaffProfile` / `StudentProfile` / `ParentProfile` rows, and the
 * `SchoolYear` / `Term` rows so every desk still resolves a term scope.
 *
 * Everything else — learners' section links, sections, subjects, grades,
 * attendance, anecdotal/referral/intervention/ADM/SF10 tracks, notifications,
 * audit log, refresh tokens, login events, snapshots — is deleted.
 *
 * FK-safe: the kept `StudentProfile.sectionId` is cleared first, then every
 * other table is deleted child-first using retries (a DELETE that still has a
 * referencing row fails with 23503 and is retried after its children are gone).
 *
 * Guarded: refuses production unless ALLOW_PROD_SEED=yes.
 */

const KEEP_TABLES = new Set([
  "_prisma_migrations",
  "User",
  "StaffProfile",
  "StudentProfile",
  "ParentProfile",
  "SchoolYear",
  "Term",
]);

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

async function main() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production" && process.env.ALLOW_PROD_SEED !== "yes") {
    throw new Error("Refusing to wipe in production without ALLOW_PROD_SEED=yes");
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  const targets = tables
    .map((t) => t.tablename)
    .filter((name) => !KEEP_TABLES.has(name));

  // The kept student profiles point at sections that are about to disappear —
  // the FK is RESTRICT, so clear it before deleting the academic spine.
  const cleared = await prisma.$executeRawUnsafe(
    `UPDATE "StudentProfile" SET "sectionId" = NULL WHERE "sectionId" IS NOT NULL;`,
  );
  console.log(`Wipe: cleared sectionId on ${cleared} kept student profile(s).`);

  const remaining = new Set(targets);
  const deleted = new Map<string, number>();
  let passes = 0;
  while (remaining.size > 0) {
    passes += 1;
    let progressed = false;
    for (const table of [...remaining]) {
      try {
        const count = await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
        deleted.set(table, count);
        remaining.delete(table);
        progressed = true;
      } catch (e) {
        // 23503 = foreign_key_violation: children not emptied yet, retry later.
        // Prisma wraps driver-adapter errors (P2010), so match the embedded
        // SQLSTATE/message rather than a top-level `code`.
        const text = `${(e as Error)?.message ?? ""} ${JSON.stringify(
          (e as { meta?: unknown })?.meta ?? {},
        )}`;
        if (/23503|foreign key constraint/i.test(text)) continue;
        throw e;
      }
    }
    if (!progressed) {
      throw new Error(
        `Wipe stalled with FK-blocked tables: ${[...remaining].join(", ")}`,
      );
    }
  }

  const total = [...deleted.values()].reduce((sum, n) => sum + n, 0);
  console.log(`Wipe: deleted ${total} row(s) across ${deleted.size} table(s) in ${passes} pass(es).`);
  for (const [table, count] of [...deleted.entries()].sort()) {
    if (count > 0) console.log(`  ${table.padEnd(32)} ${count}`);
  }
  console.log(
    "Wipe complete: accounts (User + profiles) and SchoolYear/Term preserved.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
