import "dotenv/config";
import { PrismaClient, Role } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";
import argon2 from "argon2";

/**
 * One Grade 12 teacher account — no transactions, no assignments.
 *
 *   npx tsx prisma/seed-teacher-grade12.ts
 *
 * Creates/updates ONLY the User + StaffProfile (banded to G12). It deliberately
 * writes no Section advisory, no TeacherSubjectAssignment, no timetable entry,
 * no term grant and no gradebook/attendance rows, so every desk for this
 * account starts empty.
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const EMAIL = "teacher.g12@zentra.test";
const FULL_NAME = "Grade 12 Subject Teacher";
const PASSWORD = "Zentra2025!";
const EMPLOYEE_ID = "TCH012";

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);

  const teacher = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { fullName: FULL_NAME, role: "subject_teacher" as Role, passwordHash, status: "active" },
    create: {
      email: EMAIL,
      fullName: FULL_NAME,
      role: "subject_teacher" as Role,
      passwordHash,
      status: "active",
    },
  });

  await prisma.staffProfile.upsert({
    where: { userId: teacher.id },
    update: { employeeId: EMPLOYEE_ID, isAdviser: false, department: "Academic", handledGradeLevels: ["G12"] },
    create: {
      userId: teacher.id,
      employeeId: EMPLOYEE_ID,
      isAdviser: false,
      department: "Academic",
      handledGradeLevels: ["G12"],
    },
  });

  const [advised, assignments, linkedName, grants] = await Promise.all([
    prisma.section.count({ where: { adviserId: teacher.id } }),
    prisma.teacherSubjectAssignment.count({ where: { teacherId: teacher.id } }),
    prisma.teacherName.findFirst({ where: { userId: teacher.id }, select: { id: true } }),
    prisma.teacherTermGrant.count({ where: { userId: teacher.id } }),
  ]);

  console.log("Grade 12 teacher ready (account only):");
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  name:     ${FULL_NAME}`);
  console.log(`  band:     G12`);
  console.log(`  advisory sections: ${advised}`);
  console.log(`  subject assignments: ${assignments}`);
  console.log(`  timetable name linked: ${linkedName ? "yes" : "no"}`);
  console.log(`  term grants: ${grants}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
