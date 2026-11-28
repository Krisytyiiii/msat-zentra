import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { writeAudit } from "../../lib/audit.js";
import { fanoutNotification, fanoutToRole } from "../../lib/notify.js";
import { GRADE_BAND_7_10 } from "../../lib/roles.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedProfiles,
  excludeArchivedRosters,
} from "../../lib/learnerVisibility.js";
import type { GradeLevel } from "../../generated/prisma/client.js";

export interface MyAccessRequest {
  id: string;
  sectionId: string;
  section: string;
  gradeLevel: GradeLevel;
  reason: string;
  requestedLrns: string[];
  status: "pending" | "approved" | "denied";
  decisionReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  /** Term the request was filed in (null when the school year has no date ranges). */
  termNumber: number | null;
  total: number;
  has: number;
  missing: number;
}

export interface VerificationRecord {
  id: string;
  source: string;
  status: string;
  fileUrl: string | null;
  verifiedAt: string | null;
  validatedAt: string | null;
  currentVersion: number;
  /** Most recent Bama auto-fill render, kept separate from the original file. */
  autoFill: { fileUrl: string; version: number; at: string | null } | null;
}

export interface HasRow {
  lrn: string;
  name: string;
  mascot: string | null;
  hasAccount: boolean;
  gradeLevel: string;
  section: string;
  /** Advisory section the grant belongs to — the template endpoint needs it. */
  sectionId: string;
  sf10Status: "verified" | "validated" | "pending";
  /** Per-student grant (whole-request approval grants every row). */
  approved: boolean;
  /** ISO timestamp of the per-student grant, if granted individually. */
  approvedAt: string | null;
  /** Term the SF10 access was granted in — shared across the school year. */
  grantedTermNumber: number | null;
  record: VerificationRecord | null;
}

export interface MissingRow {
  lrn: string;
  name: string;
  mascot: string | null;
  hasAccount: boolean;
  gradeLevel: string;
  section: string;
}

function sf10StatusOf(status: string): HasRow["sf10Status"] {
  if (status === "released") return "validated";
  if (status === "available") return "verified";
  return "pending";
}

/**
 * Latest Bama auto-fill render for a record. Auto-fill never replaces the
 * uploaded file (the registrar/record keeper original stays in
 * `uploadedFileUrl`); each run stores its generated spreadsheet in the version
 * snapshot, so both files can be offered side by side.
 */
function autoFillOf(rec: {
  versions: Array<{ versionNumber: number; dataSnapshot: unknown; changedAt: Date }>;
}): VerificationRecord["autoFill"] {
  for (const v of rec.versions) {
    const snap = v.dataSnapshot as { engine?: string; generatedFileUrl?: string } | null;
    if (snap?.engine === "grading-auto-fill-v1" && typeof snap.generatedFileUrl === "string") {
      return {
        fileUrl: snap.generatedFileUrl,
        version: v.versionNumber,
        at: v.changedAt.toISOString(),
      };
    }
  }
  return null;
}

/** Pure helper (unit-tested): trim, drop empties, dedupe, cap at 200 picks. */
export function normalizePicks(input?: string[]): string[] {
  return [...new Set((input ?? []).map((l) => l.trim()).filter(Boolean))].slice(0, 200);
}

/** Pure helper (unit-tested): split LRN-matched rows into has / missing. */
export function partitionVerification(
  rows: Array<{ lrn: string; record: unknown | null }>,
): { has: number; missing: number; total: number } {
  let has = 0;
  for (const r of rows) if (r.record) has += 1;
  return { has, missing: rows.length - has, total: rows.length };
}

/**
 * Head-count only (no identities, no versions): the request list and the
 * create-notification only need has/missing. Reusing matchAdvisoryLrns here
 * pulled every SF10 version snapshot per advisee, which made listing N
 * requests cost N full board builds.
 */
async function countAdvisees(
  sectionId: string,
  onlyLrns?: Set<string>,
  lrnsPromise?: Promise<Set<string>>,
): Promise<{ total: number; has: number; missing: number }> {
  const all = [...(await (lrnsPromise ?? sectionLrns(sectionId)))];
  const wanted =
    onlyLrns && onlyLrns.size > 0 ? all.filter((l) => onlyLrns.has(l)) : all;
  if (wanted.length === 0) return { total: 0, has: 0, missing: 0 };
  // The SF10 store is keyed by LRN, not by a profile relation — a filed record
  // counts for an advisee whether or not that learner has an account.
  const withRecords = await prisma.sf10Record.findMany({
    where: { lrn: { in: wanted } },
    select: { lrn: true },
  });
  const has = new Set(withRecords.map((r) => r.lrn)).size;
  return { total: wanted.length, has, missing: wanted.length - has };
}

interface LrnMatch {
  lrn: string;
  name: string;
  mascot: string | null;
  hasAccount: boolean;
  gradeLevel: string;
  section: string;
  rec: {
    id: string;
    source: string;
    status: string;
    uploadedFileUrl: string | null;
    verifiedAt: Date | null;
    validatedAt: Date | null;
    currentVersion: number;
    versions: Array<{
      versionNumber: number;
      dataSnapshot: unknown;
      changeReason: string;
      changedAt: Date;
    }>;
  } | null;
}

interface Sf10RecordPick {
  lrn: string;
  desk: string;
}

/**
 * The record the advisory desk should read for a section: the one filed by the
 * desk that owns the section's grade band (G7–10 → record keeper, G11–12 →
 * registrar). The SF10 store is keyed by `[lrn, desk]`, so a learner can carry
 * a record on both desks (a legacy/manual upload on the other desk) — reading
 * "the first one" showed a stale record with no auto-fill renders while Bama
 * filed versions on the banded record. Same rule as `recordFor` in
 * `sf10-autofill.service.ts`, so the desk and the autofill always agree.
 */
function pickRecordForGrade<T extends Sf10RecordPick>(
  records: T[],
  gradeLevel: string | null | undefined,
): T | null {
  if (records.length === 0) return null;
  if (gradeLevel) {
    const desk = (GRADE_BAND_7_10 as string[]).includes(gradeLevel)
      ? "record_keeper"
      : "registrar";
    const match = records.find((r) => r.desk === desk);
    if (match) return match;
  }
  return records[0] ?? null;
}

/**
 * LRN-first matching: advisory LRNs come from the section (profiles + roster),
 * but the SF10 lookup runs by LRN across ALL profiles — a record counts even
 * when the profile sits in another section or none. Display identity prefers
 * the advisory-section name.
 */
async function matchAdvisoryLrns(
  sectionId: string,
  onlyLrns: Set<string>,
  sectionName: string,
  sectionGradeLevel?: string | null,
): Promise<LrnMatch[]> {
  const archivedLearners = await archivedAdvisoryLearnerIds();
  const [sectionProfiles, rosterEntries] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { sectionId, ...excludeArchivedProfiles(archivedLearners) },
      select: { lrn: true, mascot: true, gradeLevel: true, user: { select: { fullName: true } } },
      orderBy: { lrn: "asc" },
    }),
    prisma.studentRoster.findMany({
      where: { sectionId, ...excludeArchivedRosters(archivedLearners) },
      select: { lrn: true, fullName: true, mascot: true, gradeLevel: true },
      orderBy: { lrn: "asc" },
    }),
  ]);

  const identity = new Map<string, { name: string; mascot: string | null; gradeLevel: string }>();
  for (const p of sectionProfiles) {
    identity.set(p.lrn, { name: p.user.fullName, mascot: p.mascot ?? null, gradeLevel: String(p.gradeLevel) });
  }
  for (const r of rosterEntries) {
    if (!identity.has(r.lrn)) {
      identity.set(r.lrn, { name: r.fullName, mascot: r.mascot ?? null, gradeLevel: String(r.gradeLevel) });
    }
  }

  let lrns = [...identity.keys()];
  if (onlyLrns.size > 0) lrns = lrns.filter((l) => onlyLrns.has(l));
  if (lrns.length === 0) return [];

  const [global, records] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { lrn: { in: lrns } },
      select: {
        lrn: true,
        gradeLevel: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.sf10Record.findMany({
      where: { lrn: { in: lrns } },
      select: {
        lrn: true,
        id: true,
        desk: true,
        source: true,
        status: true,
        uploadedFileUrl: true,
        verifiedAt: true,
        validatedAt: true,
        currentVersion: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          select: {
            versionNumber: true,
            dataSnapshot: true,
            changeReason: true,
            changedAt: true,
          },
        },
      },
    }),
  ]);
  const byGlobal = new Map(global.map((g) => [g.lrn, g]));
  const recordsByLrn = new Map<string, (typeof records)[number][]>();
  for (const rec of records) {
    const list = recordsByLrn.get(rec.lrn) ?? [];
    list.push(rec);
    recordsByLrn.set(rec.lrn, list);
  }

  return lrns.sort().map((lrn) => {
    const ident = identity.get(lrn)!;
    const g = byGlobal.get(lrn);
    const rec =
      pickRecordForGrade(recordsByLrn.get(lrn) ?? [], sectionGradeLevel) ?? null;
    return {
      lrn,
      name: ident.name ?? g?.user.fullName ?? lrn,
      mascot: ident.mascot,
      hasAccount: !!g,
      gradeLevel: ident.gradeLevel ?? (g ? String(g.gradeLevel) : "—"),
      section: sectionName,
      rec: rec
        ? {
            id: rec.id,
            source: rec.source,
            status: rec.status,
            uploadedFileUrl: rec.uploadedFileUrl,
            verifiedAt: rec.verifiedAt,
            validatedAt: rec.validatedAt,
            currentVersion: rec.currentVersion,
            versions: rec.versions,
          }
        : null,
    };
  });
}

/** LRNs enlisted in a section (profiles + roster-only), for validating picks. */
async function sectionLrns(sectionId: string): Promise<Set<string>> {
  const archivedLearners = await archivedAdvisoryLearnerIds();
  const [profiles, roster] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { sectionId, ...excludeArchivedProfiles(archivedLearners) },
      select: { lrn: true },
    }),
    prisma.studentRoster.findMany({
      where: { sectionId, ...excludeArchivedRosters(archivedLearners) },
      select: { lrn: true },
    }),
  ]);
  return new Set([...profiles.map((p) => p.lrn), ...roster.map((r) => r.lrn)]);
}

interface YearTerm {
  termNumber: number;
  startDate: Date | null;
  endDate: Date | null;
}

/** Term date ranges grouped by school year, for dating non-term-scoped rows. */
async function termsBySchoolYear(yearIds: string[]): Promise<Map<string, YearTerm[]>> {
  const byYear = new Map<string, YearTerm[]>();
  if (yearIds.length === 0) return byYear;
  const terms = await prisma.term.findMany({
    where: { schoolYearId: { in: yearIds } },
    select: { schoolYearId: true, termNumber: true, startDate: true, endDate: true },
    orderBy: { termNumber: "asc" },
  });
  for (const t of terms) {
    const list = byYear.get(t.schoolYearId) ?? [];
    list.push({ termNumber: t.termNumber, startDate: t.startDate, endDate: t.endDate });
    byYear.set(t.schoolYearId, list);
  }
  return byYear;
}

function termNumberForDate(date: Date, terms: YearTerm[]): number | null {
  for (const t of terms) {
    if (t.startDate && t.endDate && t.startDate <= date && date <= t.endDate) {
      return t.termNumber;
    }
  }
  return null;
}

export async function listMyRequests(userId: string): Promise<{ requests: MyAccessRequest[] }> {
  const rows = await prisma.adviserSf10AccessRequest.findMany({
    where: { adviserId: userId },
    include: { section: { select: { id: true, name: true, schoolYearId: true } } },
    orderBy: [{ requestedAt: "desc" }],
  });
  const yearTerms = await termsBySchoolYear([
    ...new Set(
      rows
        .map((r) => r.section?.schoolYearId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ]);
  const requests: MyAccessRequest[] = [];
  // Every request that shares a section reuses one LRN lookup, and the
  // per-request counts resolve concurrently (was a serial N+1).
  const lrnsBySection = new Map<string, Promise<Set<string>>>();
  const lrnsFor = (sectionId: string) => {
    let p = lrnsBySection.get(sectionId);
    if (!p) {
      p = sectionLrns(sectionId);
      lrnsBySection.set(sectionId, p);
    }
    return p;
  };
  const built = await Promise.all(
    rows.map(async (r) => {
      const picked = new Set(r.requestedLrns ?? []);
      const counts = r.sectionId
        ? await countAdvisees(r.sectionId, picked, lrnsFor(r.sectionId))
        : { total: 0, has: 0, missing: 0 };
      return {
        id: r.id,
        sectionId: r.sectionId,
        section: r.section?.name ?? "Unsectioned",
        gradeLevel: r.gradeLevel as GradeLevel,
        reason: r.reason,
        requestedLrns: [...picked],
        status: r.status as MyAccessRequest["status"],
        decisionReason: r.decisionReason,
        requestedAt: r.requestedAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        termNumber: r.section
          ? termNumberForDate(r.requestedAt, yearTerms.get(r.section.schoolYearId) ?? [])
          : null,
        total: counts.total,
        has: counts.has,
        missing: counts.missing,
      } satisfies MyAccessRequest;
    }),
  );
  requests.push(...built);
  return { requests };
}

export async function createAccessRequest(
  userId: string,
  sectionId: string,
  reason: string,
  studentLrns?: string[],
) {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new AppError(400, "BAD_REQUEST", "Reason is required");
  if (trimmedReason.length > 500)
    throw new AppError(400, "BAD_REQUEST", "Reason must be 500 characters or fewer");

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, name: true, gradeLevel: true, adviserId: true, schoolYearId: true },
  });
  if (!section) throw new AppError(404, "NOT_FOUND", "Section not found");
  if (section.adviserId !== userId)
    throw new AppError(403, "FORBIDDEN", "You can only request access for your own advisory section");

  // Checkbox picks must be advisory LRNs of this section (profiles or roster).
  const picked = normalizePicks(studentLrns);
  if (picked.length > 0) {
    const valid = await sectionLrns(sectionId);
    const stray = picked.filter((l) => !valid.has(l));
    if (stray.length > 0)
      throw new AppError(400, "BAD_REQUEST", "Selected students must belong to your advisory section");
  }

  // Teachers may request anytime, even with a pending or approved request
  // on file — every submit creates a new request for the desk to decide.

  const adviser = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });

  const created = await prisma.adviserSf10AccessRequest.create({
    data: {
      adviserId: userId,
      sectionId,
      gradeLevel: section.gradeLevel as GradeLevel,
      reason: trimmedReason,
      requestedLrns: picked,
    },
    select: { id: true, status: true, requestedAt: true },
  });

  await writeAudit({
    userId,
    actionType: "create",
    sourceTable: "adviser_sf10_access_requests",
    sourceId: created.id,
    reason: `SF10 access requested for ${section.name} (${picked.length > 0 ? `${picked.length} selected` : "whole section"})`,
  });

  const counts = await countAdvisees(sectionId, new Set(picked));
  const deskRole = (GRADE_BAND_7_10 as string[]).includes(String(section.gradeLevel))
    ? "record_keeper"
    : "registrar";
  await fanoutToRole(deskRole, {
    sourceTable: "adviser_sf10_access_requests",
    action: "create",
    message:
      `SF10 access requested: Adviser ${adviser?.fullName ?? "Unknown"} — ` +
      `${section.name} (${counts.total} advisees) — ${trimmedReason}`,
    sourceId: created.id,
    excludeUserId: userId,
  });
  await fanoutNotification({
    userId,
    sourceTable: "adviser_sf10_access_requests",
    action: "create",
    message: `Your SF10 access request for ${section.name} was submitted for verification.`,
    sourceId: created.id,
  });

  return {
    id: created.id,
    status: created.status,
    requestedAt: created.requestedAt.toISOString(),
  };
}

/**
 * Grade-7 and Grade-11 records the advisory desk already owns. Enrolment in G7
 * opens a learner's first SF10, and G11 anchors the SHS form; auto-fill is
 * allowed for both without a registry grant (see `sf10-autofill.service.ts`),
 * so the access desk shows the same records without waiting for a request to
 * be approved. Only rows already on file are returned — there is nothing to
 * open otherwise, and the remaining grades keep flowing through
 * `AdviserSf10AccessRequest`.
 */
export async function listOwnedFirstSf10(userId: string): Promise<{ hasSf10: HasRow[] }> {
  const sections = await prisma.section.findMany({
    where: { adviserId: userId, gradeLevel: { in: ["G7", "G11"] } },
    select: { id: true, name: true, gradeLevel: true },
    orderBy: { name: "asc" },
  });
  const hasSf10: HasRow[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    const rows = await matchAdvisoryLrns(
      section.id,
      new Set(),
      section.name,
      String(section.gradeLevel),
    );
    for (const row of rows) {
      if (!row.rec || seen.has(row.lrn)) continue;
      seen.add(row.lrn);
      hasSf10.push({
        lrn: row.lrn,
        name: row.name,
        mascot: row.mascot,
        hasAccount: row.hasAccount,
        gradeLevel: row.gradeLevel,
        section: row.section,
        sectionId: section.id,
        sf10Status: sf10StatusOf(String(row.rec.status)),
        approved: true,
        approvedAt: null,
        grantedTermNumber: null,
        record: {
          id: row.rec.id,
          source: String(row.rec.source),
          status: String(row.rec.status),
          fileUrl: row.rec.uploadedFileUrl ?? null,
          verifiedAt: row.rec.verifiedAt?.toISOString() ?? null,
          validatedAt: row.rec.validatedAt?.toISOString() ?? null,
          currentVersion: row.rec.currentVersion,
          autoFill: autoFillOf(row.rec),
        },
      });
    }
  }
  return { hasSf10 };
}

/* ------------------------- SF10 version history ---------------------------- */

export interface Sf10HistorySubject {
  subject: string;
  quarters: Array<number | null>;
  rating: number | null;
  remarks: string | null;
}

export interface Sf10HistoryVersion {
  versionNumber: number;
  at: string;
  reason: string;
  /** Public render of this version, when the run could produce one. */
  fileUrl: string | null;
  subjectCount: number;
  subjects: Sf10HistorySubject[];
}

export interface Sf10History {
  lrn: string;
  name: string;
  gradeLevel: string;
  section: string;
  sectionId: string;
  recordId: string | null;
  status: string;
  currentVersion: number | null;
  originalFileUrl: string | null;
  versions: Sf10HistoryVersion[];
}

function historySubjectOf(raw: unknown): Sf10HistorySubject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const subject =
    typeof r.rawName === "string"
      ? r.rawName
      : typeof r.subject === "string"
        ? r.subject
        : "";
  if (!subject.trim()) return null;
  const quarters =
    Array.isArray(r.quarters) && r.quarters.length === 4
      ? r.quarters.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
      : [null, null, null, null];
  const rating =
    typeof r.rating === "number" && Number.isFinite(r.rating)
      ? r.rating
      : typeof r.grade === "number" && Number.isFinite(r.grade)
        ? r.grade
        : null;
  return {
    subject,
    quarters,
    rating,
    remarks: typeof r.remarks === "string" && r.remarks ? r.remarks : null,
  };
}

/**
 * The adviser desk's version history for one advisee: every Bama auto-fill /
 * template render filed on the learner's SF10, newest first. Grants are
 * LRN-scoped exactly like auto-fill (a whole-request approval or a per-student
 * grant); Grade 7 and Grade 11 are owned by the advisory desk, so no request
 * is required for them.
 */
export async function getMySf10History(
  userId: string,
  sectionId: string,
  lrn: string,
): Promise<Sf10History> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, name: true, gradeLevel: true, adviserId: true },
  });
  if (!section) throw new AppError(404, "NOT_FOUND", "Section not found");
  if (section.adviserId !== userId)
    throw new AppError(403, "FORBIDDEN", "You can only view your own advisory section");

  const wanted = ["G7", "G11"].includes(String(section.gradeLevel));
  if (!wanted) {
    const requests = await prisma.adviserSf10AccessRequest.findMany({
      where: { adviserId: userId, sectionId },
      select: { status: true, approvedLrns: true },
    });
    const granted = requests.some(
      (r) => r.status === "approved" || (r.approvedLrns ?? []).includes(lrn),
    );
    if (!granted) throw new AppError(403, "FORBIDDEN", "SF10 access for this learner is not approved");
  }

  const rows = await matchAdvisoryLrns(
    section.id,
    new Set([lrn]),
    section.name,
    String(section.gradeLevel),
  );
  const row = rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "Learner is not on this advisory section");

  const versions: Sf10HistoryVersion[] = [];
  if (row.rec) {
    for (const v of row.rec.versions) {
      const snap = v.dataSnapshot as
        | { engine?: string; generatedFileUrl?: string; subjects?: unknown }
        | null;
      if (snap?.engine !== "grading-auto-fill-v1") continue;
      const subjects = Array.isArray(snap.subjects)
        ? snap.subjects.map(historySubjectOf).filter((s): s is Sf10HistorySubject => !!s)
        : [];
      versions.push({
        versionNumber: v.versionNumber,
        at: v.changedAt.toISOString(),
        reason: v.changeReason,
        fileUrl:
          typeof snap.generatedFileUrl === "string" && snap.generatedFileUrl
            ? snap.generatedFileUrl
            : null,
        subjectCount: subjects.length,
        subjects,
      });
    }
  }

  return {
    lrn: row.lrn,
    name: row.name,
    gradeLevel: row.gradeLevel,
    section: row.section,
    sectionId: section.id,
    recordId: row.rec?.id ?? null,
    status: row.rec ? String(row.rec.status) : "missing",
    currentVersion: row.rec?.currentVersion ?? null,
    originalFileUrl: row.rec?.uploadedFileUrl ?? null,
    versions,
  };
}

export interface VerificationResult {
  requestId: string;
  section: string;
  gradeLevel: string;
  status: string;
  requestedLrns: string[];
  canDownload: boolean;
  canEdit: boolean;
  summary: { total: number; has: number; missing: number };
  hasSf10: HasRow[];
  missingSf10: MissingRow[];
}

export async function getMyVerification(userId: string, requestId: string): Promise<VerificationResult> {
  const request = await prisma.adviserSf10AccessRequest.findUnique({
    where: { id: requestId },
    include: { section: { select: { id: true, name: true, schoolYearId: true } } },
  });
  if (!request) throw new AppError(404, "REQUEST_NOT_FOUND", "Access request not found");
  if (request.adviserId !== userId)
    throw new AppError(403, "FORBIDDEN", "Not your access request");

  const sectionId = request.sectionId;
  const wholeApproved = request.status === "approved";
  const approvedLrns = new Set(request.approvedLrns ?? []);
  const approvedLrnAt =
    request.approvedLrnAt && typeof request.approvedLrnAt === "object" && !Array.isArray(request.approvedLrnAt)
      ? (request.approvedLrnAt as Record<string, unknown>)
      : {};
  // Empty picks = whole section (pre-selection behavior).
  const picked = new Set(request.requestedLrns ?? []);
  const sectionName = request.section?.name ?? "Unsectioned";
  const grantedTerms = request.section
    ? (
        await termsBySchoolYear([request.section.schoolYearId])
      ).get(request.section.schoolYearId) ?? []
    : [];

  const rows = await matchAdvisoryLrns(
    sectionId,
    picked,
    sectionName,
    String(request.gradeLevel),
  );
  const hasSf10: HasRow[] = [];
  const missingSf10: MissingRow[] = [];

  for (const row of rows) {
    if (row.rec) {
      const rec = row.rec;
      const granted = wholeApproved || approvedLrns.has(row.lrn);
      const at = approvedLrnAt[row.lrn];
      const grantedAt =
        typeof at === "string" && at
          ? at
          : wholeApproved && request.decidedAt
            ? request.decidedAt.toISOString()
            : null;
      hasSf10.push({
        lrn: row.lrn,
        name: row.name,
        mascot: row.mascot,
        hasAccount: row.hasAccount,
        gradeLevel: row.gradeLevel,
        section: row.section,
        sectionId,
        sf10Status: sf10StatusOf(String(rec.status)),
        approved: granted,
        approvedAt: grantedAt,
        grantedTermNumber:
          granted && grantedAt ? termNumberForDate(new Date(grantedAt), grantedTerms) : null,
        record: {
          id: rec.id,
          source: String(rec.source),
          status: String(rec.status),
          fileUrl: granted ? (rec.uploadedFileUrl ?? null) : null,
          verifiedAt: rec.verifiedAt?.toISOString() ?? null,
          validatedAt: rec.validatedAt?.toISOString() ?? null,
          currentVersion: rec.currentVersion,
          autoFill: granted ? autoFillOf(rec) : null,
        },
      });
    } else {
      missingSf10.push({
        lrn: row.lrn,
        name: row.name,
        mascot: row.mascot,
        hasAccount: row.hasAccount,
        gradeLevel: row.gradeLevel,
        section: row.section,
      });
    }
  }

  return {
    requestId: request.id,
    section: request.section?.name ?? "Unsectioned",
    gradeLevel: String(request.gradeLevel),
    status: request.status,
    requestedLrns: [...picked],
    canDownload: wholeApproved || approvedLrns.size > 0,
    canEdit: wholeApproved || approvedLrns.size > 0,
    summary: { total: hasSf10.length + missingSf10.length, has: hasSf10.length, missing: missingSf10.length },
    hasSf10,
    missingSf10,
  };
}
