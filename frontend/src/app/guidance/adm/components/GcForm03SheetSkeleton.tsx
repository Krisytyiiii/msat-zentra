"use client";

import * as React from "react";
import {
  ShimmerGroup,
  ShimmerSkeleton,
} from "@/components/ui/shimmer-skeleton";
import sheetStyles from "./GcForm03PreviewDialog.module.css";
import styles from "./GcForm03SheetSkeleton.module.css";

/* Geometry lifted from the official template ("Referral Form - GCForm-03
   v11.xlsx"): the same 10 columns, the same 50 row heights (pt) and the same
   merge map. Rendering the placeholder on that grid means the skeleton is the
   exact footprint of the built sheet — when the workbook finishes the preview
   swaps in without a single pixel of reflow. */

/** Column widths in Excel units, A→J. */
const COLUMNS = [19, 11.5, 11.5, 11.5, 11.5, 14, 14, 12.5, 12.5, 12.5];

/** Row heights in points, rows 1–50. */
const ROWS = [
  22, 22, 22, 22, 30, 22, 22, 14, 28, 22, 28, 24, 26, 28, 24, 26, 26, 26, 24,
  28, 28, 28, 28, 28, 24, 28, 28, 34, 22, 20, 28, 20, 14, 24, 24, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 10, 24, 22, 14, 24, 24,
];

const MERGES = [
  "B1:J1", "B2:J2", "B3:J3", "B4:J4", "B5:J5", "B6:J6", "B7:J7",
  "A9:E9", "F9:G9", "A10:E10", "A11:B11", "C11:F11", "G11:H11", "I11:J11",
  "A12:J12", "A13:D13", "E13:G13", "H13:J13", "A14:D14", "E14:G14", "I14:J14",
  "A15:J15", "A16:J16", "A17:J17", "A18:J18", "A19:G19", "H19:J19",
  "B20:G20", "H20:J20", "B21:G21", "H21:J21", "B22:G22", "H22:J22",
  "B23:G23", "H23:J23", "B24:G24", "H24:J24", "A25:J25", "A26:J26", "A27:J27",
  "F28:J28", "F29:J29", "F30:J30", "A31:B31", "C31:E31", "G31:J31", "C32:E32",
  "A33:J33", "A34:J34", "A39:B39", "C39:J39", "A40:J40", "A41:J41",
  "A42:B42", "C42:J42", "A43:J43", "A44:J44", "A46:E46", "G46:J46",
  "A47:E47", "G47:J47", "A48:J48", "A49:B49", "C49:E49", "F49:G49", "H49:J49",
];

/** Rows the template draws a boxed table on — the only ones with cell rules. */
const BOXED_ROWS = new Set([
  15, 16, 17, 18, 20, 21, 22, 23, 24, 26, 27, 35, 36, 37, 38, 49, 50,
]);

/** Rules drawn as a hairline across the whole sheet (template rows 33 / 48). */
const RULE_ROWS = new Set([33, 48]);

type Content = {
  /** Bar width inside the (merged) cell. */
  w: string;
  /** Bar height in px. */
  h?: number;
  /** Horizontal placement of the bar. */
  align?: "left" | "center" | "right";
  /** Small checkbox square instead of a text bar. */
  square?: boolean;
};

/** Where the form's filled values land — one bar per field, on its cell. */
const CONTENT: Record<string, Content> = {
  B1: { w: "52%", h: 9, align: "center" },
  B2: { w: "34%", h: 9, align: "center" },
  B3: { w: "22%", h: 8, align: "center" },
  B4: { w: "46%", h: 8, align: "center" },
  B5: { w: "58%", h: 11, align: "center" },
  B6: { w: "64%", h: 8, align: "center" },
  B7: { w: "50%", h: 7, align: "center" },
  A9: { w: "32%", h: 12, align: "center" },
  F9: { w: "38%", h: 8 },
  A10: { w: "16%", h: 8 },
  A11: { w: "44%", h: 8 },
  C11: { w: "68%", h: 8 },
  G11: { w: "55%", h: 8 },
  I11: { w: "70%", h: 8 },
  A12: { w: "16%", h: 8 },
  A13: { w: "62%", h: 8 },
  E13: { w: "56%", h: 8 },
  H13: { w: "58%", h: 8 },
  A14: { w: "58%", h: 8 },
  E14: { w: "54%", h: 8 },
  I14: { w: "38%", h: 8 },
  A15: { w: "22%", h: 8 },
  A16: { w: "100%", h: 7 },
  A17: { w: "94%", h: 7 },
  A18: { w: "62%", h: 7 },
  A19: { w: "24%", h: 8 },
  H19: { w: "55%", h: 8 },
  B20: { w: "86%", h: 7 },
  B21: { w: "78%", h: 7 },
  B22: { w: "68%", h: 7 },
  B23: { w: "74%", h: 7 },
  B24: { w: "52%", h: 7 },
  H20: { w: "66%", h: 7 },
  H21: { w: "58%", h: 7 },
  H22: { w: "52%", h: 7 },
  A25: { w: "28%", h: 8 },
  A26: { w: "100%", h: 7 },
  A27: { w: "56%", h: 7 },
  F28: { w: "58%", h: 8 },
  F29: { w: "66%", h: 7 },
  F30: { w: "52%", h: 7 },
  A31: { w: "34%", h: 8 },
  F31: { w: "32%", h: 8 },
  C32: { w: "48%", h: 8 },
  A34: { w: "52%", h: 8, align: "center" },
  A35: { w: "58%", h: 8 },
  D35: { w: "52%", h: 8 },
  F35: { w: "62%", h: 8 },
  H35: { w: "55%", h: 8 },
  A36: { w: "70%", h: 7 },
  C36: { w: "10px", h: 10, square: true },
  D36: { w: "62%", h: 7 },
  F36: { w: "64%", h: 7 },
  H36: { w: "74%", h: 7 },
  A37: { w: "70%", h: 7 },
  C37: { w: "10px", h: 10, square: true },
  D37: { w: "58%", h: 7 },
  F37: { w: "60%", h: 7 },
  H37: { w: "70%", h: 7 },
  A38: { w: "70%", h: 7 },
  C38: { w: "10px", h: 10, square: true },
  D38: { w: "54%", h: 7 },
  F38: { w: "56%", h: 7 },
  H38: { w: "66%", h: 7 },
  A39: { w: "28%", h: 8 },
  A40: { w: "100%", h: 7 },
  A41: { w: "68%", h: 7 },
  A42: { w: "22%", h: 8 },
  A43: { w: "100%", h: 7 },
  A44: { w: "54%", h: 7 },
  A46: { w: "46%", h: 8 },
  G46: { w: "42%", h: 8 },
  A47: { w: "54%", h: 7 },
  G47: { w: "34%", h: 7 },
  A49: { w: "46%", h: 6 },
  C49: { w: "52%", h: 6 },
  F49: { w: "50%", h: 6 },
  H49: { w: "58%", h: 6 },
};

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

/** anchor → span, plus every cell a merge covers that is not its anchor. */
const SPANS = new Map<string, { rows: number; cols: number }>();
const SLAVES = new Set<string>();
for (const range of MERGES) {
  const [start, end] = range.split(":");
  const startCol = LETTERS.indexOf(start[0]) + 1;
  const startRow = Number(start.slice(1));
  const endCol = LETTERS.indexOf(end[0]) + 1;
  const endRow = Number(end.slice(1));
  const rows = endRow - startRow + 1;
  const cols = endCol - startCol + 1;
  SPANS.set(start, { rows, cols });
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const addr = `${LETTERS[c - 1]}${r}`;
      if (addr !== start) SLAVES.add(addr);
    }
  }
}

const TOTAL_UNITS = COLUMNS.reduce((sum, w) => sum + w, 0);

/**
 * Loading placeholder for the GCForm-03 overlay: the official template's own
 * grid (10 columns × 50 rows, real merges and boxed-table rows) filled with
 * shimmer bars exactly where the learner's values will land. It lives inside
 * the same white 852px export box as the built sheet, so the preview only
 * swaps content — never size — when the workbook is ready.
 */
export function GcForm03SheetSkeleton() {
  return (
    <ShimmerGroup>
      <div
        className={`gcform03-print-sheet ${sheetStyles.exportWrap} ${styles.sheet}`}
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading referral form"
      >
        {/* DepEd crest — the template insets the image ~60px from the left. */}
        <ShimmerSkeleton
          className={styles.logo}
          aria-hidden="true"
        />
        <table className={styles.table} aria-hidden="true">
          <colgroup>
            {COLUMNS.map((w, i) => (
              <col
                key={i}
                style={{ width: `${((w / TOTAL_UNITS) * 100).toFixed(2)}%` }}
              />
            ))}
          </colgroup>
          <tbody>
            {ROWS.map((pt, rowIndex) => {
              const row = rowIndex + 1;
              const cells: React.ReactNode[] = [];
              for (let col = 1; col <= COLUMNS.length; col += 1) {
                const addr = `${LETTERS[col - 1]}${row}`;
                if (SLAVES.has(addr)) continue;
                const span = SPANS.get(addr);
                const content = CONTENT[addr];
                cells.push(
                  <td
                    key={addr}
                    colSpan={span?.cols}
                    rowSpan={span?.rows}
                    className={
                      BOXED_ROWS.has(row) ? styles.boxed : styles.cell
                    }
                  >
                    {RULE_ROWS.has(row) ? (
                      <span className={styles.rule} />
                    ) : null}
                    {content ? (
                      <ShimmerSkeleton
                        className={styles.bar}
                        style={{
                          width: content.w,
                          height: content.h ?? 8,
                          marginLeft:
                            content.align === "center"
                              ? "auto"
                              : content.align === "right"
                                ? "auto"
                                : undefined,
                          marginRight:
                            content.align === "center" ? "auto" : undefined,
                          borderRadius: content.square ? 2 : 3,
                        }}
                      />
                    ) : null}
                  </td>,
                );
              }
              return (
                <tr key={row} style={{ height: `${pt}pt` }}>
                  {cells}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ShimmerGroup>
  );
}
