import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PDFDocument } from "pdf-lib";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  referral: vi.fn(),
  user: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    anecdotalRecord: { findUnique: mocks.record },
    referral: { findFirst: mocks.referral },
    user: { findUnique: mocks.user },
  },
}));
vi.mock("../src/lib/audit.js", () => ({ writeAudit: mocks.audit }));
vi.mock("../src/services/presence.service.js", () => ({ touchActivity: vi.fn() }));
vi.mock("../src/lib/jwt.js", () => ({
  verifyAccess: (token: string) => {
    const [sub, role] = token.split(":");
    if (!sub || !role) throw new Error("Invalid token");
    return { sub, role, type: "access" };
  },
}));

import router from "../src/modules/anecdotal/anecdotal.routes.js";
import { errorHandler, notFound } from "../src/lib/errors.js";

// Use the real router, auth guards, record authorization and PDF generator.
// Only persistence and JWT verification are stubbed; no live database is used.
const app = express();
app.use("/api/anecdotal", router);
app.use(notFound);
app.use(errorHandler);

function record() {
  return {
    id: "record-1",
    deletedAt: null,
    observerId: "observer",
    observer: { fullName: "Maria Adviser" },
    student: null,
    roster: { gradeLevel: "G7", fullName: "Juan Dela Cruz" },
    section: {
      name: "Diamond",
      adviserId: "adviser",
      adviser: { fullName: "Maria Adviser" },
    },
    observationDatetime: new Date("2026-09-05T02:30:00Z"),
    category: "behavioral",
    confidentialityLevel: "restricted",
    descriptionOfIncident: "A classroom incident.",
    descriptionOfLocation: "Classroom",
    notesRecommendationsActions: "Guidance follow-up.",
    classPerformance: "Satisfactory",
    attendanceSummary: "Present",
    signedBy: null,
    signedAt: null,
    signatureImageUrl: null,
  };
}

const url = "/api/anecdotal/record-1/pdf";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.record.mockResolvedValue(record());
  mocks.referral.mockResolvedValue(null);
  mocks.audit.mockResolvedValue(undefined);
});

describe("GCForm-01 mobile PDF endpoint", () => {
  it.each(["adviser:adviser", "observer:subject_teacher"])(
    "serves a real A4 PDF to the authorized %s",
    async (token) => {
      const res = await request(app).get(url).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
      expect(res.headers["content-disposition"]).toBe(
        'inline; filename="OCForm-01_Juan-Dela-Cruz_2026-09-05.pdf"',
      );
      expect(Number(res.headers["content-length"])).toBe(res.body.length);
      expect(res.body.subarray(0, 5).toString()).toBe("%PDF-");
      const pdf = await PDFDocument.load(res.body);
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
      expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89);
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
        sourceId: "record-1",
        reason: "OCForm-01 PDF exported",
      }));
    },
  );

  it("embeds a signed report through the same loader used by web detail", async () => {
    mocks.record.mockResolvedValue({
      ...record(),
      signedBy: "adviser",
      signedAt: new Date("2026-09-05T03:00:00Z"),
      signatureImageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    });
    mocks.user.mockResolvedValue({ fullName: "Maria Adviser" });
    const detail = await request(app).get("/api/anecdotal/record-1/detail")
      .set("Authorization", "Bearer adviser:adviser");
    expect(detail.status).toBe(200);
    expect(detail.body.signature.by).toBe("Maria Adviser");
    const res = await request(app).get(url).set("Authorization", "Bearer adviser:adviser");
    expect(res.status).toBe(200);
    const pdf = await PDFDocument.load(res.body);
    // Both logos plus the signature image must be embedded.
    const images = pdf.context.enumerateIndirectObjects()
      .filter(([, object]) => object.toString().includes("/Subtype /Image"));
    expect(images.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects unauthenticated requests before reading a record", async () => {
    expect((await request(app).get(url)).status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("rejects unsupported roles before reading a record", async () => {
    expect((await request(app).get(url).set("Authorization", "Bearer learner:student")).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it.each([null, { ...record(), deletedAt: new Date() }])(
    "does not export missing or deleted records",
    async (row) => {
      mocks.record.mockResolvedValue(row);
      const res = await request(app).get(url).set("Authorization", "Bearer adviser:adviser");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it("rejects a teacher who is neither observer nor section adviser", async () => {
    const res = await request(app).get(url).set("Authorization", "Bearer unrelated:subject_teacher");
    expect(res.status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["guidance_counselor", "nurse", "adm_coordinator"])(
    "keeps %s referral access scoped like the web preview",
    async (role) => {
      const denied = await request(app).get(url).set("Authorization", `Bearer staff:${role}`);
      expect(denied.status).toBe(403);
      mocks.referral.mockResolvedValue({ id: "referral-1" });
      const allowed = await request(app).get(url).set("Authorization", `Bearer staff:${role}`);
      expect(allowed.status).toBe(200);
    },
  );
});
