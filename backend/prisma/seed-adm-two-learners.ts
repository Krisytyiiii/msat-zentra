/**
 * Seeds TWO fully-enrolled ADM learners so every desk that touches ADM has two
 * believable cases to open end-to-end (guidance triage, nurse visit, coordinator
 * meeting/home-visit/modules/devices, Principal approval, adviser monitoring).
 *
 * Both cases end at `enrollment_monitoring` (approved, devices out) so the
 * monitoring/module desks still have live work to show.
 *
 * Idempotent: keyed by LRN + fixed dates, so re-running tops up what is missing
 * instead of duplicating. `--reset` deletes both seeded learners and everything
 * hanging off them.
 *
 * Usage:
 *   npx tsx prisma/seed-adm-two-learners.ts
 *   npm run prisma:seed:adm-two
 *   npx tsx prisma/seed-adm-two-learners.ts --section "Rizal"
 *   npx tsx prisma/seed-adm-two-learners.ts --reset
 */
import "dotenv/config";
import argon2 from "argon2";
import crypto from "crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";
import { mascotForUnique, sectionTakenMascots } from "../src/services/mascot.js";

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

/** Marker so `--reset` can find this seed's audit trail again. */
const AUDIT_PREFIX = "seed:adm-two · ";

/** 1x1 transparent PNG — stands in for a drawn signature PNG. */
const SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

interface LearnerSpec {
  lrn: string;
  fullName: string;
  guardian: string;
  guardianRelation: string;
  address: string;
  birthdate: Date;
  gender: "male" | "female";
  driveFolder: string;
  absenceDays: number[];
  anecdote: {
    location: string;
    incident: string;
    classPerformance: string;
    attendanceSummary: string;
    recommendations: string;
  };
  referralReason: string;
  referralIntake: string;
  referralNote: string;
  guidanceSession: {
    venue: string;
    notes: string;
    outcome: string;
  };
  clinic: { complaint: string; diagnosis: string; treatment: string };
  homeVisit: {
    homeCondition: string;
    familyCondition: string;
    agreements: string;
  };
  certification: {
    recommendation: string;
    documents: string[];
  };
  minutes: string;
  devices: { deviceType: string; deviceSerial: string; conditionNotes: string }[];
  modules: {
    moduleName: string;
    releaseDaysAgo: number;
    dueDaysAgo: number;
    submitted: boolean;
    submissionDaysAgo?: number;
    remarks: string;
  }[];
  advisorySubmissionRemarks: string;
}

const LEARNERS: LearnerSpec[] = [
  {
    lrn: "136512090046",
    fullName: "Rafael Miguel Dizon Santillan",
    guardian: "Lourdes Dizon Santillan",
    guardianRelation: "Mother",
    address: "Purok 3, Barangay Central, Mati City, Davao Oriental",
    birthdate: new Date("2013-02-11T00:00:00.000Z"),
    gender: "male",
    driveFolder: "zentra-adm-santillan",
    absenceDays: [56, 52, 49, 44, 41],
    anecdote: {
      location: "Room 203, Grade 7 - Rizal classroom (2nd floor, main building)",
      incident:
        "Rafael has been missing first-period classes since the first week of the second quarter. " +
        "On 15 September he arrived at 9:40 a.m. with his uniform still damp from the rain, carrying a " +
        "sealed tray of puto he said he had to deliver to the canteen before coming to school. He fell " +
        "asleep during the Mathematics quiz and did not finish items 6–15. When asked after class, he " +
        "said he now helps his mother at the family stall until 10 p.m. because his father has been " +
        "working out of town since August, and that he does his modules on his phone at night.",
      classPerformance:
        "Mathematics and Science scores dropped from the 86–89 range in the first quarter to 74–78 in " +
        "the latest written work. He submits outputs late (three of the last six) and often asks to " +
        "borrow notes from a seatmate.",
      attendanceSummary:
        "Five absences in the current quarter, all unexcused: 21 Aug, 27 Aug, 2 Sep, 9 Sep, 15 Sep. " +
        "Three tardies. No parent excuse letter on file; calls to the number on the enrolment form " +
        "went unanswered twice.",
      recommendations:
        "Referred for ADM consultation. Requested a home visit to confirm the family's situation, " +
        "modular delivery of the current quarter's lessons, and a check on whether the learner has a " +
        "device he can use at night. Adviser will keep the learner's outputs in one folder for the " +
        "coordinator to review.",
    },
    referralReason:
      "ADM consultation — recurring unexcused absences tied to evening work at the family stall; " +
      "learner needs modular delivery, a device to study at night, and parent-conference follow-up.",
    referralIntake:
      "Guidance reviewed the anecdote and the attendance sheet. Learner is not a discipline case; " +
      "the barrier is time and money at home. Endorsed to ADM with a request for device support.",
    referralNote: "Parent (mother) reached on 25 Sep; she agreed to a school conference and a home visit.",
    guidanceSession: {
      venue: "Guidance Office",
      notes:
        "Conference with the mother, Mrs. Lourdes Santillan. She confirmed the father works in Davao " +
        "City and sends money irregularly; the learner helps at the stall from 6 p.m. to 10 p.m. on " +
        "weekdays. The learner said he studies on a borrowed phone and loses files when the data runs " +
        "out. Mother is open to a modular setup and to a home visit.",
      outcome:
        "Agreed to: (1) ADM endorsement with module delivery, (2) mother to keep a nightly study " +
        "window from 7–9 p.m., (3) device request forwarded to the coordinator.",
    },
    clinic: {
      complaint: "Headache and dizziness after the morning break; reports sleeping around 11 p.m.",
      diagnosis: "Tension headache with mild fatigue; no fever, no visual disturbance.",
      treatment:
        "Rested 30 minutes in the clinic, oral rehydration, advised 20-minute screen breaks and at " +
        "least 7 hours of sleep. Parent notified by text. No medication given.",
    },
    homeVisit: {
      homeCondition:
        "Single-storey concrete house rented at Purok 3, two rooms, electricity connected. The learner " +
        "studies at the dining table beside the front window; one bulb, no desk lamp.",
      familyCondition:
        "Father works out of town and sends support irregularly. Mother runs a small puto stall and is " +
        "the learner's primary guardian. Two younger siblings in elementary school.",
      agreements:
        "Study window 7–9 p.m. daily; modules kept in a rigid envelope to stay dry; mother will text " +
        "the adviser every Friday with the week's outputs; coordinator to follow up on the device " +
        "within one week.",
    },
    certification: {
      recommendation:
        "Home-based ADM with modular delivery for the rest of the quarter. Weekly module tracking by " +
        "the adviser, device loan (tablet + pocket Wi-Fi) for evening study, and a review at the end of " +
        "the quarter against the learner's outputs and attendance record.",
      documents: ["REFERRAL_FORM", "ANECDOTAL_REPORT", "MINUTES_OF_MEETING", "HV_FORM"],
    },
    minutes:
      "1. Coordinator explained the ADM program and what it changes (modular delivery, weekly module " +
      "tracking, device on loan).\n" +
      "2. Mother confirmed the household situation and the learner's evening work at the stall.\n" +
      "3. Agreed study schedule: modules in the evening after 7 p.m., outputs passed every Friday to " +
      "the adviser.\n" +
      "4. Device loan discussed (tablet + pocket Wi-Fi); parent signed the borrower's slip.\n" +
      "5. Home visit set for the following week to see the study space.\n" +
      "6. Review date: end of the quarter, with the adviser's module report as the basis.",
    devices: [
      {
        deviceType: "Learning tablet · 10.1\" Android 14, 64GB",
        deviceSerial: "ZNT-ADM-2026-0416",
        conditionNotes:
          "Unit in good condition, screen protector applied. Pre-loaded with the DepEd Commons offline " +
          "pack and this quarter's modules in PDF. Borrower's slip signed by the mother.",
      },
      {
        deviceType: "Pocket Wi-Fi router · 4G LTE with 15GB monthly data",
        deviceSerial: "ZNT-ADM-2026-0417",
        conditionNotes:
          "Issued with the tablet so modules can be downloaded at home. Data plan renews on the 5th; " +
          "return due at the end of the term or when the case closes.",
      },
    ],
    modules: [
      {
        moduleName: "Week 1 · English — Context Clues and Text Structure",
        releaseDaysAgo: 28,
        dueDaysAgo: 21,
        submitted: true,
        submissionDaysAgo: 22,
        remarks: "Complete. Minor errors in items 4 and 9; corrected during the Friday check-in.",
      },
      {
        moduleName: "Week 2 · Mathematics — Linear Equations",
        releaseDaysAgo: 21,
        dueDaysAgo: 14,
        submitted: true,
        submissionDaysAgo: 15,
        remarks: "Submitted late (1 day). Work is complete; two solutions needed re-teaching.",
      },
      {
        moduleName: "Week 3 · Science — Forces in Daily Life",
        releaseDaysAgo: 14,
        dueDaysAgo: 7,
        submitted: true,
        submissionDaysAgo: 8,
        remarks: "Good explanation of the tricycle example; activity 3 submitted on time.",
      },
      {
        moduleName: "Week 4 · Araling Panlipunan — Kabihasnang Klasikal",
        releaseDaysAgo: 7,
        dueDaysAgo: -1,
        submitted: false,
        remarks: "Released Friday. Learner picked up the printed copy; due end of the week.",
      },
    ],
    advisorySubmissionRemarks:
      "Weeks 1–2 passed in person at the Friday check-in; week 3 scanned to the adviser.",
  },
  {
    lrn: "136512090047",
    fullName: "Jasmine Kaye L. Andrada",
    guardian: "Teresita L. Andrada",
    guardianRelation: "Mother",
    address: "Purok 7, Barangay Dahican, Mati City, Davao Oriental",
    birthdate: new Date("2013-06-04T00:00:00.000Z"),
    gender: "female",
    driveFolder: "zentra-adm-andrada",
    absenceDays: [55, 51, 46, 40, 37],
    anecdote: {
      location: "Covered court, Grade 7 - Rizal PE class (late-afternoon session)",
      incident:
        "Jasmine has been absent every Monday and Thursday for four straight weeks. Her seatmate " +
        "reported that Jasmine now stays home to watch her two younger siblings while their mother " +
        "takes on laundry work in another barangay. On 18 September she came to school only to be " +
        "picked up at noon by an aunt; she left her bag in the classroom and did not submit the Science " +
        "activity. During the PE class she sat out twice, saying she had not eaten breakfast.",
      classPerformance:
        "English and Araling Panlipunan outputs are still passing (79–83) but three of the last five " +
        "were turned in a week late. Science performance task 2 is missing. She participates well when " +
        "present and helps organise group work.",
      attendanceSummary:
        "Eight absences in the current quarter, mostly Mondays and Thursdays: 24 Aug, 27 Aug, 31 Aug, " +
        "3 Sep, 7 Sep, 10 Sep, 14 Sep, 17 Sep. Five tardies. Mother sent one text message explaining " +
        "the sibling situation but no formal excuse letter.",
      recommendations:
        "Referred for ADM consultation. Family needs a flexible delivery mode while the mother's work " +
        "schedule settles; requested a home visit, printed module packets for the weeks she cannot " +
        "attend, and a check on the household's food situation after the learner reported skipping " +
        "breakfast.",
    },
    referralReason:
      "ADM consultation — repeated Monday/Thursday absences because the learner supervises younger " +
      "siblings while the mother works out of barangay; needs modular packets and household support.",
    referralIntake:
      "Guidance noted this is a caregiving and livelihood barrier, not truancy. Endorsed to ADM with " +
      "a request for printed modules and a nutrition check through the clinic.",
    referralNote: "Mother reached by phone on 22 Sep; she agreed to a home visit and to pick up weekly packets.",
    guidanceSession: {
      venue: "Guidance Office",
      notes:
        "Conference with the mother, Mrs. Teresita Andrada, and the learner. The mother takes laundry " +
        "work in Barangay Sainz three days a week and leaves before 6 a.m.; Jasmine cooks and watches " +
        "her siblings, aged 5 and 7, on those days. The family shares one phone with a prepaid data " +
        "load that often runs out mid-week.",
      outcome:
        "Agreed to: (1) ADM endorsement with printed module packets, (2) mother to arrange a neighbour " +
        "to watch the siblings on Thursdays, (3) clinic follow-up on skipped meals.",
    },
    clinic: {
      complaint: "Dizziness and stomach discomfort before the flag ceremony; reports no breakfast.",
      diagnosis: "Mild dehydration with low energy intake; no fever, normal blood pressure.",
      treatment:
        "Given biscuits and water in the clinic, rested 25 minutes, advised to eat before leaving " +
        "home. Mother informed by text; referred to the feeding coordinator's list.",
    },
    homeVisit: {
      homeCondition:
        "Two-room house of light materials at Purok 7, water from a shared deep well, electricity from " +
        "a neighbour's line. Study corner is a low table near the door; no lamp.",
      familyCondition:
        "Mother is a laundry worker and the sole earner; father left the household last year. Three " +
        "children, the two youngest in elementary school. Meals are often rice with dried fish.",
      agreements:
        "Printed packets picked up every Monday; Jasmine to answer at least two subjects per night " +
        "after her siblings sleep; mother to text the adviser when she cannot pick up a packet; " +
        "coordinator to follow up with the feeding program.",
    },
    certification: {
      recommendation:
        "Home-based ADM with printed module packets for the rest of the quarter, a tablet with offline " +
        "modules so the shared phone is not a bottleneck, weekly adviser check-ins, and referral to the " +
        "school feeding program. Review at the end of the quarter.",
      documents: ["REFERRAL_FORM", "ANECDOTAL_REPORT", "HV_FORM"],
    },
    minutes:
      "1. Coordinator explained ADM delivery options (printed packets + tablet) and the weekly " +
      "submission schedule.\n" +
      "2. Mother described her laundry work schedule and the caregiving arrangement at home.\n" +
      "3. Agreed: printed packets on Mondays, tablet for night study, submissions every Friday.\n" +
      "4. Nutrition concern raised; mother consented to the feeding-program referral.\n" +
      "5. Home visit scheduled to check the study corner and the siblings' arrangement.\n" +
      "6. Review at the end of the quarter using the adviser's module report.",
    devices: [
      {
        deviceType: "Learning tablet · 10.1\" Android 14, 64GB",
        deviceSerial: "ZNT-ADM-2026-0421",
        conditionNotes:
          "Unit issued in good condition with a rubber case. Offline copies of the quarter's modules " +
          "loaded. Borrower's slip signed by the mother.",
      },
    ],
    modules: [
      {
        moduleName: "Week 1 · English — Reading for Main Idea",
        releaseDaysAgo: 26,
        dueDaysAgo: 19,
        submitted: true,
        submissionDaysAgo: 19,
        remarks: "Complete and neat; answer sheet signed by the mother.",
      },
      {
        moduleName: "Week 2 · Science — Mixtures and Solutions",
        releaseDaysAgo: 19,
        dueDaysAgo: 12,
        submitted: false,
        remarks: "Packet picked up but not returned; adviser reminded the mother by text.",
      },
      {
        moduleName: "Week 3 · Mathematics — Integers",
        releaseDaysAgo: 12,
        dueDaysAgo: 5,
        submitted: true,
        submissionDaysAgo: 4,
        remarks: "Submitted after a Friday check-in; items 8–10 re-taught.",
      },
    ],
    advisorySubmissionRemarks:
      "Week 1 passed in person; week 3 handed to the adviser after the check-in.",
  },
];

function daysAgo(n: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function sectionArg(): string | null {
  const i = process.argv.indexOf("--section");
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function byRole(role: string, preferred: string[]) {
  const candidates = await prisma.user.findMany({
    where: { role: role as never, status: "active" },
    select: { id: true, fullName: true, email: true },
  });
  const hit = candidates.find((u) => preferred.includes(u.email)) ?? candidates[0];
  if (!hit) throw new Error(`No active ${role} account — run the base/roles seed first.`);
  return hit;
}

async function reset() {
  let removed = 0;
  for (const spec of LEARNERS) {
    const profile = await prisma.studentProfile.findUnique({
      where: { lrn: spec.lrn },
      select: { userId: true },
    });
    const roster = await prisma.studentRoster.findFirst({
      where: { lrn: spec.lrn },
      select: { id: true },
    });
    // User → StudentProfile cascades the ADM case, forms, meetings, invitees,
    // devices, modules, referral + its sessions, anecdote, health record,
    // home visitation, attendance and advisory submissions.
    if (profile) await prisma.user.delete({ where: { id: profile.userId } });
    if (roster) await prisma.studentRoster.delete({ where: { id: roster.id } });
    if (profile || roster) removed += 1;
  }
  await prisma.auditLog.deleteMany({ where: { reason: { startsWith: AUDIT_PREFIX } } });
  console.log(`Reset: removed ${removed} seeded ADM learner(s).`);
}

async function main() {
  if (process.argv.includes("--reset")) {
    await reset();
    return;
  }

  const schoolYear = await prisma.schoolYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (!schoolYear) throw new Error("No active school year — run the base seed first.");

  const terms = await prisma.term.findMany({
    where: { schoolYearId: schoolYear.id },
    select: { id: true, termNumber: true, startDate: true, endDate: true },
    orderBy: { termNumber: "asc" },
  });
  const now = new Date();
  const term =
    terms.find((t) => t.startDate && t.endDate && t.startDate <= now && now <= t.endDate) ?? terms[0];
  if (!term) throw new Error("No term found for the active school year.");

  const principal = await byRole("principal", ["principal@zentra.test"]);
  const adm = await byRole("adm_coordinator", ["adm@zentra.test", "adm_coordinator@zentra.test"]);
  const guidance = await byRole("guidance_counselor", ["guidance@zentra.test", "guidance_counselor@zentra.test"]);
  const nurse = await byRole("nurse", ["nurse@zentra.test"]);

  // ---- Section: named one, else a G7 section with an adviser, else any ----
  const wanted = sectionArg();
  const sections = await prisma.section.findMany({
    where: {
      schoolYearId: schoolYear.id,
      adviserId: { not: null },
      ...(wanted ? { name: { equals: wanted, mode: "insensitive" as const } } : {}),
    },
    select: { id: true, name: true, gradeLevel: true, adviserId: true },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
  });
  if (sections.length === 0) {
    throw new Error(
      wanted
        ? `Section "${wanted}" has no adviser in ${schoolYear.name}.`
        : `No section with an adviser in ${schoolYear.name} — run the base seed first.`,
    );
  }
  const section = sections.find((s) => s.gradeLevel === "G7") ?? sections[0];
  const adviserId = section.adviserId as string;
  const adviser = await prisma.user.findUniqueOrThrow({
    where: { id: adviserId },
    select: { fullName: true },
  });

  const takenMascots = await sectionTakenMascots(prisma, section.id);
  const summary: string[] = [];

  for (const spec of LEARNERS) {
    const drive = `https://drive.google.com/drive/folders/${spec.driveFolder}`;
    const studentEmail = `${spec.lrn}@adm-enrolled.local`;
    const lastName = spec.fullName.split(" ").slice(-1)[0].toLowerCase();
    const slug = `${spec.fullName.split(" ")[0].toLowerCase()}-${lastName}`;

    // ---- 1. Enrol the learner (roster + account) ----
    const roster = await prisma.studentRoster.upsert({
      where: { lrn_schoolYearId: { lrn: spec.lrn, schoolYearId: schoolYear.id } },
      update: { sectionId: section.id, fullName: spec.fullName },
      create: {
        lrn: spec.lrn,
        fullName: spec.fullName,
        gradeLevel: section.gradeLevel,
        sectionId: section.id,
        schoolYearId: schoolYear.id,
        learnerType: "regular",
        enlistedTermId: term.id,
      },
      select: { id: true },
    });

    const passwordHash = await argon2.hash(crypto.randomBytes(32).toString("hex"));
    const user = await prisma.user.upsert({
      where: { email: studentEmail },
      update: { fullName: spec.fullName, status: "active" },
      create: {
        email: studentEmail,
        passwordHash,
        role: "student",
        status: "active",
        fullName: spec.fullName,
        lrn: spec.lrn,
      },
      select: { id: true },
    });

    const mascot = mascotForUnique(spec.fullName, spec.lrn, takenMascots);
    const profile = await prisma.studentProfile.upsert({
      where: { lrn: spec.lrn },
      update: { sectionId: section.id, gradeLevel: section.gradeLevel, mascot },
      create: {
        userId: user.id,
        lrn: spec.lrn,
        gradeLevel: section.gradeLevel,
        sectionId: section.id,
        birthdate: spec.birthdate,
        gender: spec.gender,
        address: spec.address,
        mascot,
      },
      select: { userId: true },
    });
    takenMascots.add(mascot);
    await prisma.studentRoster.update({ where: { id: roster.id }, data: { mascot } });
    const studentId = profile.userId;

    // ---- 2. Anecdotal record (what the adviser actually saw) ----
    const anecdoteDate = daysAgo(58, 9, 20);
    const anecdote =
      (await prisma.anecdotalRecord.findFirst({
        where: { studentId, observerId: adviserId, observationDatetime: anecdoteDate },
        select: { id: true },
      })) ??
      (await prisma.anecdotalRecord.create({
        data: {
          studentId,
          rosterId: null,
          observerId: adviserId,
          sectionId: section.id,
          observationDatetime: anecdoteDate,
          descriptionOfLocation: spec.anecdote.location,
          descriptionOfIncident: spec.anecdote.incident,
          classPerformance: spec.anecdote.classPerformance,
          attendanceSummary: spec.anecdote.attendanceSummary,
          notesRecommendationsActions: spec.anecdote.recommendations,
          attachmentUrl: `${drive}/anecdotal-form-${slug}.pdf`,
          category: "attendance",
          confidentialityLevel: "restricted",
          termId: term.id,
          signedBy: adviserId,
          signedAt: daysAgo(58, 16, 10),
          signatureImageUrl: SIGNATURE_DATA_URL,
        },
        select: { id: true },
      }));

    // ---- 3. Recorded absences behind the anecdote (pre-approval history) ----
    for (const n of spec.absenceDays) {
      const date = daysAgo(n, 7, 30);
      const exists = await prisma.attendanceRecord.findFirst({
        where: { studentId, date, subjectId: null, slot: 1 },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.attendanceRecord.create({
        data: {
          studentId,
          rosterId: null,
          sectionId: section.id,
          date,
          session: "AM",
          status: "absent",
          recordedBy: adviserId,
          termId: term.id,
          slot: 1,
        },
      });
    }

    // ---- 4. ADM referral (endorsed by guidance) ----
    const referral =
      (await prisma.referral.findFirst({
        where: { studentId, referredToRole: "adm_coordinator", anecdotalRecordId: anecdote.id },
        select: { id: true },
      })) ??
      (await prisma.referral.create({
        data: {
          anecdotalRecordId: anecdote.id,
          referredToRole: "adm_coordinator",
          referredBy: adviserId,
          reason: spec.referralReason,
          consultReviewer: "guidance_counselor",
          consultReviewedAt: daysAgo(55, 10, 15),
          referralFormReady: true,
          status: "in_progress",
          priority: "high",
          intakeNotes: spec.referralIntake,
          acceptedAt: daysAgo(54, 9, 5),
          notes: spec.referralNote,
          studentId,
          rosterId: null,
          termId: term.id,
        },
        select: { id: true },
      }));

    // ---- 5. Guidance: one completed parent conference on the case ----
    const sessionAt = daysAgo(50, 14, 0);
    const hasSession = await prisma.counselingSession.findFirst({
      where: { referralId: referral.id, scheduledAt: sessionAt },
      select: { id: true },
    });
    if (!hasSession) {
      await prisma.counselingSession.create({
        data: {
          referralId: referral.id,
          sessionType: "parent_conference",
          scheduledAt: sessionAt,
          venue: spec.guidanceSession.venue,
          status: "completed",
          completedAt: daysAgo(50, 15, 5),
          sessionNotes: spec.guidanceSession.notes,
          outcome: spec.guidanceSession.outcome,
          createdBy: guidance.id,
        },
      });
    }

    // ---- 6. Nurse: clinic visit on the same learner ----
    const visitAt = daysAgo(47, 13, 10);
    const hasHealth = await prisma.healthRecord.findFirst({
      where: { studentId, visitDatetime: visitAt },
      select: { id: true },
    });
    if (!hasHealth) {
      await prisma.healthRecord.create({
        data: {
          studentId,
          referralId: referral.id,
          visitDatetime: visitAt,
          complaint: spec.clinic.complaint,
          diagnosis: spec.clinic.diagnosis,
          treatmentGiven: spec.clinic.treatment,
          recordedBy: nurse.id,
          termId: term.id,
          confidentialityLevel: "restricted",
        },
      });
    }

    // ---- 7. Coordinator: home visitation ----
    const hasHomeVisit = await prisma.homeVisitationRecord.findFirst({
      where: { studentId, referralId: referral.id },
      select: { id: true },
    });
    if (!hasHomeVisit) {
      await prisma.homeVisitationRecord.create({
        data: {
          studentId,
          referralId: referral.id,
          personVisited: `${spec.guardian} (${spec.guardianRelation.toLowerCase()}) and the learner`,
          homeCondition: spec.homeVisit.homeCondition,
          familyCondition: spec.homeVisit.familyCondition,
          agreements: spec.homeVisit.agreements,
          parentSignature: SIGNATURE_DATA_URL,
          studentSignature: SIGNATURE_DATA_URL,
          certificationBy: adm.id,
          termId: term.id,
          confidentialityLevel: "restricted",
        },
      });
    }

    // ---- 8. Coordinator certification + Principal approval ----
    const existingProfile = await prisma.admLearnerProfile.findFirst({
      where: { referralId: referral.id },
      select: { id: true },
    });
    const admProfile =
      existingProfile ??
      (await prisma.admLearnerProfile.create({
        data: {
          studentId,
          referralId: referral.id,
          termId: term.id,
          stage: "enrollment_monitoring",
          eligibilityStatus: "eligible",
          preparedBy: adm.id,
          approvedBy: principal.id,
          approvedAt: daysAgo(32, 11, 20),
          certificationDetails: {
            recommendation: spec.certification.recommendation,
            certifiedBy: adm.id,
            certifiedAt: daysAgo(33, 15, 40).toISOString(),
            eligibilityBasis: {
              parentMeetingAttended: true,
              homeVisitationConducted: true,
              documentsVerified: spec.certification.documents,
            },
          },
        },
        select: { id: true },
      }));

    // ---- 8b. Parent meeting, owned by the case profile ----
    const meetingAt = daysAgo(38, 10, 0);
    const meeting = await prisma.admParentMeeting.findFirst({
      where: { admLearnerProfileId: admProfile.id, meetingDatetime: meetingAt },
      select: { id: true },
    });
    const meetingId =
      meeting?.id ??
      (
        await prisma.admParentMeeting.create({
          data: {
            admLearnerProfileId: admProfile.id,
            recordedBy: adm.id,
            meetingDatetime: meetingAt,
            venue: "school",
            attended: true,
            parentConfirmedAt: daysAgo(39, 16, 30),
            minutesOfMeeting: spec.minutes,
            attendanceLogbookRef: `ADM-LB-2026-${spec.lrn.slice(-4)}`,
            attendees: [
              { name: spec.guardian, role: "parent_guardian" },
              { name: adm.fullName, role: "other", userId: adm.id },
              { name: adviser.fullName, role: "teacher", userId: adviserId },
              { name: guidance.fullName, role: "guidance_counselor", userId: guidance.id },
              { name: spec.fullName, role: "student", userId: studentId },
            ],
          },
        })
      ).id;

    for (const invitee of [adviserId, guidance.id, nurse.id]) {
      await prisma.admMeetingInvitee.upsert({
        where: { meetingId_userId: { meetingId, userId: invitee } },
        update: {},
        create: { meetingId, userId: invitee, invitedAt: daysAgo(41, 8, 45) },
      });
    }

    const forms: Array<{
      formType: "REFERRAL_FORM" | "ANECDOTAL_REPORT" | "CERTIFICATION" | "MINUTES_OF_MEETING" | "HV_FORM" | "PRINCIPAL_SIGNAGE";
      title: string;
      fileUrl: string | null;
      uploadedAt: Date;
      notes: string;
    }> = [
      {
        formType: "REFERRAL_FORM",
        title: "GCForm-03 · ADM Referral Form",
        fileUrl: `${drive}/gcform03-${slug}.pdf`,
        uploadedAt: daysAgo(55, 10, 30),
        notes: "Signed by the adviser; endorsed to ADM after guidance consultation.",
      },
      {
        formType: "ANECDOTAL_REPORT",
        title: "Anecdotal Report (signed)",
        fileUrl: `${drive}/anecdotal-form-${slug}.pdf`,
        uploadedAt: daysAgo(58, 16, 15),
        notes: "Adviser-signed anecdotal record behind the referral.",
      },
      {
        formType: "MINUTES_OF_MEETING",
        title: "Minutes of Meeting · Parent Conference",
        fileUrl: `${drive}/adm-minutes-${spec.lrn.slice(-4)}.pdf`,
        uploadedAt: daysAgo(38, 11, 30),
        notes: "Parent conference minutes with the agreed action items.",
      },
      {
        formType: "HV_FORM",
        title: "Home Visitation Form",
        fileUrl: `${drive}/adm-home-visitation-${slug}.pdf`,
        uploadedAt: daysAgo(36, 14, 0),
        notes: "Signed by the guardian, the learner, and the coordinator.",
      },
      {
        formType: "CERTIFICATION",
        title: "ADM Certification & Recommendation",
        fileUrl: `${drive}/adm-certification-${slug}.pdf`,
        uploadedAt: daysAgo(33, 16, 0),
        notes: "Coordinator certification — program fit, period covered, and the device recommendation.",
      },
      {
        formType: "PRINCIPAL_SIGNAGE",
        title: "Principal Signage",
        fileUrl: SIGNATURE_DATA_URL,
        uploadedAt: daysAgo(32, 11, 20),
        notes: "Principal signature captured on approval.",
      },
    ];
    for (const f of forms) {
      const exists = await prisma.admForm.findFirst({
        where: { admLearnerProfileId: admProfile.id, formType: f.formType },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.admForm.create({
        data: {
          admLearnerProfileId: admProfile.id,
          formType: f.formType,
          title: f.title,
          fileUrl: f.fileUrl,
          status: "verified",
          uploadedBy: f.formType === "PRINCIPAL_SIGNAGE" ? principal.id : adm.id,
          uploadedAt: f.uploadedAt,
          notes: f.notes,
        },
      });
    }

    // ---- 9. Devices on loan ----
    for (const dev of spec.devices) {
      const exists = await prisma.admDevice.findFirst({
        where: { admLearnerProfileId: admProfile.id, deviceSerial: dev.deviceSerial },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.admDevice.create({
        data: {
          admLearnerProfileId: admProfile.id,
          deviceType: dev.deviceType,
          deviceSerial: dev.deviceSerial,
          issuedBy: adm.id,
          issuedDate: daysAgo(31, 9, 50),
          conditionNotes: dev.conditionNotes,
        },
      });
    }

    // ---- 10. Modules released for the case (mixed submission) ----
    for (const m of spec.modules) {
      const exists = await prisma.admModule.findFirst({
        where: { admLearnerProfileId: admProfile.id, moduleName: m.moduleName },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.admModule.create({
        data: {
          admLearnerProfileId: admProfile.id,
          moduleName: m.moduleName,
          releaseDate: daysAgo(m.releaseDaysAgo, 8, 0),
          dueDate: daysAgo(m.dueDaysAgo, 17, 0),
          submitted: m.submitted,
          submissionDate: m.submitted && m.submissionDaysAgo !== undefined ? daysAgo(m.submissionDaysAgo, 19, 30) : null,
          submissionUrl: m.submitted ? `${drive}/module-answered-${slug}.pdf` : null,
          studentSubmissionUrl: m.submitted ? `${drive}/module-${slug}.pdf` : null,
          remarks: m.remarks,
          recordedBy: adviserId,
        },
      });
    }

    summary.push(
      `${spec.fullName} (LRN ${spec.lrn}) — case ${admProfile.id}, ${spec.modules.filter((m) => m.submitted).length}/${spec.modules.length} modules in, ` +
        `${spec.devices.length} device(s), ${spec.absenceDays.length} absences on file`,
    );
  }

  // ---- 11. Section-wide ADM module (the desk merges these with case modules) ----
  const advisoryModule = await prisma.advisoryModule.findFirst({
    where: { sectionId: section.id, termId: term.id, kind: "adm", moduleName: "ADM Quarter 2 · Learning Package" },
    select: { id: true },
  });
  const directedDrive = `https://drive.google.com/drive/folders/zentra-adm-package`;
  const advisoryModuleId =
    advisoryModule?.id ??
    (
      await prisma.advisoryModule.create({
        data: {
          sectionId: section.id,
          termId: term.id,
          kind: "adm",
          moduleName: "ADM Quarter 2 · Learning Package",
          moduleUrl: `${directedDrive}/adm-q2-package`,
          description:
            "Printed + digital package for learners on ADM this quarter: one module per week per " +
            "subject, answer sheets, and the submission schedule.",
          releaseDate: daysAgo(28, 8, 0),
          dueDate: daysAgo(-7, 17, 0),
          createdBy: adviserId,
        },
        select: { id: true },
      })
    ).id;

  for (const spec of LEARNERS) {
    const student = await prisma.studentProfile.findUnique({
      where: { lrn: spec.lrn },
      select: { userId: true },
    });
    if (!student) continue;
    const hasSubmission = await prisma.advisoryModuleSubmission.findFirst({
      where: { moduleId: advisoryModuleId, studentId: student.userId },
      select: { id: true },
    });
    if (hasSubmission) continue;
    await prisma.advisoryModuleSubmission.create({
      data: {
        moduleId: advisoryModuleId,
        studentId: student.userId,
        rosterId: null,
        submissionKind: "physical",
        submitted: true,
        submittedAt: daysAgo(20, 16, 20),
        remarks: spec.advisorySubmissionRemarks,
        recordedBy: adviserId,
      },
    });
  }

  // ---- 12. Audit trail for the cases (what the desks' history panels read) ----
  for (const spec of LEARNERS) {
    const profile = await prisma.studentProfile.findUnique({
      where: { lrn: spec.lrn },
      select: { userId: true },
    });
    if (!profile) continue;
    const admProfile = await prisma.admLearnerProfile.findFirst({
      where: { studentId: profile.userId, termId: term.id },
      select: { id: true },
    });
    if (!admProfile) continue;
    const referral = await prisma.referral.findFirst({
      where: { studentId: profile.userId, referredToRole: "adm_coordinator" },
      select: { id: true, anecdotalRecordId: true },
    });

    const auditRows: Array<{
      actorId: string;
      actionType: "anecdotal_edit" | "referral_adm_initiated" | "adm_edit" | "session_completed";
      sourceTable: string;
      sourceId: string;
      reason: string;
      createdAt: Date;
    }> = [
      {
        actorId: adviserId,
        actionType: "anecdotal_edit",
        sourceTable: "anecdotal_records",
        sourceId: referral?.anecdotalRecordId ?? admProfile.id,
        reason: `${AUDIT_PREFIX}${spec.lrn} anecdotal record filed and adviser-signed (attendance)`,
        createdAt: daysAgo(58, 16, 12),
      },
      {
        actorId: guidance.id,
        actionType: "session_completed",
        sourceTable: "counseling_sessions",
        sourceId: referral?.id ?? admProfile.id,
        reason: `${AUDIT_PREFIX}${spec.lrn} parent conference completed by guidance`,
        createdAt: daysAgo(50, 15, 6),
      },
      {
        actorId: adm.id,
        actionType: "referral_adm_initiated",
        sourceTable: "referrals",
        sourceId: referral?.id ?? admProfile.id,
        reason: `${AUDIT_PREFIX}${spec.lrn} ADM consultation endorsed to the coordinator after guidance review`,
        createdAt: daysAgo(54, 9, 6),
      },
      {
        actorId: adm.id,
        actionType: "adm_edit",
        sourceTable: "adm_learner_profiles",
        sourceId: admProfile.id,
        reason: `${AUDIT_PREFIX}${spec.lrn} parent meeting logged (attended)`,
        createdAt: daysAgo(38, 11, 35),
      },
      {
        actorId: adm.id,
        actionType: "adm_edit",
        sourceTable: "adm_learner_profiles",
        sourceId: admProfile.id,
        reason: `${AUDIT_PREFIX}${spec.lrn} home visitation recorded and certified by the coordinator`,
        createdAt: daysAgo(36, 14, 5),
      },
      {
        actorId: adm.id,
        actionType: "adm_edit",
        sourceTable: "adm_learner_profiles",
        sourceId: admProfile.id,
        reason: `${AUDIT_PREFIX}${spec.lrn} coordinator certification created and endorsed to the Principal`,
        createdAt: daysAgo(33, 15, 45),
      },
      {
        actorId: principal.id,
        actionType: "adm_edit",
        sourceTable: "adm_learner_profiles",
        sourceId: admProfile.id,
        reason: `${AUDIT_PREFIX}${spec.lrn} Principal signed — ADM approved, case moved to enrollment monitoring`,
        createdAt: daysAgo(32, 11, 25),
      },
    ];
    for (const row of auditRows) {
      const exists = await prisma.auditLog.findFirst({ where: { reason: row.reason }, select: { id: true } });
      if (exists) continue;
      await prisma.auditLog.create({
        data: {
          userId: row.actorId,
          actionType: row.actionType,
          sourceTable: row.sourceTable,
          sourceId: row.sourceId,
          reason: row.reason,
          createdAt: row.createdAt,
        },
      });
    }
  }

  console.log(`Seeded ${LEARNERS.length} enrolled ADM learners in ${schoolYear.name} · Term ${term.termNumber}:`);
  console.log(`  Section: ${section.name} (${section.gradeLevel}) · adviser ${adviser.fullName}`);
  console.log(`  Approved by the Principal · stage enrollment_monitoring · attendance-exempt`);
  for (const line of summary) console.log(`  - ${line}`);
  console.log(`  Logins: <LRN>@adm-enrolled.local (random password — sign in as the adviser to view).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
