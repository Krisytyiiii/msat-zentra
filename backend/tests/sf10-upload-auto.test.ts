import { describe, it, expect, vi, afterAll } from "vitest";

vi.mock("../src/lib/storage.js", () => ({
  uploadFile: async (_buffer: unknown, path: string) => `https://storage.test/${path}`,
  sf10ObjectPath: (lrn: string, ext: string) => `sf10/${lrn}-test.${ext}`,
  getSf10Bucket: () => "test-bucket",
}));

import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma.js";
import { uploadAuto } from "../src/services/sf10/records.service.js";
import { getRecordDetail } from "../src/services/sf10/records.service.js";
import { AppError } from "../src/lib/errors.js";

function novelLrn(): string {
  return `19${String(Date.now()).slice(-10).padStart(10, "0")}`;
}

async function staffCtx() {
  const keeper =
    (await prisma.user.findFirst({ where: { role: "record_keeper" }, select: { id: true } })) ??
    (await prisma.user.findFirst({ select: { id: true } }));
  if (!keeper) throw new Error("No users in test database");
  return { userId: keeper.id, role: "record_keeper" };
}

/** A learner that already exists in the record keeper's band (G7–G10). */
async function existingLearner() {
  const profile = await prisma.studentProfile.findFirst({
    where: { gradeLevel: { in: ["G7", "G8", "G9", "G10"] } },
    select: { userId: true, lrn: true, gradeLevel: true, user: { select: { fullName: true } } },
  });
  if (!profile?.lrn) throw new Error("No G7–G10 learner in test database");
  return profile;
}

async function learnerFile(lrn: string, classifiedGrade: string | null = "7") {
  const Excel = (ExcelJS as unknown as { default?: typeof ExcelJS }).default ?? ExcelJS;
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet("SF10");
  ws.addRow(["LAST NAME:", "AUTOPROV", "FIRST NAME:", "TESTY"]);
  ws.addRow(["MIDDLE NAME:", "MIDDLER", "LRN:", lrn]);
  if (classifiedGrade) {
    ws.addRow(["Classified as Grade:", classifiedGrade, "Section:", "Aquamarine"]);
  }
  ws.addRow(["Mathematics", 89]);
  ws.addRow(["MAPEH", ""]);
  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    originalname: "SF10_AUTO.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

const created: { recordId?: string } = {};

afterAll(async () => {
  try {
    if (created.recordId) {
      await prisma.auditLog.deleteMany({ where: { sourceId: created.recordId } });
      await prisma.sf10RecordVersion.deleteMany({ where: { sf10RecordId: created.recordId } });
      await prisma.sf10Record.deleteMany({ where: { id: created.recordId } });
    }
  } catch {
    // Best-effort cleanup only.
  }
  await prisma.$disconnect();
}, 30_000);

describe("SF10 upload-auto (LRN-keyed storage — a file, never enrolment)", () => {
  it("rejects a file with no readable LRN without writing anything", async () => {
    const ctx = await staffCtx();
    const file = await learnerFile("");
    const err = await uploadAuto(ctx, { file }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("NEEDS_LRN");
  });

  it("stores a file for an LRN the school has never enrolled — no account created", async () => {
    const ctx = await staffCtx();
    const lrn = novelLrn();
    const file = await learnerFile(lrn);
    const result = await uploadAuto(ctx, { file });
    expect(result.studentCreated).toBe(false);
    expect(result.lrn).toBe(lrn);
    expect(result.matched?.kind).toBe("no-account");
    expect(await prisma.studentProfile.findUnique({ where: { lrn } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: `${lrn}@sf10-provisioned.local` } })).toBeNull();

    const record = await prisma.sf10Record.findUnique({
      where: { id: result.id },
      select: { lrn: true, learnerName: true, status: true },
    });
    expect(record?.lrn).toBe(lrn);
    expect(record?.learnerName).toContain("AUTOPROV");
    expect(record?.status).toBe("attach");

    await prisma.auditLog.deleteMany({ where: { sourceId: result.id } });
    await prisma.sf10RecordVersion.deleteMany({ where: { sf10RecordId: result.id } });
    await prisma.sf10Record.deleteMany({ where: { id: result.id } });
  }, 30_000);

  it("files the record under the LRN written on the file (existing learner stays untouched)", async () => {
    const ctx = await staffCtx();
    const learner = await existingLearner();
    const file = await learnerFile(learner.lrn as string);
    const result = await uploadAuto(ctx, { file });
    expect(result.studentCreated).toBe(false);
    expect(result.lrn).toBe(learner.lrn);
    // Grade comes from the filed form, not from the learner's profile.
    expect(result.gradeLevel).toBe("G7");
    expect(result.ocrStatus).toBe("ready");
    expect(result.learner.lrn).toBe(learner.lrn);
    expect(result.matched?.kind).toBe("lrn-exact");
    expect(Array.isArray(result.deficiencies)).toBe(true);
    created.recordId = result.id;

    const record = await prisma.sf10Record.findUnique({
      where: { id: result.id },
      select: { lrn: true, gradeLevel: true, status: true, ocrExtractedData: true },
    });
    expect(record?.lrn).toBe(learner.lrn);
    expect(record?.gradeLevel).toBe("G7");
    expect(record?.status).toBe("attach");
    const stored = record?.ocrExtractedData as unknown as {
      subjects: Array<{ norm: string; rating: number | null; gradeLevel: string | null }>;
    } | null;
    const math = stored?.subjects.find((s) => s.norm === "mathematics");
    expect(math?.rating).toBe(89);

    // The upload must not rewrite learner info — grade included.
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: learner.userId },
      select: { gradeLevel: true },
    });
    expect(profile?.gradeLevel).toBe(learner.gradeLevel);
  }, 30_000);

  it("re-uploading the same file stays on the same record (idempotent)", async () => {
    const ctx = await staffCtx();
    if (!created.recordId) throw new Error("Filing test must run first");
    const learner = await existingLearner();
    const file = await learnerFile(learner.lrn as string);
    const result = await uploadAuto(ctx, { file });
    expect(result.studentCreated).toBe(false);
    expect(result.id).toBe(created.recordId);
  }, 30_000);

  it("detail endpoint returns record + versions + map, 404s unknown ids", async () => {
    const ctx = await staffCtx();
    if (!created.recordId) throw new Error("Filing test must run first");
    const detail = await getRecordDetail(ctx, created.recordId);
    expect(detail.record.id).toBe(created.recordId);
    expect(Array.isArray(detail.versions)).toBe(true);
    expect(Array.isArray(detail.map.deficiencies)).toBe(true);
    expect(detail.map.learner.lrn).toBeTruthy();
    const err = await getRecordDetail(ctx, "00000000-0000-0000-0000-000000000000").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("NOT_FOUND");
  }, 30_000);
});
