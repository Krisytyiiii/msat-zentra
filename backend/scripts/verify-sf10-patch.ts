/**
 * QA helper for the SF10 upload auto-fill patcher.
 *
 * Runs `patchSf10Workbook` against a real SF10 workbook (the file the registry
 * desk uploaded, or a blank downloaded template) with synthetic grades, then
 * prints the written rows so you can see the subjects, quarterly ratings,
 * final ratings and General Average, and flags any leftover placeholder zeroes
 * (`0` cells in an empty grade block are the old bug).
 *
 * Usage (from `backend/`):
 *   npx tsx scripts/verify-sf10-patch.ts <file-path-or-url> [G7..G12]
 *
 * Exit code 0 = rows written, no placeholder zeroes left.
 */
import ExcelJS from "exceljs";
import { patchSf10Workbook } from "../src/services/sf10/generated-file.service.js";
import { SF10_JHS_LAYOUT, assignSubjectRows } from "../src/services/sf10/template-file.service.js";

const JHS_SUBJECTS = [
  "English",
  "Mathematics",
  "Filipino",
  "Science",
  "Araling Panlipunan",
  "Technology and Livelihood Education",
  "MAPEH",
  "Edukasyon sa Pagpapakatao",
];

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && !(value instanceof Date)) {
    const v = value as { result?: unknown; richText?: Array<{ text?: string }> };
    if (v.result != null) return String(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? "").join("");
    return "";
  }
  return String(value);
}

async function readSource(source: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(source);
}

const [source, gradeArg] = process.argv.slice(2);
if (!source) {
  console.error("Usage: npx tsx scripts/verify-sf10-patch.ts <file-path-or-url> [G7..G12]");
  process.exit(2);
}
const grade = (gradeArg ?? "G7").toUpperCase();

if (!(grade in SF10_JHS_LAYOUT.blocks)) {
  console.error(`This helper covers the JHS book only (G7-G10). Got ${grade}.`);
  process.exit(2);
}

const rows = JHS_SUBJECTS.map((subject, i) => {
  const rating = 80 + i * 2;
  return {
    norm: subject.toLowerCase(),
    rawName: `${subject} ${grade.replace(/^G/, "")}`,
    gradeLevel: grade,
    quarters: [rating, rating + 1, rating + 2, null] as Array<number | null>,
    rating,
    remarks: rating >= 75 ? "PASSED" : "FAILED",
  };
});

const patched = await patchSf10Workbook(await readSource(source), rows);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(patched as unknown as ArrayBuffer);

const layout = SF10_JHS_LAYOUT.blocks[grade];
const sheet = wb.worksheets.find((ws) => {
  const headerRow = layout.subjectStart - 1;
  return (
    text(ws.getCell(headerRow, SF10_JHS_LAYOUT.quarterCols[0]).value) === "1" &&
    /final/i.test(text(ws.getCell(headerRow, SF10_JHS_LAYOUT.finalCol).value)) &&
    /remark/i.test(text(ws.getCell(headerRow, SF10_JHS_LAYOUT.remarksCol).value))
  );
});
if (!sheet) {
  console.error(`Could not find the ${grade} block in the patched workbook.`);
  process.exit(1);
}

console.log(`\n${grade} block (${sheet.name}):`);
let written = 0;
const placed = assignSubjectRows(rows, (row) => row.rawName);
for (const [offset, row] of placed) {
  const r = layout.subjectStart + offset;
  const subject = text(sheet.getCell(r, SF10_JHS_LAYOUT.subjectCol).value);
  if (subject) written += 1;
  const quarters = SF10_JHS_LAYOUT.quarterCols
    .map((c) => text(sheet.getCell(r, c).value) || "-")
    .join(" / ");
  const final = text(sheet.getCell(r, SF10_JHS_LAYOUT.finalCol).value) || "-";
  const remarks = text(sheet.getCell(r, SF10_JHS_LAYOUT.remarksCol).value) || "-";
  console.log(`  row ${r}: ${subject || "<blank>"} | Q ${quarters} | final ${final} | ${remarks}`);
}
const average = text(sheet.getCell(layout.generalAverageRow, SF10_JHS_LAYOUT.finalCol).value);
const expected = Math.round(rows.reduce((total, r) => total + r.rating, 0) / rows.length);
console.log(`  General Average: ${average || "<blank>"} (expected ${expected})`);

// Any 0 in a grade block is a placeholder: DepEd grades never print 0.
const zeroes: string[] = [];
for (const ws of wb.worksheets) {
  for (const [g, block] of Object.entries(SF10_JHS_LAYOUT.blocks)) {
    if (g === grade) continue;
    for (let r = block.subjectStart; r <= block.generalAverageRow; r += 1) {
      for (const c of [...SF10_JHS_LAYOUT.quarterCols, SF10_JHS_LAYOUT.finalCol]) {
        if (text(ws.getCell(r, c).value) === "0") zeroes.push(`${ws.name}!${ws.getCell(r, c).address}`);
      }
    }
  }
}

const failures: string[] = [];
if (written !== rows.length) failures.push(`wrote ${written}/${rows.length} subjects`);
if (average !== String(expected)) failures.push(`general average ${average || "<blank>"} != ${expected}`);
if (zeroes.length) failures.push(`placeholder zeroes: ${zeroes.join(", ")}`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.join("; ")}\n`);
  process.exit(1);
}
console.log(`\nPASS: ${written} subjects written, general average ${average}, no placeholder zeroes.\n`);
