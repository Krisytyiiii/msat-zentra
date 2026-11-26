import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { GRADE_BAND_7_10 } from "../../lib/roles.js";
import { fanoutToRole } from "../../lib/notify.js";
import {
  archivedAdvisoryLearnerIds,
  excludeArchivedProfiles,
  excludeArchivedRosters,
} from "../../lib/learnerVisibility.js";
import type { GradeLevel } from "../../generated/prisma/client.js";
import { normalizeSubjectName } from "../sf10/subject-aliases.js";
import { uploadFile, sf10ObjectPath, getSf10Bucket } from "../../lib/storage.js";
import { parseFullName } from "../sf10/learner-identity.service.js";
import {
  applyAutoFilledSubjects,
  createAutoPopulatedRecord,
  type OcrSubjectPayload,
} from "../sf10/records.service.js";
import { fillSf10Template, fillShsSf10Template, renderSf10Pdf } from "../sf10/template-file.service.js";
import type { Sf10Context } from "../sf10/sf10.types.js";

export interface GradeFact {
  subjectId: string;
  subjectName: string;
  termNumber: number;
  rating: number;
}

export interface AutofillSkip {
  subject: string;
  terms: number;
  reason: string;
}

export interface AutofillRow {
  subject: string;
  norm: string;
  rating: number;
  quarters: Array<number | null>;
  remarks: "PASSED" | "FAILED";
}

export interface AutofillRowBuild {
  rows: AutofillRow[];
  skipped: AutofillSkip[];
}

function ratingsOf(facts: GradeFact[]): GradeFact[] {
  return facts.filter((f) => Number.isFinite(f.rating));
}

/**
 * Pure helper: one SF10 row per subject, filled term by term. Each locked term
 * lands in its own quarter (Q1–Q3 from terms 1–3; Q4 stays blank because
 * Zentra runs trimesters), so an adviser can run the auto-fill as soon as a
 * term is locked — an unlocked term just leaves its quarter blank. The subject
 * rating is the rounded mean of the quarters that are filled.
 */
export function buildAutofillRows(
  facts: GradeFact[],
  gradeLevel: string,
  requiredTermNumbers: number[],
): AutofillRowBuild {
  const clean = ratingsOf(facts);
  const bySubject = new Map<string, { name: string; byTerm: Map<number, number> }>();
  for (const f of clean) {
    const entry = bySubject.get(f.subjectId) ?? { name: f.subjectName, byTerm: new Map() };
    entry.byTerm.set(f.termNumber, f.rating);
    bySubject.set(f.subjectId, entry);
  }

  const rows: AutofillRow[] = [];
  for (const [, entry] of bySubject) {
    // SF10 always has four quarter columns; Zentra runs trimesters, so Q4 stays blank.
    const quarters: Array<number | null> = [null, null, null, null];
    const filled: number[] = [];
    for (const term of requiredTermNumbers.slice(0, 4)) {
      const rating = entry.byTerm.get(term);
      if (rating == null || !Number.isFinite(rating)) continue;
      const rounded = Math.round(rating);
      quarters[term - 1] = rounded;
      filled.push(rounded);
    }
    if (filled.length === 0) continue;
    const rating = Math.round(filled.reduce((sum, v) => sum + v, 0) / filled.length);
    rows.push({
      subject: entry.name,
      norm: normalizeSubjectName(entry.name),
      rating,
      quarters,
      remarks: rating >= 75 ? "PASSED" : "FAILED",
    });
  }
  rows.sort((a, b) => a.subject.localeCompare(b.subject));
  return { rows, skipped: [] };
}

interface SectionLearner {
  lrn: string;
  name: string;
  mascot: string | null;
  gradeLevel: GradeLevel;
  profileId: string | null;
  /** Grade + section on the learner's SF10 owner profile (null when no account). */
  profileGradeLevel: GradeLevel | null;
  birthdate: Date | null;
  gender: string | null;
  rosterIds: string[];
}

interface Sf10RecordLite {
  id: string;
  desk: string;
  status: string;
  currentVersion: number;
  lrn: string;
}

interface SectionContext {
  section: { id: string; name: string; gradeLevel: GradeLevel; schoolYearId: string };
  schoolYear: { id: string; name: string };
  requiredTermNumbers: number[];
  learners: SectionLearner[];
  recordsByLrn: Map<string, Sf10RecordLite[]>;
  grants: Array<{ sectionId: string; status: string; approvedLrns: string[] }>;
  factsByLrn: Map<string, GradeFact[]>;
}

export interface AutofillCandidate {
  lrn: string;
  name: string;
  mascot: string | null;
  gradeLevel: string;
  section: string;
  recordId: string | null;
  recordStatus: string | null;
  currentVersion: number | null;
  subjectsReady: number;
  subjectsSkipped: number;
  ready: boolean;
  /** SF10 access granted and approved grades exist — the JHS template can render. */
  templateReady: boolean;
  reason: string | null;
}

export interface AutofillPreviewStudent extends AutofillCandidate {
  rows: AutofillRow[];
  skipped: AutofillSkip[];
}

export interface AutofillPreview {
  sectionId: string;
  section: string;
  gradeLevel: string;
  schoolYear: { id: string; name: string };
  students: AutofillPreviewStudent[];
}

export interface AutofillResultRow {
  lrn: string;
  name: string;
  status: "updated" | "skipped" | "failed";
  recordId: string | null;
  version: number | null;
  added: number;
  replaced: number;
  message: string;
}

export interface AutofillResult {
  sectionId: string;
  section: string;
  updated: number;
  skipped: number;
  failed: number;
  results: AutofillResultRow[];
}

/**
 * Access is LRN-scoped: a per-student approval grants that learner even when
 * their profile has no section, and a whole-request approval covers every
 * advisee on the advisory section's roster. The SF10 record links to the
 * learner by LRN only — the profile's stored section/grade is never the gate.
 */
function hasGrant(
  grants: Array<{ sectionId: string; status: string; approvedLrns: string[] }>,
  lrn: string,
  sectionId: string,
): boolean {
  return grants.some(
    (g) => g.approvedLrns.includes(lrn) || (g.status === "approved" && g.sectionId === sectionId),
  );
}

/**
 * Desk that owns the learner's SF10 record. The current grade comes from the
 * advisory section (the enrollment being filled), not the profile field — a
 * profile can lag behind the roster and would otherwise pick the wrong desk.
 */
function recordFor(
  records: Sf10RecordLite[],
  currentGrade: string,
): Sf10RecordLite | null {
  const desk = (GRADE_BAND_7_10 as string[]).includes(currentGrade) ? "record_keeper" : "registrar";
  return records.find((r) => r.desk === desk) ?? records[0] ?? null;
}

async function loadContext(
  userId: string,
  sectionId: string,
  onlyLrns?: Set<string>,
): Promise<SectionContext> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      adviserId: true,
      schoolYearId: true,
      schoolYear: { select: { id: true, name: true } },
    },
  });
  if (!section) throw new AppError(404, "NOT_FOUND", "Section not found");
  if (section.adviserId !== userId) {
    throw new AppError(403, "FORBIDDEN", "You can only auto-fill your own advisory section");
  }

  const archivedLearners = await archivedAdvisoryLearnerIds();
  const [profiles, roster, terms, grants] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { sectionId, ...excludeArchivedProfiles(archivedLearners) },
      select: {
        userId: true,
        lrn: true,
        mascot: true,
        gradeLevel: true,
        birthdate: true,
        gender: true,
        user: { select: { fullName: true } },
      },
      orderBy: { lrn: "asc" },
    }),
    prisma.studentRoster.findMany({
      where: { sectionId, ...excludeArchivedRosters(archivedLearners) },
      select: { id: true, lrn: true, fullName: true, mascot: true, gradeLevel: true },
      orderBy: { lrn: "asc" },
    }),
    prisma.term.findMany({
      where: { schoolYearId: section.schoolYearId },
      orderBy: { termNumber: "asc" },
      select: { termNumber: true },
    }),
    // Every grant the adviser holds: per-LRN approvals can come from a request
    // filed for another section, and whole-request approvals are section-scoped.
    prisma.adviserSf10AccessRequest.findMany({
      where: { adviserId: userId },
      select: { sectionId: true, status: true, approvedLrns: true },
    }),
  ]);

  const requiredTermNumbers = terms
    .map((t) => t.termNumber)
    .filter((n) => n >= 1 && n <= 4)
    .slice(0, 4);
  if (requiredTermNumbers.length === 0) {
    throw new AppError(409, "NO_TERMS", "This school year has no terms to fill from.");
  }

  const learnersByLrn = new Map<string, SectionLearner>();
  for (const p of profiles) {
    learnersByLrn.set(p.lrn, {
      lrn: p.lrn,
      name: p.user.fullName,
      mascot: p.mascot ?? null,
      gradeLevel: p.gradeLevel,
      profileId: p.userId,
      profileGradeLevel: p.gradeLevel,
      birthdate: p.birthdate ?? null,
      gender: p.gender ?? null,
      rosterIds: [],
    });
  }
  for (const r of roster) {
    const existing = learnersByLrn.get(r.lrn);
    if (existing) {
      existing.rosterIds.push(r.id);
      continue;
    }
    learnersByLrn.set(r.lrn, {
      lrn: r.lrn,
      name: r.fullName,
      mascot: r.mascot ?? null,
      gradeLevel: r.gradeLevel,
      profileId: null,
      profileGradeLevel: null,
      birthdate: null,
      gender: null,
      rosterIds: [r.id],
    });
  }

  // Roster rows are the section enlistment; the learner's account may not point
  // back at this section (moved, or enrolled by LRN only). Resolve it by LRN so
  // the flow never depends on the account's section being in sync.
  const unresolvedLrns = [...learnersByLrn.values()]
    .filter((l) => !l.profileId && (!onlyLrns || onlyLrns.size === 0 || onlyLrns.has(l.lrn)))
    .map((l) => l.lrn);
  if (unresolvedLrns.length > 0) {
    const byLrn = await prisma.studentProfile.findMany({
      where: { lrn: { in: unresolvedLrns } },
      select: {
        userId: true,
        lrn: true,
        mascot: true,
        gradeLevel: true,
        birthdate: true,
        gender: true,
        user: { select: { fullName: true } },
      },
    });
    for (const p of byLrn) {
      const learner = learnersByLrn.get(p.lrn);
      if (!learner) continue;
      learner.profileId = p.userId;
      learner.profileGradeLevel = p.gradeLevel;
      learner.name = p.user.fullName;
      learner.mascot = p.mascot ?? learner.mascot;
      learner.birthdate = p.birthdate ?? learner.birthdate;
      learner.gender = p.gender ?? learner.gender;
    }
  }

  let learners = [...learnersByLrn.values()];
  if (onlyLrns && onlyLrns.size > 0) learners = learners.filter((l) => onlyLrns.has(l.lrn));

  const profileIds = learners.map((l) => l.profileId).filter((id): id is string => id != null);
  const rosterIds = learners.flatMap((l) => l.rosterIds);

  const [records, finals] = await Promise.all([
    learners.length > 0
      ? prisma.sf10Record.findMany({
          where: { lrn: { in: learners.map((l) => l.lrn) } },
          select: {
            id: true,
            desk: true,
            status: true,
            currentVersion: true,
            lrn: true,
          },
        })
      : Promise.resolve([] as Sf10RecordLite[]),
    prisma.finalGrade.findMany({
      where: {
        lockStatus: { in: ["locked", "adviser_approved"] },
        term: { schoolYearId: section.schoolYearId },
        OR: [
          ...(profileIds.length > 0 ? [{ studentId: { in: profileIds } }] : []),
          ...(rosterIds.length > 0 ? [{ rosterId: { in: rosterIds } }] : []),
        ],
      },
      select: {
        studentId: true,
        rosterId: true,
        subjectId: true,
        transmutedGrade: true,
        computedAverage: true,
        term: { select: { termNumber: true } },
        subject: { select: { name: true } },
      },
    }),
  ]);

  const recordsByLrn = new Map<string, Sf10RecordLite[]>();
  for (const r of records) {
    const list = recordsByLrn.get(r.lrn) ?? [];
    list.push(r);
    recordsByLrn.set(r.lrn, list);
  }

  const lrnByProfile = new Map(learners.filter((l) => l.profileId).map((l) => [l.profileId as string, l.lrn]));
  const lrnByRoster = new Map<string, string>();
  for (const l of learners) for (const id of l.rosterIds) lrnByRoster.set(id, l.lrn);

  const factsByLrn = new Map<string, GradeFact[]>();
  for (const f of finals) {
    const rating = f.transmutedGrade ?? f.computedAverage;
    if (rating == null || !Number.isFinite(rating)) continue;
    const lrn = (f.studentId ? lrnByProfile.get(f.studentId) : undefined) ?? (f.rosterId ? lrnByRoster.get(f.rosterId) : undefined);
    if (!lrn) continue;
    const list = factsByLrn.get(lrn) ?? [];
    list.push({
      subjectId: f.subjectId,
      subjectName: f.subject.name,
      termNumber: f.term.termNumber,
      rating,
    });
    factsByLrn.set(lrn, list);
  }

  return {
    section: {
      id: section.id,
      name: section.name,
      gradeLevel: section.gradeLevel,
      schoolYearId: section.schoolYearId,
    },
    schoolYear: section.schoolYear,
    requiredTermNumbers,
    learners,
    recordsByLrn,
    grants,
    factsByLrn,
  };
}

function buildStudent(
  learner: SectionLearner,
  ctx: SectionContext,
): AutofillPreviewStudent {
  // The section is the current enrollment: it decides which grade block the
  // locked finals are filed under. `profile.gradeLevel` can be stale
  // (e.g. registered as G8 but sitting in a G7 section), so never use it here.
  const grade: GradeLevel = ctx.section.gradeLevel;
  // The store is LRN-keyed: a roster-only advisee can still have a filed SF10.
  const record = recordFor(ctx.recordsByLrn.get(learner.lrn) ?? [], grade);
  // Access is granted per learner by LRN: a per-student approval follows the
  // LRN wherever the SF10 record is filed, and a whole-request approval covers
  // the advisory section. The profile's section/grade never gates the fill.
  const grant = hasGrant(ctx.grants, learner.lrn, ctx.section.id);
  const { rows, skipped } = buildAutofillRows(
    ctx.factsByLrn.get(learner.lrn) ?? [],
    grade,
    ctx.requiredTermNumbers,
  );

  let reason: string | null = null;
  if (!grant) reason = "SF10 access not approved";
  else if (!record) reason = "No SF10 record yet";
  else if (record.status === "released") reason = "SF10 already released";
  else if (rows.length === 0) {
    reason = "No locked grades yet";
  }

  return {
    lrn: learner.lrn,
    name: learner.name,
    mascot: learner.mascot,
    gradeLevel: grade,
    section: ctx.section.name,
    recordId: record?.id ?? null,
    recordStatus: record?.status ?? null,
    currentVersion: record?.currentVersion ?? null,
    subjectsReady: rows.length,
    subjectsSkipped: skipped.length,
    ready: reason === null && rows.length > 0,
    templateReady: grant && rows.length > 0,
    reason,
    rows,
    skipped,
  };
}

export async function listCandidates(userId: string, sectionId: string): Promise<{ candidates: AutofillCandidate[] }> {
  const ctx = await loadContext(userId, sectionId);
  const candidates = ctx.learners
    .map((l) => buildStudent(l, ctx))
    .map(({ rows: _rows, skipped: _skipped, ...rest }) => rest);
  return { candidates };
}

export async function getPreview(
  userId: string,
  sectionId: string,
  studentLrns: string[],
): Promise<AutofillPreview> {
  const picked = new Set(studentLrns.map((l) => l.trim()).filter(Boolean));
  if (picked.size === 0) throw new AppError(400, "BAD_REQUEST", "Pick at least one student");
  if (picked.size > 200) throw new AppError(400, "BAD_REQUEST", "Select at most 200 students");

  const ctx = await loadContext(userId, sectionId, picked);
  if (ctx.learners.length !== picked.size) {
    throw new AppError(400, "BAD_REQUEST", "Selected students must belong to your advisory section");
  }
  return {
    sectionId: ctx.section.id,
    section: ctx.section.name,
    gradeLevel: ctx.section.gradeLevel,
    schoolYear: ctx.schoolYear,
    students: ctx.learners.map((l) => buildStudent(l, ctx)),
  };
}

export async function runAutofill(
  ctx: Sf10Context,
  sectionId: string,
  studentLrns: string[],
): Promise<AutofillResult> {
  const preview = await getPreview(ctx.userId, sectionId, studentLrns);
  const results: AutofillResultRow[] = [];

  for (const student of preview.students) {
    if (!student.ready || !student.recordId) {
      results.push({
        lrn: student.lrn,
        name: student.name,
        status: "skipped",
        recordId: student.recordId,
        version: null,
        added: 0,
        replaced: 0,
        message: student.reason ?? "Nothing to fill",
      });
      continue;
    }
    try {
      const payload: OcrSubjectPayload[] = student.rows.map((r) => ({
        rawName: r.subject,
        norm: r.norm,
        grade: r.rating,
        rating: r.rating,
        gradeLevel: student.gradeLevel,
        quarters: r.quarters,
        remarks: r.remarks,
      }));
      const write = await applyAutoFilledSubjects(ctx, student.recordId, student.gradeLevel, payload);
      if (write.wasVerified) {
        const deskRole = (GRADE_BAND_7_10 as string[]).includes(student.gradeLevel)
          ? "record_keeper"
          : "registrar";
        await fanoutToRole(deskRole, {
          sourceTable: "sf10_records",
          action: "autofill",
          message: `SF10 auto-filled for ${student.name} (${preview.section}) — re-verification needed.`,
          sourceId: student.recordId,
          excludeUserId: ctx.userId,
        });
      }
      results.push({
        lrn: student.lrn,
        name: student.name,
        status: "updated",
        recordId: student.recordId,
        version: write.version,
        added: write.added,
        replaced: write.replaced,
        message: `${student.rows.length} subject${student.rows.length === 1 ? "" : "s"} filled`,
      });
    } catch (e) {
      const message = e instanceof AppError ? e.message : "Could not fill this record";
      results.push({
        lrn: student.lrn,
        name: student.name,
        status: "failed",
        recordId: student.recordId,
        version: null,
        added: 0,
        replaced: 0,
        message,
      });
    }
  }

  return {
    sectionId: preview.sectionId,
    section: preview.section,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

/* --------------------------- template generation --------------------------- */

const TEMPLATE_GRADES = new Set(["G7", "G8", "G9", "G10", "G11", "G12"]);

export type Sf10TemplateFormat = "xlsx" | "pdf";

export interface GeneratedTemplateFile {
  buffer: Buffer;
  ext: Sf10TemplateFormat;
  mimeType: string;
  filename: string;
  recordId: string;
  version: number;
}

function mmDdYyyy(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${m}/${d}/${date.getFullYear()}`;
}

/**
 * Build a downloadable SF10 from the school's own template for one advisee:
 * locked finals of every subject are written into the grade's rows (the JHS
 * book for Grades 7–10, the Strengthened SHS book for Grades 11–12), then the
 * file is filed on the learner's SF10 record (creating one when the registry
 * desk has not uploaded a form yet) and handed back for download.
 */
export async function generateTemplateFile(
  ctx: { userId: string; role: string },
  sectionId: string,
  lrn: string,
  format: Sf10TemplateFormat,
): Promise<GeneratedTemplateFile> {
  const wanted = lrn.trim();
  if (!wanted) throw new AppError(400, "BAD_REQUEST", "A learner LRN is required");

  const section = await loadContext(ctx.userId, sectionId, new Set([wanted]));
  const learner = section.learners[0];
  if (!learner) throw new AppError(404, "NOT_FOUND", "Learner is not on this advisory section");

  // Grades 7–10 use the SF10-JHS form, Grades 11–12 the SF10-SHS (v2026) form.
  const grade = String(section.section.gradeLevel);
  if (!TEMPLATE_GRADES.has(grade)) {
    throw new AppError(
      409,
      "NOT_SUPPORTED",
      "The SF10 template can only be generated for Grades 7-12.",
    );
  }
  if (!hasGrant(section.grants, wanted, sectionId)) {
    throw new AppError(403, "FORBIDDEN", "SF10 access for this learner is not approved");
  }

  const student = buildStudent(learner, section);
  if (student.rows.length === 0) {
    throw new AppError(
      409,
      "NO_APPROVED_GRADES",
      student.reason ?? "No locked grades to fill yet",
    );
  }

  const adviser = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { fullName: true },
  });

  const fill = (GRADE_BAND_7_10 as string[]).includes(grade) ? fillSf10Template : fillShsSf10Template;
  const filledWorkbook = await fill({
    learner: {
      ...parseFullName(learner.name),
      lrn: learner.lrn,
      birthdate: learner.birthdate ? mmDdYyyy(learner.birthdate) : null,
      sex: learner.gender,
      gradeLevel: grade,
      section: section.section.name,
      schoolYear: section.schoolYear.name,
      adviserName: adviser?.fullName ?? null,
    },
    rows: student.rows.map((r) => ({
      subject: r.subject,
      quarters: r.quarters,
      rating: r.rating,
      remarks: r.remarks,
    })),
  });

  const buffer =
    format === "pdf" ? await renderSf10Pdf(filledWorkbook) : filledWorkbook;
  const mimeType =
    format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const fileUrl = await uploadFile(
    buffer,
    sf10ObjectPath(learner.lrn, format),
    mimeType,
    getSf10Bucket(),
  );

  const writeCtx: Sf10Context = { userId: ctx.userId, role: ctx.role };
  let recordId = student.recordId;
  if (!recordId) {
    // No form filed yet: the generated template becomes the record's file so
    // the record keeper opens the same document the adviser downloaded.
    const created = await createAutoPopulatedRecord(writeCtx, {
      lrn: learner.lrn,
      learnerName: learner.name,
      gradeLevel: grade,
      desk: (GRADE_BAND_7_10 as string[]).includes(grade) ? "record_keeper" : "registrar",
      fileUrl,
    });
    recordId = created.id;
  }

  const write = await applyAutoFilledSubjects(
    writeCtx,
    recordId,
    grade,
    student.rows.map((r) => ({
      rawName: r.subject,
      norm: r.norm,
      grade: r.rating,
      rating: r.rating,
      gradeLevel: grade,
      quarters: r.quarters,
      remarks: r.remarks,
    })),
    { generatedFileUrl: fileUrl },
  );

  if (write.wasVerified) {
    const deskRole = (GRADE_BAND_7_10 as string[]).includes(grade)
      ? "record_keeper"
      : "registrar";
    await fanoutToRole(deskRole, {
      sourceTable: "sf10_records",
      action: "autofill",
      message: `SF10 auto-filled for ${learner.name} (${section.section.name}) — re-verification needed.`,
      sourceId: recordId,
      excludeUserId: ctx.userId,
    });
  }

  const safeName = learner.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    buffer,
    ext: format,
    mimeType,
    filename: `SF10-${safeName || learner.lrn}.${format}`,
    recordId,
    version: write.version,
  };
}
