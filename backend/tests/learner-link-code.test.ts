import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  profile: vi.fn(),
  roster: vi.fn(),
  tx: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    studentProfile: { findUnique: mocks.profile },
    studentRoster: { findUnique: mocks.roster },
    $transaction: mocks.tx,
  },
}));
vi.mock("../src/lib/audit.js", () => ({ writeAudit: vi.fn() }));
vi.mock("../src/lib/notify.js", () => ({ fanoutNotification: vi.fn() }));
vi.mock("../src/lib/cache.js", () => ({ invalidateTags: vi.fn() }));
vi.mock("../src/lib/riskCohortCache.js", () => ({ bumpRiskCohortVersion: vi.fn() }));

import {
  matchesLearnerCode,
  mintLearnerCode,
  normalizeLearnerCode,
} from "../src/modules/academics/learnerCode.js";
import { placementForStudent, redeemLearnerCode } from "../src/services/learnerLink.js";

const YEAR = "2026-2027";

const roster = {
  id: "roster-1",
  lrn: "136130990001",
  gradeLevel: "G7",
  sectionId: "section-rizal",
  schoolYearId: YEAR,
  mascot: null,
  linkCodeRevokedAt: null,
  section: { name: "Rizal", adviserId: "adviser-1" },
  schoolYear: { isActive: true },
};

/** studentProfile.findUnique is called for the caller then for the LRN owner. */
function profileLookup(caller: unknown, owner: unknown = null) {
  mocks.profile.mockImplementation((args: { where: { userId?: string; lrn?: string } }) =>
    Promise.resolve(args.where.lrn ? owner : caller),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ lrn: "136130990001", fullName: "Jasmine Rose T. Villanueva" });
  profileLookup(null);
  mocks.roster.mockResolvedValue(roster);
});

describe("learner link codes", () => {
  it("mints LNK- + five unambiguous characters", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(mintLearnerCode()).toMatch(/^LNK-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it("normalizes and matches case-insensitively", () => {
    expect(normalizeLearnerCode("  lnk-7k2q9 ")).toBe("LNK-7K2Q9");
    expect(matchesLearnerCode("LNK-7K2Q9", "lnk-7k2q9")).toBe(true);
    expect(matchesLearnerCode(null, "LNK-7K2Q9")).toBe(false);
  });
});

describe("placementForStudent", () => {
  it("is placed through the profile section for the year", async () => {
    mocks.profile.mockResolvedValue({
      lrn: "136130990001",
      sectionId: "section-rizal",
      section: { name: "Rizal", schoolYearId: YEAR },
    });
    await expect(placementForStudent("student-1", YEAR)).resolves.toMatchObject({
      state: "placed",
      sectionId: "section-rizal",
      sectionName: "Rizal",
    });
  });

  it("is placed through the roster row when the profile has no section", async () => {
    mocks.profile.mockResolvedValue({
      lrn: "136130990001",
      sectionId: null,
      section: null,
    });
    await expect(placementForStudent("student-1", YEAR)).resolves.toMatchObject({
      state: "placed",
      sectionId: "section-rizal",
      hasRosterRow: true,
    });
  });

  it("is unplaced when neither the profile nor the roster resolves", async () => {
    mocks.profile.mockResolvedValue(null);
    mocks.roster.mockResolvedValue(null);
    await expect(placementForStudent("student-1", YEAR)).resolves.toMatchObject({
      state: "unplaced",
      lrn: "136130990001",
      sectionId: null,
    });
  });
});

describe("redeemLearnerCode guards", () => {
  it("rejects an unknown code without revealing roster existence", async () => {
    mocks.roster.mockResolvedValue(null);
    await expect(redeemLearnerCode("student-1", "lnk-zzzzz")).rejects.toMatchObject({
      status: 404,
      code: "CODE_NOT_FOUND",
    });
  });

  it("rejects revoked and inactive-year codes", async () => {
    mocks.roster.mockResolvedValue({ ...roster, linkCodeRevokedAt: new Date() });
    await expect(redeemLearnerCode("student-1", "lnk-ux2s4")).rejects.toMatchObject({
      code: "CODE_REVOKED",
    });

    mocks.roster.mockResolvedValue({ ...roster, schoolYear: { isActive: false } });
    await expect(redeemLearnerCode("student-1", "lnk-ux2s4")).rejects.toMatchObject({
      code: "CODE_EXPIRED",
    });
  });

  it("never rewrites a different LRN", async () => {
    mocks.user.mockResolvedValue({ lrn: "999999999999", fullName: "Someone Else" });
    await expect(redeemLearnerCode("student-1", "lnk-ux2s4")).rejects.toMatchObject({
      code: "CODE_LRN_MISMATCH",
    });
  });

  it("rejects an LRN already owned by another profile", async () => {
    profileLookup(null, { userId: "other-student" });
    await expect(redeemLearnerCode("student-1", "lnk-ux2s4")).rejects.toMatchObject({
      code: "LRN_ALREADY_PROVISIONED",
    });
  });

  it("is idempotent when already placed in the same section", async () => {
    profileLookup({
      userId: "student-1",
      lrn: "136130990001",
      sectionId: "section-rizal",
      section: { schoolYearId: YEAR },
    });
    await expect(redeemLearnerCode("student-1", "ux2s4")).resolves.toMatchObject({
      sectionId: "section-rizal",
      alreadyPlaced: true,
    });
    expect(mocks.tx).not.toHaveBeenCalled();
  });

  it("refuses to move a learner placed in another section this year", async () => {
    profileLookup({
      userId: "student-1",
      lrn: "136130990001",
      sectionId: "section-other",
      section: { schoolYearId: YEAR },
    });
    await expect(redeemLearnerCode("student-1", "LNK-UX2S4")).rejects.toMatchObject({
      code: "ALREADY_PLACED",
    });
  });
});
