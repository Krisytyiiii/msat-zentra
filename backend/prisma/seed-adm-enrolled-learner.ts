import "dotenv/config";
import argon2 from "argon2";
import crypto from "crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";
import { mascotForUnique, sectionTakenMascots } from "../src/services/mascot.js";

/**
 * Seeds ONE fully-enrolled ADM learner so every desk that touches ADM has a
 * believable case to open end-to-end:
 *
 *   adviser      anecdotal record → ADM referral (endorsed by guidance)
 *   guidance     consultation triage + a completed parent conference
 *   nurse        clinic visit on the same learner
 *   coordinator  parent meeting (minutes + invitees), home visitation,
 *                modules, coordinator certification, issued devices
 *   principal    signed approval (case now attendance-exempt)
 *   advisory     one `kind: adm` released module + a submitted answer
 *
 * The case ends at `enrollment_monitoring` (approved, devices out) — not
 * `completion`, so the monitoring/module desks still have work to show.
 *
 * Idempotent: keyed by LRN + fixed dates, so re-running tops up what is
 * missing instead of duplicating. `--reset` deletes the seeded learner and
 * everything hanging off them (the case, documents, devices, sessions).
 *
 * Usage:
 *   npx tsx prisma/seed-adm-enrolled-learner.ts
 *   npx tsx prisma/seed-adm-enrolled-learner.ts --section "Newton"
 *   npx tsx prisma/seed-adm-enrolled-learner.ts --reset
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const LRN = "136512090045";
const FULL_NAME = "Rafael Miguel Dizon Santillan";
const GUARDIAN = "Lourdes Dizon Santillan";
const ADDRESS = "Purok 3, Barangay Central, Mati City, Davao Oriental";
const BIRTHDATE = new Date("2013-02-11T00:00:00.000Z");
const STUDENT_EMAIL = `${LRN}@adm-enrolled.local`;

/** Marker so `--reset` can find this seed's audit trail again. */
const AUDIT_PREFIX = "seed:adm-enrolled · ";

/** 1x1 transparent PNG — stands in for the Principal's drawn signature PNG. */
const SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const DRIVE = "https://drive.google.com/drive/folders/zentra-adm-santillan";

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
  if (!hit) {
    throw new Error(`No active ${role} account — run the base/roles seed first.`);
  }
  return hit;
}

async function reset() {
  const profile = await prisma.studentProfile.findUnique({
    where: { lrn: LRN },
    select: { userId: true },
  });
  const roster = await prisma.studentRoster.findFirst({ where: { lrn: LRN }, select: { id: true } });
  if (!profile && !roster) {
    console.log(`Reset: nothing seeded for LRN ${LRN}.`);
    return;
  }
  if (profile) {
    // User → StudentProfile cascades the ADM case, forms, meetings, invitees,
    // devices, modules, referral + its sessions, anecdote, health record,
    // home visitation, attendance and advisory submissions.
    await prisma.user.delete({ where: { id: profile.userId } });
  }
  if (roster) await prisma.studentRoster.delete({ where: { id: roster.id } });
  await prisma.auditLog.deleteMany({ where: { reason: { startsWith: AUDIT_PREFIX } } });
  console.log(`Reset: removed the seeded ADM learner (LRN ${LRN}) and their case.`);
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
    terms.find((t) => t.startDate && t.endDate && t.startDate <= now && now <= t.endDate) ??
    terms[0];
  if (!term) throw new Error("No term found for the active school year.");

  const principal = await byRole("principal", ["principal@zentra.test"]);
  const adm = await byRole("adm_coordinator", ["adm@zentra.test", "adm_coordinator@zentra.test"]);
  const guidance = await byRole("guidance_counselor", ["guidance@zentra.test", "guidance_counselor@zentra.test"]);
  const nurse = await byRole("nurse", ["nurse@zentra.test"]);

  // ---- Section: named one, else a G8 section with an adviser, else G7, else any ----
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
  const section =
    sections.find((s) => s.gradeLevel === "G8") ??
    sections.find((s) => s.gradeLevel === "G7") ??
    sections[0];
  const adviserId = section.adviserId as string;
  const adviser = await prisma.user.findUniqueOrThrow({
    where: { id: adviserId },
    select: { fullName: true },
  });

  // ---- 1. Enrol the learner (roster + account) ----
  const roster = await prisma.studentRoster.upsert({
    where: { lrn_schoolYearId: { lrn: LRN, schoolYearId: schoolYear.id } },
    update: { sectionId: section.id, fullName: FULL_NAME },
    create: {
      lrn: LRN,
      fullName: FULL_NAME,
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
    where: { email: STUDENT_EMAIL },
    update: { fullName: FULL_NAME, status: "active" },
    create: {
      email: STUDENT_EMAIL,
      passwordHash,
      role: "student",
      status: "active",
      fullName: FULL_NAME,
      lrn: LRN,
    },
    select: { id: true },
  });

  const takenMascots = await sectionTakenMascots(prisma, section.id);
  const mascot = mascotForUnique(FULL_NAME, LRN, takenMascots);
  const profile = await prisma.studentProfile.upsert({
    where: { lrn: LRN },
    update: { sectionId: section.id, gradeLevel: section.gradeLevel, mascot },
    create: {
      userId: user.id,
      lrn: LRN,
      gradeLevel: section.gradeLevel,
      sectionId: section.id,
      birthdate: BIRTHDATE,
      gender: "male",
      address: ADDRESS,
      mascot,
    },
    select: { userId: true },
  });
  await prisma.studentRoster.update({ where: { id: roster.id }, data: { mascot } });
  // Reuse the profile that owns the LRN (a earlier run may have linked it to a
  // different account than the one upserted above).
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
        descriptionOfLocation: `Room 203, ${section.name} classroom (2nd floor, main building)`,
        descriptionOfIncident:
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
        notesRecommendationsActions:
          "Referred for ADM consultation. Requested a home visit to confirm the family's situation, " +
          "modular delivery of the current quarter's lessons, and a check on whether the learner has " +
          "a device he can use at night. Adviser will keep the learner's outputs in one folder for the " +
          "coordinator to review.",
        attachmentUrl: `${DRIVE}/anecdotal-form-rafsantillan.pdf`,
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
  const absenceDays = [56, 52, 49, 44, 41];
  for (const n of absenceDays) {
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
        reason:
          "ADM consultation — recurring unexcused absences tied to evening work at the family stall; " +
          "learner needs modular delivery, a device to study at night, and parent-conference follow-up.",
        consultReviewer: "guidance_counselor",
        consultReviewedAt: daysAgo(55, 10, 15),
        referralFormReady: true,
        status: "in_progress",
        priority: "high",
        intakeNotes:
          "Guidance reviewed the anecdote and the attendance sheet. Learner is not a discipline case; " +
          "the barrier is time and money at home. Endorsed to ADM with a request for device support.",
        acceptedAt: daysAgo(54, 9, 5),
        notes: "Parent (mother) reached on 25 Sep; she agreed to a school conference and a home visit.",
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
        venue: "Guidance Office",
        status: "completed",
        completedAt: daysAgo(50, 15, 5),
        sessionNotes:
          "Conference with the mother, Mrs. Lourdes Santillan. She confirmed the father works in " +
          "Davao City and sends money irregularly; the learner helps at the stall from 6 p.m. to " +
          "10 p.m. on weekdays. The learner said he studies on a borrowed phone and loses files when " +
          "the data runs out. Mother is open to a modular setup and to a home visit.",
        outcome:
          "Agreed to: (1) ADM endorsement with module delivery, (2) mother to keep a nightly study " +
          "window from 7–9 p.m., (3) device request forwarded to the coordinator.",
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
        complaint: "Headache and dizziness after the morning break; reports sleeping around 11 p.m.",
        diagnosis: "Tension headache with mild fatigue; no fever, no visual disturbance.",
        treatmentGiven:
          "Rested 30 minutes in the clinic, oral rehydration, advised 20-minute screen breaks and " +
          "at least 7 hours of sleep. Parent notified by text. No medication given.",
        recordedBy: nurse.id,
        termId: term.id,
        confidentialityLevel: "restricted",
      },
    });
  }

  // ---- 7. Coordinator: home visitation (the parent meeting is booked on the
  // case profile in step 8, once that profile exists) ----
  const hasHomeVisit = await prisma.homeVisitationRecord.findFirst({
    where: { studentId, referralId: referral.id },
    select: { id: true },
  });
  if (!hasHomeVisit) {
    await prisma.homeVisitationRecord.create({
      data: {
        studentId,
        referralId: referral.id,
        personVisited: `${GUARDIAN} (mother) and the learner`,
        homeCondition:
          "Single-storey concrete house rented at Purok 3, two rooms, electricity connected. The " +
          "learner studies at the dining table beside the front window; one bulb, no desk lamp.",
        familyCondition:
          "Father works out of town and sends support irregularly. Mother runs a small puto stall " +
          "and is the learner's primary guardian. Two younger siblings in elementary school.",
        agreements:
          "Study window 7–9 p.m. daily; modules kept in a rigid envelope to stay dry; mother will " +
          "text the adviser every Friday with the week's outputs; coordinator to follow up on the " +
          "device within one week.",
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
          recommendation:
            "Home-based ADM with modular delivery for the rest of the quarter. Weekly module tracking " +
            "by the adviser, device loan (tablet + pocket Wi-Fi) for evening study, and a review at the " +
            "end of the quarter against the learner's outputs and attendance record.",
          certifiedBy: adm.id,
          certifiedAt: daysAgo(33, 15, 40).toISOString(),
          eligibilityBasis: {
            parentMeetingAttended: true,
            homeVisitationConducted: true,
            documentsVerified: ["REFERRAL_FORM", "ANECDOTAL_REPORT", "MINUTES_OF_MEETING", "HV_FORM"],
          },
        },
      },
      select: { id: true },
    }));

  // ---- 8b. Parent meeting, owned by the case profile (the meeting the
  // certification is based on — the desks read it off the profile) ----
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
          minutesOfMeeting:
            "1. Coordinator explained the ADM program and what it changes (modular delivery, weekly " +
            "module tracking, device on loan).\n" +
            "2. Mother confirmed the household situation and the learner's evening work at the stall.\n" +
            "3. Agreed study schedule: modules in the evening after 7 p.m., outputs passed every " +
            "Friday to the adviser.\n" +
            "4. Device loan discussed (tablet + pocket Wi-Fi); parent signed the borrower's slip.\n" +
            "5. Home visit set for the following week to see the study space.\n" +
            "6. Review date: end of the quarter, with the adviser's module report as the basis.",
          attendanceLogbookRef: "ADM-LB-2026-0148",
          attendees: [
            { name: GUARDIAN, role: "parent_guardian" },
            { name: adm.fullName, role: "other", userId: adm.id },
            { name: adviser.fullName, role: "teacher", userId: adviserId },
            { name: guidance.fullName, role: "guidance_counselor", userId: guidance.id },
            { name: FULL_NAME, role: "student", userId: studentId },
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

  const forms: Array<{ formType: "REFERRAL_FORM" | "ANECDOTAL_REPORT" | "CERTIFICATION" | "MINUTES_OF_MEETING" | "HV_FORM" | "PRINCIPAL_SIGNAGE"; title: string; fileUrl: string | null; uploadedAt: Date; notes: string }> = [
    {
      formType: "REFERRAL_FORM",
      title: "GCForm-03 · ADM Referral Form",
      fileUrl: `${DRIVE}/gcform03-rafsantillan.pdf`,
      uploadedAt: daysAgo(55, 10, 30),
      notes: "Signed by the adviser; endorsed to ADM after guidance consultation.",
    },
    {
      formType: "ANECDOTAL_REPORT",
      title: "Anecdotal Report (signed)",
      fileUrl: `${DRIVE}/anecdotal-form-rafsantillan.pdf`,
      uploadedAt: daysAgo(58, 16, 15),
      notes: "Adviser-signed anecdotal record behind the referral.",
    },
    {
      formType: "MINUTES_OF_MEETING",
      title: "Minutes of Meeting · Parent Conference",
      fileUrl: `${DRIVE}/adm-minutes-2026-0148.pdf`,
      uploadedAt: daysAgo(38, 11, 30),
      notes: "Logbook ref ADM-LB-2026-0148; six action items, all accepted by the mother.",
    },
    {
      formType: "HV_FORM",
      title: "Home Visitation Form",
      fileUrl: `${DRIVE}/adm-home-visitation.pdf`,
      uploadedAt: daysAgo(36, 14, 0),
      notes: "Signed by the mother, the learner, and the coordinator.",
    },
    {
      formType: "CERTIFICATION",
      title: "ADM Certification & Recommendation",
      fileUrl: `${DRIVE}/adm-certification-rafsantillan.pdf`,
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
  const devices = [
    {
      deviceType: "Learning tablet · 10.1\" Android 14, 64GB",
      deviceSerial: "ZNT-ADM-2026-0416",
      issuedDate: daysAgo(31, 9, 50),
      conditionNotes:
        "Unit in good condition, screen protector applied. Pre-loaded with the DepEd Commons offline " +
        "pack and this quarter's modules in PDF. Borrower's slip signed by the mother.",
    },
    {
      deviceType: "Pocket Wi-Fi router · 4G LTE with 15GB monthly data",
      deviceSerial: "ZNT-ADM-2026-0417",
      issuedDate: daysAgo(31, 10, 5),
      conditionNotes:
        "Issued with the tablet so modules can be downloaded at home. Data plan renews on the 5th; " +
        "return due at the end of the term or when the case closes.",
    },
  ];
  for (const d of devices) {
    const exists = await prisma.admDevice.findFirst({
      where: { admLearnerProfileId: admProfile.id, deviceSerial: d.deviceSerial },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.admDevice.create({
      data: {
        admLearnerProfileId: admProfile.id,
        deviceType: d.deviceType,
        deviceSerial: d.deviceSerial,
        issuedBy: adm.id,
        issuedDate: d.issuedDate,
        conditionNotes: d.conditionNotes,
      },
    });
  }

  // ---- 10. Modules released for the case (mixed submission) ----
  const modules = [
    {
      moduleName: "Week 1 · English — Context Clues and Text Structure",
      releaseDate: daysAgo(28, 8, 0),
      dueDate: daysAgo(21, 17, 0),
      submitted: true,
      submissionDate: daysAgo(22, 19, 30),
      submissionUrl: `${DRIVE}/module1-english-answered.pdf`,
      studentSubmissionUrl: `${DRIVE}/module1-english-rafsantillan.pdf`,
      remarks: "Complete. Minor errors in items 4 and 9; corrected during the Friday check-in.",
    },
    {
      moduleName: "Week 2 · Mathematics — Linear Equations",
      releaseDate: daysAgo(21, 8, 0),
      dueDate: daysAgo(14, 17, 0),
      submitted: true,
      submissionDate: daysAgo(15, 20, 10),
      submissionUrl: `${DRIVE}/module2-math-answered.pdf`,
      studentSubmissionUrl: `${DRIVE}/module2-math-rafsantillan.pdf`,
      remarks: "Submitted late (1 day). Work is complete; two solutions needed re-teaching.",
    },
    {
      moduleName: "Week 3 · Science — Forces in Daily Life",
      releaseDate: daysAgo(14, 8, 0),
      dueDate: daysAgo(7, 17, 0),
      submitted: true,
      submissionDate: daysAgo(8, 18, 45),
      submissionUrl: `${DRIVE}/module3-science-answered.pdf`,
      studentSubmissionUrl: `${DRIVE}/module3-science-rafsantillan.pdf`,
      remarks: "Good explanation of the tricycle example; activity 3 submitted on time.",
    },
    {
      moduleName: "Week 4 · Araling Panlipunan — Kabihasnang Klasikal",
      releaseDate: daysAgo(7, 8, 0),
      dueDate: daysAgo(-1, 17, 0), // still open — the monitoring board has live work
      submitted: false,
      submissionDate: null,
      submissionUrl: null,
      studentSubmissionUrl: null,
      remarks: "Released Friday. Learner picked up the printed copy; due end of the week.",
    },
  ];
  for (const m of modules) {
    const exists = await prisma.admModule.findFirst({
      where: { admLearnerProfileId: admProfile.id, moduleName: m.moduleName },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.admModule.create({
      data: {
        admLearnerProfileId: admProfile.id,
        moduleName: m.moduleName,
        releaseDate: m.releaseDate,
        dueDate: m.dueDate,
        submitted: m.submitted,
        submissionDate: m.submissionDate,
        submissionUrl: m.submissionUrl,
        studentSubmissionUrl: m.studentSubmissionUrl,
        remarks: m.remarks,
        recordedBy: adviserId,
      },
    });
  }

  // ---- 11. Section-wide ADM module (the desk merges these with case modules) ----
  const advisoryModule = await prisma.advisoryModule.findFirst({
    where: { sectionId: section.id, termId: term.id, kind: "adm", moduleName: "ADM Quarter 2 · Learning Package" },
    select: { id: true },
  });
  const advisoryModuleId =
    advisoryModule?.id ??
    (
      await prisma.advisoryModule.create({
        data: {
          sectionId: section.id,
          termId: term.id,
          kind: "adm",
          moduleName: "ADM Quarter 2 · Learning Package",
          moduleUrl: `${DRIVE}/adm-q2-package`,
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

  const hasSubmission = await prisma.advisoryModuleSubmission.findFirst({
    where: { moduleId: advisoryModuleId, studentId },
    select: { id: true },
  });
  if (!hasSubmission) {
    await prisma.advisoryModuleSubmission.create({
      data: {
        moduleId: advisoryModuleId,
        studentId,
        rosterId: null,
        submissionKind: "physical",
        submitted: true,
        submittedAt: daysAgo(20, 16, 20),
        remarks: "Weeks 1–2 passed in person at the Friday check-in; week 3 scanned to the adviser.",
        recordedBy: adviserId,
      },
    });
  }

  // ---- 12. Audit trail for the case (what the desks' history panels read) ----
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
      sourceId: anecdote.id,
      reason: `${AUDIT_PREFIX}anecdotal record filed and adviser-signed (attendance)`,
      createdAt: daysAgo(58, 16, 12),
    },
    {
      actorId: guidance.id,
      actionType: "session_completed",
      sourceTable: "counseling_sessions",
      sourceId: referral.id,
      reason: `${AUDIT_PREFIX}parent conference completed by guidance (referral ${referral.id})`,
      createdAt: daysAgo(50, 15, 6),
    },
    {
      actorId: adm.id,
      actionType: "referral_adm_initiated",
      sourceTable: "referrals",
      sourceId: referral.id,
      reason: `${AUDIT_PREFIX}ADM consultation endorsed to the coordinator after guidance review`,
      createdAt: daysAgo(54, 9, 6),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}parent meeting logged (attended) — ADM-LB-2026-0148`,
      createdAt: daysAgo(38, 11, 35),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}home visitation recorded and certified by the coordinator`,
      createdAt: daysAgo(36, 14, 5),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}coordinator certification created and endorsed to the Principal`,
      createdAt: daysAgo(33, 15, 45),
    },
    {
      actorId: principal.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}Principal signed — ADM approved, case moved to enrollment monitoring`,
      createdAt: daysAgo(32, 11, 25),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_devices",
      sourceId: "ZNT-ADM-2026-0416",
      reason: `${AUDIT_PREFIX}learning tablet issued on loan (borrower's slip signed)`,
      createdAt: daysAgo(31, 9, 52),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_devices",
      sourceId: "ZNT-ADM-2026-0417",
      reason: `${AUDIT_PREFIX}pocket Wi-Fi with 15GB data plan issued on loan`,
      createdAt: daysAgo(31, 10, 7),
    },
  ];
  for (const row of auditRows) {
    const exists = await prisma.auditLog.findFirst({
      where: { reason: row.reason },
      select: { id: true },
    });
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

  const submittedCount = modules.filter((m) => m.submitted).length;
  console.log(`Seeded 1 enrolled ADM learner in ${schoolYear.name} · Term ${term.termNumber}:`);
  console.log(`  ${FULL_NAME} (LRN ${LRN})`);
  console.log(`  Section: ${section.name} (G${section.gradeLevel.slice(1)}) · adviser ${adviser.fullName}`);
  console.log(`  ADM case: ${admProfile.id} · stage enrollment_monitoring · approved by the Principal`);
  console.log(`  Coordinator certification: recorded (certified by ${adm.fullName})`);
  console.log(`  Devices: ${devices.length} issued (${devices.map((d) => d.deviceSerial).join(", ")})`);
  console.log(`  Modules: ${submittedCount}/${modules.length} submitted · parent meeting attended · home visit on file`);
  console.log(`  Anecdotal ${anecdote.id} · referral ${referral.id} · ${absenceDays.length} absences · clinic visit · guidance session`);
  console.log(`  This learner's ADM case is attendance-exempt from here on.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
