import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";

/**
 * Adds the default student and parent logins without wiping school data.
 * Existing accounts, profiles, passwords and links are left unchanged.
 *
 *   npm run prisma:seed:student-parent
 */
const ACCOUNTS = [
  { email: "student@zentra.test", fullName: "Default Student", role: "student", password: "Student2025!" },
  { email: "parent@zentra.test", fullName: "Default Parent", role: "parent", password: "Parent2025!" },
] as const;

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to create demo student/parent accounts in production");
  }

  const passwordHashes = await Promise.all(ACCOUNTS.map((account) => argon2.hash(account.password)));
  const results = await prisma.$transaction(async (tx) => {
    const accounts = [];
    for (const [index, account] of ACCOUNTS.entries()) {
      const existing = await tx.user.findUnique({ where: { email: account.email } });
      if (existing && existing.role !== account.role) {
        throw new Error(`Cannot seed ${account.email}: existing account has role ${existing.role}`);
      }
      const user = existing ?? await tx.user.create({
        data: {
          email: account.email,
          fullName: account.fullName,
          role: account.role,
          passwordHash: passwordHashes[index],
          status: "active",
        },
      });
      accounts.push({ ...account, userId: user.id, created: !existing });
    }

    const [student, parent] = accounts;
    await tx.studentProfile.upsert({
      where: { userId: student.userId },
      update: {},
      create: { userId: student.userId, lrn: "100000000001", gradeLevel: "G7" },
    });
    await tx.parentProfile.upsert({
      where: { userId: parent.userId },
      update: {},
      create: { userId: parent.userId },
    });
    await tx.parentStudentLink.upsert({
      where: { parentId_studentId: { parentId: parent.userId, studentId: student.userId } },
      update: {},
      create: { parentId: parent.userId, studentId: student.userId, relationship: "parent" },
    });
    return accounts;
  });

  console.log("Seed complete: student + parent accounts linked; existing data preserved.");
  for (const account of results) {
    const credential = account.created ? account.password : "(existing account; password/status unchanged)";
    console.log(`  ${account.role.padEnd(19)} ${account.email.padEnd(30)} ${credential}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
