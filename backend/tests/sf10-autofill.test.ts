import { describe, it, expect } from "vitest";
import {
  buildAutofillRows,
  type GradeFact,
} from "../src/services/advisory/sf10-autofill.service.js";

function fact(
  subjectId: string,
  subjectName: string,
  termNumber: number,
  rating: number,
): GradeFact {
  return { subjectId, subjectName, termNumber, rating };
}

describe("SF10 auto-fill row builder", () => {
  it("maps terms 1-3 into Q1-Q3 with a blank Q4", () => {
    const { rows } = buildAutofillRows(
      [
        fact("s1", "Mathematics", 1, 88),
        fact("s1", "Mathematics", 2, 90),
        fact("s1", "Mathematics", 3, 92),
      ],
      "G7",
      [1, 2, 3],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quarters).toEqual([88, 90, 92, null]);
  });

  it("rounds the subject rating from the term mean", () => {
    const { rows } = buildAutofillRows(
      [
        fact("s1", "Science", 1, 88),
        fact("s1", "Science", 2, 89),
        fact("s1", "Science", 3, 90),
      ],
      "G7",
      [1, 2, 3],
    );
    expect(rows[0].rating).toBe(89);
  });

  it("rounds half up (89.5 -> 90)", () => {
    const { rows } = buildAutofillRows(
      [
        fact("s1", "Science", 1, 89),
        fact("s1", "Science", 2, 90),
        fact("s1", "Science", 3, 90),
      ],
      "G7",
      [1, 2, 3],
    );
    expect(rows[0].rating).toBe(90);
  });

  it("marks PASSED at 75 and FAILED below", () => {
    const pass = buildAutofillRows(
      [fact("s1", "English", 1, 75), fact("s1", "English", 2, 75), fact("s1", "English", 3, 75)],
      "G7",
      [1, 2, 3],
    );
    const fail = buildAutofillRows(
      [fact("s2", "English", 1, 74), fact("s2", "English", 2, 74), fact("s2", "English", 3, 74)],
      "G7",
      [1, 2, 3],
    );
    expect(pass.rows[0].remarks).toBe("PASSED");
    expect(fail.rows[0].remarks).toBe("FAILED");
  });

  it("fills each locked term into its own quarter, term by term", () => {
    const { rows, skipped } = buildAutofillRows(
      [fact("s1", "Mathematics", 2, 90)],
      "G7",
      [1, 2, 3],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quarters).toEqual([null, 90, null, null]);
    expect(rows[0].rating).toBe(90);
    expect(skipped).toHaveLength(0);
  });

  it("keeps a partial subject's filled quarters when a sibling is also partial", () => {
    const { rows } = buildAutofillRows(
      [
        fact("s1", "Mathematics", 1, 90),
        fact("s1", "Mathematics", 2, 90),
        fact("s1", "Mathematics", 3, 90),
        fact("s2", "Science", 1, 80),
      ],
      "G7",
      [1, 2, 3],
    );
    expect(rows.map((r) => r.subject)).toEqual(["Mathematics", "Science"]);
    expect(rows.find((r) => r.subject === "Science")?.quarters).toEqual([80, null, null, null]);
  });

  it("ignores non-finite ratings and keeps the finite quarters", () => {
    const { rows } = buildAutofillRows(
      [
        fact("s1", "Mathematics", 1, 90),
        fact("s1", "Mathematics", 2, Number.NaN),
        fact("s1", "Mathematics", 3, 90),
      ],
      "G7",
      [1, 2, 3],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quarters).toEqual([90, null, 90, null]);
  });

  it("derives a normalized subject key and sorts rows alphabetically", () => {
    const { rows } = buildAutofillRows(
      [
        fact("s1", "Science", 1, 90),
        fact("s1", "Science", 2, 90),
        fact("s1", "Science", 3, 90),
        fact("s2", "Mathematics", 1, 90),
        fact("s2", "Mathematics", 2, 90),
        fact("s2", "Mathematics", 3, 90),
      ],
      "G7",
      [1, 2, 3],
    );
    expect(rows[0].subject).toBe("Mathematics");
    expect(rows[0].norm).toBeTruthy();
  });
});
