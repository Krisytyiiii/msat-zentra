import "dotenv/config";
import argon2 from "argon2";
import crypto from "crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { createPrismaAdapter } from "../src/lib/prismaAdapter.js";
import { mascotForUnique, sectionTakenMascots } from "../src/services/mascot.js";

/**
 * Seeds ONE fully-enrolled ADM learner into the advisory section of
 * Mrs. Marilou S. Guinto for the **2nd term** of the active school year.
 *
 * The case is complete end-to-end, so every desk that touches ADM has
 * something believable to open:
 *
 *   adviser      anecdotal record → ADM referral (endorsed by guidance)
 *   guidance     consultation triage + a completed parent conference
 *   nurse        clinic visit on the same learner
 *   coordinator  parent meeting (minutes + invitees), home visitation,
 *                modules, coordinator certification, issued devices
 *   principal    signed approval (case is attendance-exempt from there on)
 *   advisory     one `kind: adm` released module + a submitted answer
 *
 * The case ends at `enrollment_monitoring` (approved, devices out) so the
 * monitoring/module desks still have live work to show.
 *
 * Idempotent: keyed by LRN + fixed offsets from "now". `--reset` deletes the
 * seeded learner and everything hanging off them.
 *
 * Usage (from `backend/`):
 *   npx tsx prisma/seed-adm-guinto-term2.ts
 *   npx tsx prisma/seed-adm-guinto-term2.ts --reset
 */

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

const ADVISER_EMAIL = "adviser@zentra.test"; // Mrs. Marilou S. Guinto
const TERM_NUMBER = 2;

const LRN = "136512090187";
const FULL_NAME = "Mark Angelo P. Sabandal";
const GUARDIAN = "Mrs. Elena P. Sabandal";
const ADDRESS = "Purok 5, Barangay Dahican, Mati City, Davao Oriental";
const BIRTHDATE = new Date("2013-08-14T00:00:00.000Z");
const STUDENT_EMAIL = `${LRN}@adm-enrolled.local`;

/** Marker so `--reset` can find this seed's audit trail again. */
const AUDIT_PREFIX = "seed:adm-guinto-t2 · ";

/** 1x1 transparent PNG — stands in for the Principal's drawn signature PNG. */
const SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const DRIVE = "https://drive.google.com/drive/folders/zentra-adm-sabandal-t2";

function daysAgo(n: number, hour = 9, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
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
  const roster = await prisma.studentRoster.findFirst({
    where: { lrn: LRN },
    select: { id: true },
  });
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

  const term = await prisma.term.findFirst({
    where: { schoolYearId: schoolYear.id, termNumber: TERM_NUMBER },
    select: { id: true, termNumber: true, startDate: true, endDate: true },
  });
  if (!term) throw new Error(`Term ${TERM_NUMBER} not found in ${schoolYear.name}.`);

  const principal = await byRole("principal", ["principal@zentra.test"]);
  const adm = await byRole("adm_coordinator", [
    "adm@zentra.test",
    "adm_coordinator@zentra.test",
  ]);
  const guidance = await byRole("guidance_counselor", [
    "guidance@zentra.test",
    "guidance_counselor@zentra.test",
  ]);
  const nurse = await byRole("nurse", ["nurse@zentra.test"]);

  // ---- Section: the one Mrs. Marilou S. Guinto advises ----
  const adviser = await prisma.user.findFirst({
    where: { email: ADVISER_EMAIL },
    select: { id: true, fullName: true },
  });
  if (!adviser) throw new Error(`Adviser account ${ADVISER_EMAIL} not found.`);

  const section = await prisma.section.findFirst({
    where: { adviserId: adviser.id, schoolYearId: schoolYear.id },
    select: { id: true, name: true, gradeLevel: true },
    orderBy: { name: "asc" },
  });
  if (!section) {
    throw new Error(
      `${adviser.fullName} has no advisory section in ${schoolYear.name} — claim one first.`,
    );
  }
  const adviserId = adviser.id;

  // ---- 1. Enrol the learner (roster + account + profile) ----
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
  const studentId = profile.userId;

  // ---- 2. Anecdotal record (what the adviser actually saw) ----
  const anecdoteDate = daysAgo(40, 9, 15);
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
        descriptionOfLocation: `Room 205, ${section.name} classroom (second floor, main building)`,
        descriptionOfIncident:
          "Mark Angelo has missed eleven school days since the term opened on 16 September. On " +
          "15 October he arrived at 10:05 a.m. carrying a plastic bag of dried fish he said he had to " +
          "deliver to the market before coming to school. He fell asleep during the Filipino quiz and " +
          "left items 8–15 blank. When asked after class he said he now goes with his mother to the " +
          "Dahican shoreline at dawn to buy fish for their stall, and that he reviews his notes only " +
          "when he gets home in the evening.",
        classPerformance:
          "Filipino and Araling Panlipunan scores slid from the 85–88 range in the first term to " +
          "73–76 in the latest written work. Four of the last seven outputs were submitted late, and " +
          "his project in Science was turned in two weeks after the deadline.",
        attendanceSummary:
          "Eleven absences this term, all unexcused (19 Sep, 24 Sep, 29 Sep, 2 Oct, 8 Oct, 13 Oct, " +
          "15 Oct, 21 Oct, 27 Oct, 3 Nov, 10 Nov). Five tardies. The number on the enrolment form " +
          "belongs to the mother but calls went unanswered twice; a text message was read without a " +
          "reply.",
        notesRecommendationsActions:
          "Referred for ADM consultation. Requested a home visit in Purok 5, modular delivery of the " +
          "current term's lessons, and a check on whether the learner can study with a device in the " +
          "evening. Adviser will keep his written outputs in one folder for the coordinator.",
        attachmentUrl: `${DRIVE}/anecdotal-form-sabandal.pdf`,
        category: "attendance",
        confidentialityLevel: "restricted",
        termId: term.id,
        signedBy: adviserId,
        signedAt: daysAgo(40, 16, 20),
        signatureImageUrl: SIGNATURE_DATA_URL,
      },
      select: { id: true },
    }));

  // ---- 3. Recorded absences behind the anecdote (pre-approval history) ----
  const absenceDays = [39, 34, 28, 22, 16];
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
          "ADM consultation — recurring unexcused absences because the learner helps at the family " +
          "fish stall at dawn; needs modular delivery, a device for evening study, and parent follow-up.",
        consultReviewer: "guidance_counselor",
        consultReviewedAt: daysAgo(37, 10, 25),
        referralFormReady: true,
        status: "in_progress",
        priority: "high",
        intakeNotes:
          "Guidance reviewed the anecdote and the attendance sheet. This is not a discipline case — " +
          "the barrier is the dawn market run and the lack of a study device. Endorsed to ADM with a " +
          "request for device support.",
        acceptedAt: daysAgo(36, 9, 10),
        notes:
          "Mother reached on 19 October; she agreed to a school conference and a home visit in Purok 5.",
        studentId,
        rosterId: null,
        termId: term.id,
      },
      select: { id: true },
    }));

  // ---- 5. Guidance: one completed parent conference on the case ----
  const sessionAt = daysAgo(34, 14, 0);
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
        completedAt: daysAgo(34, 15, 10),
        sessionNotes:
          "Conference with the mother, Mrs. Elena Sabandal. She confirmed the family buys fish at " +
          "the Dahican shoreline at 4 a.m. and that Mark Angelo helps carry and sell until the " +
          "market opens. He shares one phone with two siblings and loses his saved modules when the " +
          "load runs out. Mother is open to modular delivery and to a home visit.",
        outcome:
          "Agreed to: (1) ADM endorsement with module delivery, (2) a fixed study window from 7–9 p.m., " +
          "(3) device request forwarded to the coordinator, (4) adviser to text progress every Friday.",
        createdBy: guidance.id,
      },
    });
  }

  // ---- 6. Nurse: clinic visit on the same learner ----
  const visitAt = daysAgo(31, 13, 5);
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
        complaint:
          "Dizziness and eye strain after the morning break; reports sleeping around midnight and " +
          "waking at 3:30 a.m. for the market run.",
        diagnosis:
          "Mild fatigue with eye strain; no fever, normal blood pressure, no visual disturbance.",
        treatmentGiven:
          "Rested 30 minutes in the clinic, oral rehydration, advised 20-minute screen breaks and " +
          "at least 7 hours of sleep. Mother notified by text. No medication given.",
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
        personVisited: `${GUARDIAN} (mother) and the learner`,
        homeCondition:
          "Two-room wooden house on rented lot at Purok 5, electricity connected. The learner studies " +
          "at a low table beside the door; one bulb, no desk lamp. Modules are kept in a plastic " +
          "container under the bed to stay dry.",
        familyCondition:
          "Mother runs a fish stall at the public market and is the learner's primary guardian. " +
          "Father works as a boat crewman in Mati and is home only on weekends. Three younger " +
          "siblings, two in elementary school.",
        agreements:
          "Study window 7–9 p.m. daily; modules kept in the plastic container; mother will text the " +
          "adviser every Friday with the week's outputs; coordinator to follow up on the device within " +
          "one week.",
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
        approvedAt: daysAgo(15, 11, 15),
        certificationDetails: {
          recommendation:
            "Home-based ADM with modular delivery for the rest of the second term. Weekly module " +
            "tracking by the adviser, device loan (tablet + pocket Wi-Fi) for evening study, and a " +
            "review at the end of the term against the learner's outputs and attendance record.",
          certifiedBy: adm.id,
          certifiedAt: daysAgo(18, 15, 30).toISOString(),
          eligibilityBasis: {
            parentMeetingAttended: true,
            homeVisitationConducted: true,
            documentsVerified: [
              "REFERRAL_FORM",
              "ANECDOTAL_REPORT",
              "MINUTES_OF_MEETING",
              "HV_FORM",
            ],
          },
        },
      },
      select: { id: true },
    }));

  // ---- 8b. Parent meeting owned by the case profile ----
  const meetingAt = daysAgo(26, 10, 0);
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
          parentConfirmedAt: daysAgo(27, 16, 40),
          minutesOfMeeting:
            "1. Coordinator explained the ADM program and what it changes (modular delivery, weekly " +
            "module tracking, device on loan).\n" +
            "2. Mother confirmed the dawn market routine and the learner's evening study window.\n" +
            "3. Agreed schedule: modules in the evening after 7 p.m., outputs passed every Friday to " +
            "the adviser.\n" +
            "4. Device loan discussed (tablet + pocket Wi-Fi); parent signed the borrower's slip.\n" +
            "5. Home visit set for the following week to see the study space.\n" +
            "6. Review date: end of the second term, with the adviser's module report as the basis.",
          attendanceLogbookRef: "ADM-LB-2026-0173",
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
      create: { meetingId, userId: invitee, invitedAt: daysAgo(29, 8, 45) },
    });
  }

  const forms: Array<{
    formType:
      | "REFERRAL_FORM"
      | "ANECDOTAL_REPORT"
      | "CERTIFICATION"
      | "MINUTES_OF_MEETING"
      | "HV_FORM"
      | "PRINCIPAL_SIGNAGE";
    title: string;
    fileUrl: string | null;
    uploadedAt: Date;
    notes: string;
  }> = [
    {
      formType: "REFERRAL_FORM",
      title: "GCForm-03 · ADM Referral Form",
      fileUrl: `${DRIVE}/gcform03-sabandal.pdf`,
      uploadedAt: daysAgo(37, 10, 40),
      notes: "Signed by the adviser; endorsed to ADM after guidance consultation.",
    },
    {
      formType: "ANECDOTAL_REPORT",
      title: "Anecdotal Report (signed)",
      fileUrl: `${DRIVE}/anecdotal-form-sabandal.pdf`,
      uploadedAt: daysAgo(40, 16, 25),
      notes: "Adviser-signed anecdotal record behind the referral.",
    },
    {
      formType: "MINUTES_OF_MEETING",
      title: "Minutes of Meeting · Parent Conference",
      fileUrl: `${DRIVE}/adm-minutes-2026-0173.pdf`,
      uploadedAt: daysAgo(26, 11, 25),
      notes: "Logbook ref ADM-LB-2026-0173; six action items, all accepted by the mother.",
    },
    {
      formType: "HV_FORM",
      title: "Home Visitation Form",
      fileUrl: `${DRIVE}/adm-home-visitation-sabandal.pdf`,
      uploadedAt: daysAgo(24, 14, 10),
      notes: "Signed by the mother, the learner, and the coordinator.",
    },
    {
      formType: "CERTIFICATION",
      title: "ADM Certification & Recommendation",
      fileUrl: `${DRIVE}/adm-certification-sabandal.pdf`,
      uploadedAt: daysAgo(18, 15, 55),
      notes:
        "Coordinator certification — program fit, period covered, and the device recommendation.",
    },
    {
      formType: "PRINCIPAL_SIGNAGE",
      title: "Principal Signage",
      fileUrl: SIGNATURE_DATA_URL,
      uploadedAt: daysAgo(15, 11, 15),
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
      deviceType: 'Learning tablet · 10.1" Android 14, 64GB',
      deviceSerial: "ZNT-ADM-2026-0532",
      issuedDate: daysAgo(14, 9, 45),
      conditionNotes:
        "Unit in good condition, screen protector applied. Pre-loaded with the DepEd Commons offline " +
        "pack and this term's modules in PDF. Borrower's slip signed by the mother.",
    },
    {
      deviceType: "Pocket Wi-Fi router · 4G LTE with 15GB monthly data",
      deviceSerial: "ZNT-ADM-2026-0533",
      issuedDate: daysAgo(14, 10, 0),
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
      moduleName: "Week 1 · Filipino — Maikling Kuwento at Pananalita",
      releaseDate: daysAgo(12, 8, 0),
      dueDate: daysAgo(9, 17, 0),
      submitted: true,
      submissionDate: daysAgo(9, 19, 20),
      submissionUrl: `${DRIVE}/module1-filipino-answered.pdf`,
      studentSubmissionUrl: `${DRIVE}/module1-filipino-sabandal.pdf`,
      remarks: "Complete. Items 3 and 7 corrected during the Friday check-in.",
    },
    {
      moduleName: "Week 2 · Mathematics — Rational Numbers",
      releaseDate: daysAgo(9, 8, 0),
      dueDate: daysAgo(6, 17, 0),
      submitted: true,
      submissionDate: daysAgo(5, 20, 5),
      submissionUrl: `${DRIVE}/module2-math-answered.pdf`,
      studentSubmissionUrl: `${DRIVE}/module2-math-sabandal.pdf`,
      remarks: "Submitted one day late. Work is complete; two solutions needed re-teaching.",
    },
    {
      moduleName: "Week 3 · Araling Panlipunan — Heograpiya ng Asya",
      releaseDate: daysAgo(6, 8, 0),
      dueDate: daysAgo(3, 17, 0),
      submitted: false,
      submissionDate: null,
      submissionUrl: null,
      studentSubmissionUrl: null,
      remarks: "Released Friday; learner picked up the printed copy at the market drop-off.",
    },
    {
      moduleName: "Week 4 · Science — Ecosystem Interactions",
      releaseDate: daysAgo(2, 8, 0),
      dueDate: daysAgo(-4, 17, 0), // still open — the monitoring board has live work
      submitted: false,
      submissionDate: null,
      submissionUrl: null,
      studentSubmissionUrl: null,
      remarks: "Due end of the week. Learner has the printed copy and the PDF on the loaned tablet.",
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
    where: {
      sectionId: section.id,
      termId: term.id,
      kind: "adm",
      moduleName: "ADM Term 2 · Learning Package",
    },
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
          moduleName: "ADM Term 2 · Learning Package",
          moduleUrl: `${DRIVE}/adm-t2-package`,
          description:
            "Printed + digital package for learners on ADM this term: one module per week per " +
            "subject, answer sheets, and the submission schedule.",
          releaseDate: daysAgo(12, 8, 0),
          dueDate: daysAgo(-10, 17, 0),
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
        submittedAt: daysAgo(6, 16, 15),
        remarks: "Weeks 1–2 passed in person at the Friday market drop-off; week 3 scanned to the adviser.",
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
      createdAt: daysAgo(40, 16, 22),
    },
    {
      actorId: adm.id,
      actionType: "referral_adm_initiated",
      sourceTable: "referrals",
      sourceId: referral.id,
      reason: `${AUDIT_PREFIX}ADM consultation endorsed to the coordinator after guidance review`,
      createdAt: daysAgo(36, 9, 12),
    },
    {
      actorId: guidance.id,
      actionType: "session_completed",
      sourceTable: "counseling_sessions",
      sourceId: referral.id,
      reason: `${AUDIT_PREFIX}parent conference completed by guidance (referral ${referral.id})`,
      createdAt: daysAgo(34, 15, 11),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}parent meeting logged (attended) — ADM-LB-2026-0173`,
      createdAt: daysAgo(26, 11, 30),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}home visitation recorded and certified by the coordinator`,
      createdAt: daysAgo(24, 14, 15),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}coordinator certification created and endorsed to the Principal`,
      createdAt: daysAgo(18, 15, 58),
    },
    {
      actorId: principal.id,
      actionType: "adm_edit",
      sourceTable: "adm_learner_profiles",
      sourceId: admProfile.id,
      reason: `${AUDIT_PREFIX}Principal signed — ADM approved, case moved to enrollment monitoring`,
      createdAt: daysAgo(15, 11, 18),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_devices",
      sourceId: "ZNT-ADM-2026-0532",
      reason: `${AUDIT_PREFIX}learning tablet issued on loan (borrower's slip signed)`,
      createdAt: daysAgo(14, 9, 47),
    },
    {
      actorId: adm.id,
      actionType: "adm_edit",
      sourceTable: "adm_devices",
      sourceId: "ZNT-ADM-2026-0533",
      reason: `${AUDIT_PREFIX}pocket Wi-Fi with 15GB data plan issued on loan`,
      createdAt: daysAgo(14, 10, 2),
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
  console.log(
    `  Section: ${section.name} (${section.gradeLevel}) · adviser ${adviser.fullName}`,
  );
  console.log(`  ADM case: ${admProfile.id} · stage enrollment_monitoring · approved by the Principal`);
  console.log(`  Coordinator certification: recorded (certified by ${adm.fullName})`);
  console.log(
    `  Devices: ${devices.length} issued (${devices.map((d) => d.deviceSerial).join(", ")})`,
  );
  console.log(
    `  Modules: ${submittedCount}/${modules.length} submitted · parent meeting attended · home visit on file`,
  );
  console.log(
    `  Anecdotal ${anecdote.id} · referral ${referral.id} · ${absenceDays.length} absences · clinic visit · guidance session`,
  );
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
