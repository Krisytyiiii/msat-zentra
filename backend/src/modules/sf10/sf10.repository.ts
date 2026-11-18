import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { GRADE_BAND_11_12, GRADE_BAND_7_10, deskForRole } from "../../lib/roles.js";
import { GRADE_LABELS, GRADE_ORDER as ORDER } from "../../lib/grades.js";

export const ROLE_GRADE_BAND: Record<string, string[]> = {
  registrar: [...GRADE_BAND_11_12],
  record_keeper: [...GRADE_BAND_7_10],
};

export async function resolveGradeBand(role: string, userId: string): Promise<string[]> {
  if (ROLE_GRADE_BAND[role]) return ROLE_GRADE_BAND[role];
  const staff = await prisma.staffProfile.findUnique({
    where: { userId },
    select: { handledGradeLevels: true },
  });
  return staff?.handledGradeLevels ?? [];
}

export const GRADE_ORDER = ORDER;
export const GRADE_LABEL = GRADE_LABELS;

/**
 * Desk-scoped access for a single record: registrar/record_keeper may only
 * touch records filed under their own desk (an upload is visible only to
 * the desk that filed it). Roles without a desk keep the old grade-band
 * rule so adviser/principal access is unchanged.
 */
export async function assertDeskAccess(
  recordDesk: string,
  user: { userId: string; role: string },
  recordGrade: string | null,
) {
  const desk = deskForRole(user.role);
  if (desk) {
    if (recordDesk !== desk) {
      throw new AppError(403, "DESK_SCOPE", "This record was filed by the other desk");
    }
    return;
  }
  // A stored file may not classify a grade (a partial/blank form). The band
  // can then only be judged by the desk the file was filed under, so skip.
  if (!recordGrade) return;
  const band = await resolveGradeBand(user.role, user.userId);
  if (band.length > 0 && !band.includes(recordGrade)) {
    throw new AppError(403, "GRADE_SCOPE", "You do not handle this record's grade level");
  }
}

/** Load a record and enforce desk-scoped access in one step. */
export async function assertRecordAccess(recordId: string, user: { userId: string; role: string }) {
  const record = await prisma.sf10Record.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      lrn: true,
      learnerName: true,
      gradeLevel: true,
      desk: true,
      status: true,
      verifiedBy: true,
      currentVersion: true,
      ocrExtractedData: true,
      uploadedFileUrl: true,
    },
  });
  if (!record) throw new AppError(404, "NOT_FOUND", "SF10 record not found");
  await assertDeskAccess(record.desk, user, record.gradeLevel ? String(record.gradeLevel) : null);
  return record;
}

/**
 * Adviser gate for approved SF10 read/download/edit: the adviser must hold an
 * approved `adviser_sf10_access_requests` row for the learner. Access is keyed
 * by LRN, not by the profile's section/grade — an SF10 record is linked to the
 * advisee purely through the shared LRN, and the record owner's enrollment
 * fields are never rewritten by the grant. Non-adviser roles are unaffected
 * (their existing desk/grade checks apply).
 */
export async function assertAdviserSf10Access(userId: string, recordId: string) {
  const record = await prisma.sf10Record.findUnique({
    where: { id: recordId },
    select: { id: true, lrn: true },
  });
  if (!record) throw new AppError(404, "NOT_FOUND", "SF10 record not found");
  const lrn = record.lrn;
  // The record is keyed by LRN; the owning account may or may not exist. When
  // it does, its section still counts as covered by a whole-request approval.
  const profile = await prisma.studentProfile.findUnique({
    where: { lrn },
    select: { sectionId: true },
  });
  const sectionId = profile?.sectionId ?? null;
  // A per-student "approve" keeps the request pending but writes the LRN into
  // approvedLrns — that is an explicit grant for this learner wherever the
  // record is filed. Whole-request approval covers every advisee on the
  // request's section roster (plus the owner's section when it is still set).
  const grant = await prisma.adviserSf10AccessRequest.findFirst({
    where: {
      adviserId: userId,
      OR: [
        { approvedLrns: { has: lrn } },
        { status: "approved", section: { rosterEntries: { some: { lrn } } } },
        ...(sectionId ? [{ status: "approved" as const, sectionId }] : []),
      ],
    },
    select: { id: true },
  });
  if (!grant) throw new AppError(403, "FORBIDDEN", "Approved SF10 access is required");
  return grant;
}
