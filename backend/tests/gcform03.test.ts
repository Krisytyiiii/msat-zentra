import { beforeAll, describe, expect, it } from "vitest";

let service: typeof import("../src/services/referrals/gcform03.service.js");

beforeAll(async () => {
  // The service imports the shared Prisma client; building it needs a URL but
  // these helpers never open a connection.
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/zentra";
  service = await import("../src/services/referrals/gcform03.service.js");
});

describe("GCForm-03 form data helpers", () => {
  it("splits long blocks into the template's fixed rows", () => {
    const rows = service.splitBlock("a b c d e f g h", 2, 5);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe("a b c");
    expect(rows[1]).toBe("d e f\ng h");
  });

  it("pads empty blocks to the requested row count", () => {
    expect(service.splitBlock("", 3, 40)).toEqual(["", "", ""]);
  });

  it("uses the template's checked/unchecked concern labels", () => {
    expect(service.templateConcernLabel("absences", true)).toBe(
      "☑  Absences/Tardiness/Cutting classes",
    );
    expect(service.templateConcernLabel("peer", false)).toBe("☐ Peer Problems");
  });

  it("reads only the [ADM endorsed] recommendation from referral notes", () => {
    const notes = [
      "[ADM consultation] nurse triage complete",
      "[ADM endorsed] Keep a weekly check-in | Refer to guidance | Concerns: attendance",
    ].join("\n");
    expect(service.endorsedRecommendation(notes)).toBe(
      "Keep a weekly check-in | Refer to guidance",
    );
    expect(service.endorsedRecommendation(null)).toBe("");
    expect(service.endorsedRecommendation("no endorsement")).toBe("");
  });

  it("names the export after the learner", () => {
    expect(service.gcForm03Filename("Rafael Miguel Dizon Santillan")).toMatch(
      /^GCForm-03_Rafael-Miguel-Dizon-Santillan_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(service.gcForm03Filename("")).toMatch(/^GCForm-03_referral_/);
  });
});
