import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";
import { encryptContact } from "../src/lib/contact-crypto.js";

/**
 * Seeds ONE active student account (User + StudentProfile) with a real LRN,
 * name and profile details. Idempotent: re-running updates the same account
 * (matched by email/LRN) instead of duplicating it.
 *
 * The account is deliberately NOT enrolled in a section by default, so it
 * never leaks into an adviser's roster silently. Pass `--section "G7-A"` to
 * attach it to a section of the active school year.
 *
 * Run from backend:
 *   npx tsx prisma/seed-one-student.ts
 *   npm run prisma:seed:student
 *   npx tsx prisma/seed-one-student.ts --section "G7-A"
 *   npx tsx prisma/seed-one-student.ts --grade G8 --name "Juan Dela Cruz"
 *   npx tsx prisma/seed-one-student.ts --reset
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

type Args = Record<string, string | true>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const DEFAULTS = {
  lrn: "136130990001",
  name: "Jasmine Rose T. Villanueva",
  email: "student.seed@zentra.test",
  password: "Student2025!",
  grade: "G7",
  gender: "Female",
  birthdate: "2013-05-14",
  address: "Purok 3, Brgy. Central, Mati City, Davao Oriental",
  contactNumber: "09171239901",
} as const;

const get = (key: keyof typeof DEFAULTS) => {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : DEFAULTS[key];
};

const LRN = get("lrn");
const FULL_NAME = get("name");
const EMAIL = get("email").toLowerCase();
const PASSWORD = get("password");
const GRADE = get("grade").toUpperCase();
const GENDER = get("gender");
const BIRTHDATE = get("birthdate");
const ADDRESS = get("address");
const CONTACT = get("contactNumber");
const SECTION_NAME = typeof args.section === "string" ? args.section : null;

const GRADES = ["G7", "G8", "G9", "G10", "G11", "G12"] as const;
type Grade = (typeof GRADES)[number];

async function reset() {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: EMAIL }, { lrn: LRN }, { studentProfile: { lrn: LRN } }] },
    select: { id: true, email: true },
  });
  if (users.length === 0) {
    console.log(`Reset: no account for LRN ${LRN} / ${EMAIL} — nothing to remove.`);
    return;
  }
  // User cascades to StudentProfile and every learner-scoped row.
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  console.log(`Reset: removed ${users.length} account(s) (${users.map((u) => u.email).join(", ")}).`);
}

async function main() {
  if (args.reset === true) {
    await reset();
    return;
  }

  if (!GRADES.includes(GRADE as Grade)) {
    throw new Error(`Invalid --grade "${GRADE}". Use one of ${GRADES.join(", ")}.`);
  }
  if (!/^\d{12}$/.test(LRN)) {
    throw new Error(`Invalid --lrn "${LRN}". A DepEd LRN is exactly 12 digits.`);
  }

  // A StudentProfile.lrn is unique, so refuse to steal another learner's LRN.
  const lrnOwner = await prisma.studentProfile.findUnique({
    where: { lrn: LRN },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (lrnOwner && lrnOwner.user.email.toLowerCase() !== EMAIL) {
    throw new Error(
      `LRN ${LRN} already belongs to ${lrnOwner.user.email}. Re-run with --reset --email ${lrnOwner.user.email} to replace that account, or pick another --lrn.`,
    );
  }

  let sectionId: string | null = null;
  if (SECTION_NAME) {
    const schoolYear = await prisma.schoolYear.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    if (!schoolYear) throw new Error("No active school year — run `npm run prisma:seed:roles` first.");

    const section = await prisma.section.findFirst({
      where: { schoolYearId: schoolYear.id, name: { equals: SECTION_NAME, mode: "insensitive" } },
      select: { id: true, name: true, gradeLevel: true },
    });
    if (!section) {
      throw new Error(`No section "${SECTION_NAME}" in ${schoolYear.name}. Omit --section to leave the account unenrolled.`);
    }
    if (section.gradeLevel !== GRADE) {
      throw new Error(`Section ${section.name} is ${section.gradeLevel}, but --grade is ${GRADE}.`);
    }
    sectionId = section.id;
  }

  const passwordHash = await argon2.hash(PASSWORD);
  const contactNumber = encryptContact(CONTACT);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      fullName: FULL_NAME,
      role: "student",
      status: "active",
      lrn: LRN,
      contactNumber,
      passwordHash,
    },
    create: {
      email: EMAIL,
      passwordHash,
      role: "student",
      fullName: FULL_NAME,
      lrn: LRN,
      contactNumber,
      status: "active",
    },
    select: { id: true },
  });

  const profile = {
    lrn: LRN,
    gradeLevel: GRADE as Grade,
    sectionId,
    birthdate: new Date(`${BIRTHDATE}T00:00:00.000Z`),
    gender: GENDER,
    address: ADDRESS,
  };

  await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: profile,
    create: { userId: user.id, ...profile },
  });

  const section = sectionId
    ? await prisma.section.findUnique({ where: { id: sectionId }, select: { name: true } })
    : null;

  console.log("Seeded 1 active student account:");
  console.log(`  Name     : ${FULL_NAME}`);
  console.log(`  LRN      : ${LRN}`);
  console.log(`  Grade    : ${GRADE}`);
  console.log(`  Email    : ${EMAIL}`);
  console.log(`  Password : ${PASSWORD}`);
  console.log(`  Section  : ${section?.name ?? "— (not enrolled; re-run with --section \"<name>\" to attach)"}`);
  console.log(`  Birthdate: ${BIRTHDATE}   Gender: ${GENDER}`);
  console.log(`  Contact  : ${CONTACT}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
