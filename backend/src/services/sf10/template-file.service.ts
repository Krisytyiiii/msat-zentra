/**
 * Official SF10-JHS template rendering.
 *
 * The registrar/record-keeper upload flow patches whatever file was filed. A
 * JHS learner usually has no filed form yet, so this service fills the school's
 * own blank SF10 template (`assets/sf10-template.xlsx`) instead:
 *
 *  - `fillSf10Template` writes the learner block + the grade's subject rows into
 *    the template workbook and leaves every label, merge, border and formula
 *    master alone. The LEARNING AREAS column is blank in the template, so each
 *    filled row's learning area is written from Zentra's own subject name.
 *  - `renderSf10TemplatePdf` turns a filled workbook into a PDF at the exact
 *    print size the form is laid out for (10.4" × 13" portrait, margins
 *    top 0.1", left/right 0.25", bottom 0.75"). There is no XLSX→PDF engine in
 *    the stack, so the PDF is drawn from the workbook's own geometry: borders
 *    and text are placed at the cell coordinates Excel would print.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "../../lib/pino.js";
import { convertXlsxToPdf } from "./xlsx-to-pdf.service.js";

type ExcelJSModule = typeof import("exceljs");
type Workbook = import("exceljs").Workbook;
type Worksheet = import("exceljs").Worksheet;
type Cell = import("exceljs").Cell;
type Borders = import("exceljs").Borders;
type PaperSize = import("exceljs").PaperSize;

async function excelJs(): Promise<ExcelJSModule> {
  const imported = (await import("exceljs")) as unknown as ExcelJSModule & {
    default?: ExcelJSModule;
  };
  return imported.default ?? imported;
}

/* ------------------------------ school block ------------------------------ */

const SCHOOL_NAME = "MATI SCHOOL OF ARTS AND TRADES";
const SCHOOL_ID = "304326";
const SCHOOL_DISTRICT = "City of Mati";
// The header's Division field is narrow (AP20:AX20); the full "Schools Division
// of the City of Mati" overflows across the neighbouring labels, so the value
// matches the DepEd short form that already sits behind "Division:".
const SCHOOL_DIVISION = "City of Mati";
const SCHOOL_REGION = "XI";

/* ------------------------------- public API ------------------------------- */

export interface Sf10TemplateLearner {
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  suffix: string | null;
  lrn: string;
  /** Already formatted `mm/dd/yyyy`, or null to leave the cell blank. */
  birthdate: string | null;
  /** Raw profile value ("Male" / "Female"). */
  sex: string | null;
  /** G7–G10 — the JHS band this template covers. */
  gradeLevel: string;
  section: string;
  schoolYear: string;
  adviserName: string | null;
}

export interface Sf10TemplateSubjectRow {
  /** Learning-area name as stored in Zentra (e.g. "Music 7"). */
  subject: string;
  quarters: Array<number | null>;
  rating: number;
  remarks: "PASSED" | "FAILED";
}

export interface Sf10TemplateInput {
  learner: Sf10TemplateLearner;
  rows: Sf10TemplateSubjectRow[];
}

const TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "assets",
  "sf10-template.xlsx",
);

const SHS_TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "assets",
  "sf10-template-sshs.xlsx",
);

/** Header logos, shared with the anecdotal OCForm-01 workbook. */
const ANECDOTAL_ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "modules",
  "anecdotal",
  "assets",
);
const DEPED_SEAL_PATH = path.join(ANECDOTAL_ASSETS, "deped-seal.png");
const DEPED_LOGO_PATH = path.join(ANECDOTAL_ASSETS, "deped-logo.png");

let cachedTemplate: Buffer | null = null;
let cachedShsTemplate: Buffer | null = null;
let cachedDepedSeal: Buffer | null = null;
let cachedDepedLogo: Buffer | null = null;

async function loadTemplate(): Promise<Buffer> {
  if (!cachedTemplate) cachedTemplate = await readFile(TEMPLATE_PATH);
  return cachedTemplate;
}

async function loadShsTemplate(): Promise<Buffer> {
  if (!cachedShsTemplate) cachedShsTemplate = await readFile(SHS_TEMPLATE_PATH);
  return cachedShsTemplate;
}

/* ------------------------------ row mapping ------------------------------- */

/**
 * The learning-area rows of every JHS grade block are fixed by the DepEd form,
 * in this order (0 = first row of the block). MAPEH components get their own
 * rows, which is why "music"/"arts"/"physical education"/"health" are matched
 * before the umbrella "MAPEH" row — the subject normalizer collapses all of
 * them to one key, so this matcher must read the display name instead.
 */
const SUBJECT_ROWS: Array<{ offset: number; test: RegExp }> = [
  { offset: 7, test: /music/i },
  { offset: 8, test: /\barts\b/i },
  { offset: 9, test: /(physical education|\bpe\b)/i },
  { offset: 10, test: /health/i },
  { offset: 6, test: /mapeh/i },
  { offset: 5, test: /(technology and livelihood|\btle\b|\bepp\b|\bstve\b)/i },
  { offset: 11, test: /(edukasyon|edukasyong|\besp\b)/i },
  { offset: 4, test: /(araling|panlipunan|\baral\b|\bap\b)/i },
  { offset: 0, test: /english/i },
  { offset: 1, test: /(mathematics|\bmath\b)/i },
  { offset: 2, test: /filipino/i },
  { offset: 3, test: /science/i },
];

export function templateRowOffsetFor(subject: string): number | null {
  for (const { offset, test } of SUBJECT_ROWS) {
    if (test.test(subject)) return offset;
  }
  return null;
}

/** DepEd learning-area rows per JHS block (12 on every grade). */
const JHS_SUBJECT_ROWS = 12;

/**
 * Assign each auto-filled subject to a learning-area row. Rows always fill
 * from the first learning area down — never leaving a gap in the middle — and
 * DepEd's printed order (English, Math, Filipino, Science, AP, TLE, MAPEH,
 * Music, Arts, PE, Health, ESP) is kept for the subjects that match it.
 * Anything else (a teacher's short name like "Aral Pan", a school-specific
 * subject) follows in the order given instead of being silently dropped.
 */
export function assignSubjectRows<T>(
  rows: T[],
  nameOf: (row: T) => string,
): Map<number, T> {
  const ranked = rows.map((row, index) => ({
    row,
    index,
    // Unknown subjects rank after the twelve printed learning areas.
    rank: templateRowOffsetFor(nameOf(row)) ?? JHS_SUBJECT_ROWS,
  }));
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);

  const slots = new Map<number, T>();
  let offset = 0;
  for (const entry of ranked) {
    if (offset >= JHS_SUBJECT_ROWS) break;
    slots.set(offset, entry.row);
    offset += 1;
  }
  return slots;
}

/**
 * One printed page carries two grade blocks: Page 1 (Sheet1) holds G7 and G8,
 * Page 2 (Sheet2) holds G9 and G10. Each block repeats the same column layout
 * (U/Y/AC/AG quarters, AJ final rating, AP remarks), so only the anchor rows
 * differ. A learner's grades go into their own grade's block and every other
 * block is left blank, exactly as the official form is filled by hand.
 */
interface GradeBlock {
  sheet: string;
  schoolRow: number;
  gradeRow: number;
  subjectStart: number;
  generalAverageRow: number;
}

const GRADE_BLOCKS: Record<string, GradeBlock> = {
  G7: { sheet: "Sheet1", schoolRow: 20, gradeRow: 21, subjectStart: 25, generalAverageRow: 37 },
  G8: { sheet: "Sheet1", schoolRow: 46, gradeRow: 47, subjectStart: 51, generalAverageRow: 63 },
  G9: { sheet: "Sheet2", schoolRow: 3, gradeRow: 4, subjectStart: 8, generalAverageRow: 20 },
  G10: { sheet: "Sheet2", schoolRow: 29, gradeRow: 30, subjectStart: 34, generalAverageRow: 48 },
};

/** Quarter value cells (merged anchors) and final/remarks anchors per block. */
const QUARTER_COLS = [21, 25, 29, 33];
const FINAL_COL = 36;
const REMARKS_COL = 42;

/**
 * The school template's own JHS geometry. The upload auto-fill also uses it:
 * a freshly downloaded blank form has no LEARNING AREAS names, so the patcher
 * writes the learner's rows into their fixed DepEd positions instead of
 * matching names that are not there.
 */
export const SF10_JHS_LAYOUT = {
  blocks: GRADE_BLOCKS,
  subjectCol: 2,
  quarterCols: QUARTER_COLS,
  finalCol: FINAL_COL,
  remarksCol: REMARKS_COL,
} as const;

/* ------------------------------- XLSX fill -------------------------------- */

function writeCell(ws: Worksheet, row: number, col: number, value: string | number | null): void {
  ws.getRow(row).getCell(col).value = value;
}

/**
 * The template's Section value cell (N21) ships one size smaller than the
 * other scholastic-header values, which made an auto-filled section print
 * smaller than the adviser name beside it. Copy the reference cell's font so
 * every filled header value prints identically.
 */
function matchCellFont(target: Cell, reference: Cell): void {
  if (!reference.font) return;
  target.font = { ...reference.font };
}

/**
 * Replace formula cells in the given rows with their cached results before
 * rewriting them. The form shares the final-rating/remarks formulas across a
 * grade block; overwriting a master while clones still point at it leaves the
 * workbook unserializable (same guard as the upload auto-fill path).
 */
function flattenRowsFormulas(ws: Worksheet, rows: number[], width: number): void {
  for (const r of new Set(rows)) {
    const row = ws.getRow(r);
    for (let c = 1; c <= width; c += 1) {
      const cell = row.getCell(c);
      const value = cell.value;
      if (!value || typeof value !== "object" || value instanceof Date) continue;
      const obj = value as { formula?: unknown; sharedFormula?: unknown; result?: unknown };
      if (typeof obj.formula !== "string" && typeof obj.sharedFormula !== "string") continue;
      const result = obj.result;
      cell.value =
        typeof result === "number" || typeof result === "string" || typeof result === "boolean"
          ? result
          : null;
    }
  }
}

/**
 * One page per sheet, both pages printed at the same size and centred.
 *
 * Fit-to-page scales each sheet independently, so the taller second page came
 * out visibly narrower than the first. Instead the tightest fit across both
 * sheets is used as a fixed scale for both, the single column whose width
 * differs between the sheets is equalised, and the print area is trimmed to the
 * form itself (B..BC, no empty column A) so both pages share one width and sit
 * centred on the paper.
 */
const PRINT_PAPER_A3 = 8 as PaperSize;
const A3_WIDTH_PT = 841.89; // 297mm
const A3_HEIGHT_PT = 1190.55; // 420mm
// Symmetric on all four sides: the sheets are centred inside the margins, so
// unequal top/bottom margins would make the form sit visibly below centre.
const PRINT_MARGINS_PT = { left: 18, right: 18, top: 18, bottom: 18 };
const PRINT_FIRST_COL = 2; // B
const PRINT_LAST_COL = 55; // BC

/** Excel column width (characters) → points at 96 dpi (print-geometry copy). */
function printColumnPt(width: number | undefined): number {
  const w = width && width > 0 ? width : 8.43;
  const px = Math.round(((256 * w + Math.round(128 / 7)) / 256) * 7);
  return px * 0.75;
}

function contentLastRow(ws: Worksheet): number {
  let lastRow = 0;
  ws.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
    lastRow = Math.max(lastRow, rowNumber);
  });
  return Math.max(lastRow, 1);
}

function rowHeightPt(ws: Worksheet, row: number): number {
  const height = ws.getRow(row).height;
  if (height && height > 0) return height;
  return ws.properties.defaultRowHeight ?? 15;
}

function applyPrintSetup(sheets: Worksheet[]): void {
  if (sheets.length === 0) return;

  // Both pages print the same column span, so a column that differs between
  // them would print each page at a different width.
  for (let c = PRINT_FIRST_COL; c <= PRINT_LAST_COL; c += 1) {
    const widest = Math.max(...sheets.map((s) => s.getColumn(c).width ?? 0));
    for (const sheet of sheets) sheet.getColumn(c).width = widest;
  }

  const availW = A3_WIDTH_PT - PRINT_MARGINS_PT.left - PRINT_MARGINS_PT.right;
  const availH = A3_HEIGHT_PT - PRINT_MARGINS_PT.top - PRINT_MARGINS_PT.bottom;
  let scale = 1;
  for (const sheet of sheets) {
    const lastRow = contentLastRow(sheet);
    let width = 0;
    for (let c = PRINT_FIRST_COL; c <= PRINT_LAST_COL; c += 1) {
      width += printColumnPt(sheet.getColumn(c).width);
    }
    let height = 0;
    for (let r = 1; r <= lastRow; r += 1) height += rowHeightPt(sheet, r);
    scale = Math.min(scale, availW / width, availH / height);
  }
  // Whole percent, rounded down with a point of slack so the printer never
  // spills a sheet onto a second page for a fraction of a millimetre.
  const percent = Math.max(10, Math.floor(scale * 100) - 1);

  for (const sheet of sheets) {
    const setup = sheet.pageSetup;
    setup.paperSize = PRINT_PAPER_A3;
    setup.orientation = "portrait";
    setup.fitToPage = false;
    setup.scale = percent;
    setup.horizontalCentered = true;
    setup.verticalCentered = true;
    setup.horizontalDpi = 600;
    setup.verticalDpi = 600;
    setup.margins = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 };
    setup.printArea = `B1:BC${contentLastRow(sheet)}`;
  }
}

/**
 * Give an auto-fill render the paper geometry of the school's own form before
 * it is converted to PDF. Uploaded workbooks regularly ship with no usable page
 * setup (that is exactly why the template path pins one), so printing a patched
 * copy used to lay the form out at a different scale and margin than the form
 * the adviser sees on the template/PDF paths.
 *
 * Sheets that span the official form get the template's setup verbatim (A3
 * portrait, one scale shared by both pages, print area B..BC); anything
 * narrower is fitted to a single A3 page so it can never spill sideways.
 */
export function applySf10PrintSetup(wb: Workbook): void {
  const sheets = wb.worksheets.filter((ws) => contentLastRow(ws) > 1);
  if (sheets.length === 0) return;
  if (sheets.every((ws) => ws.columnCount >= PRINT_LAST_COL)) {
    applyPrintSetup(sheets);
    return;
  }
  for (const ws of sheets) {
    const lastRow = contentLastRow(ws);
    const lastCol = Math.max(1, ws.columnCount);
    const setup = ws.pageSetup;
    setup.paperSize = PRINT_PAPER_A3;
    setup.orientation = "portrait";
    setup.fitToPage = true;
    setup.fitToWidth = 1;
    setup.fitToHeight = 1;
    setup.horizontalCentered = true;
    setup.verticalCentered = true;
    setup.horizontalDpi = 600;
    setup.verticalDpi = 600;
    setup.margins = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 };
    setup.printArea = `A1:${ws.getColumn(lastCol).letter}${lastRow}`;
  }
}

/* --------------------------- official-form details -------------------------- */

// The DepEd SF10-JHS band is a light olive/cream, not the neutral grey the
// school workbook shipped with.
const OFFICIAL_BAND_ARGB = "FFDCD9C3";
const JHS_BAND_ROWS = [5, 9, 18, 72];
const JHS_PAGE2_BAND_ROWS = [84];

/** Repaint the heading bands of one sheet in the official olive. */
function applyBandFill(ws: Worksheet, rows: number[]): void {
  for (const row of rows) {
    const cell = ws.getCell(row, 2);
    cell.style = {
      ...cell.style,
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: OFFICIAL_BAND_ARGB },
      },
    };
  }
}

async function loadDepedSeal(): Promise<Buffer> {
  if (!cachedDepedSeal) cachedDepedSeal = await readFile(DEPED_SEAL_PATH);
  return cachedDepedSeal;
}

async function loadDepedLogo(): Promise<Buffer> {
  if (!cachedDepedLogo) cachedDepedLogo = await readFile(DEPED_LOGO_PATH);
  return cachedDepedLogo;
}

/**
 * The official form prints a small open square before each credential label.
 * The workbook keeps those cells empty (and merged), so the spacer is split
 * and the square is drawn as the cell's own four borders — that prints as a
 * crisp box in both LibreOffice and the hand-drawn fallback, with no glyph
 * fallback that could render too small.
 */
function setCheckbox(ws: Worksheet, range: string, address: string): void {
  ws.unMergeCells(range);
  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const cell = ws.getCell(address);
  // ExcelJS shares one style object between cells loaded from the same xf;
  // assigning `cell.border` would paint every cell that shares it. Replace the
  // whole style object so only this cell changes.
  cell.style = {
    ...cell.style,
    border: { top: thin, bottom: thin, left: thin, right: thin },
  };
}

/**
 * Restore the details of the DepEd form that the school's editable workbook
 * does not carry: the olive band behind the section headings, the credential
 * checkboxes, and the MSAT crest / DepEd logo in the page header. Applied to
 * the first sheet (the face of the form) on every fill, so the template file
 * itself stays untouched.
 */
async function applyOfficialJhsLook(wb: Workbook, ws: Worksheet): Promise<void> {
  applyBandFill(ws, JHS_BAND_ROWS);
  const page2 = wb.getWorksheet("Sheet2");
  if (page2) applyBandFill(page2, JHS_PAGE2_BAND_ROWS);

  setCheckbox(ws, "B11:C11", "B11");
  setCheckbox(ws, "B15:C15", "B15");
  setCheckbox(ws, "R15:W15", "W15");
  setCheckbox(ws, "AN15:AP15", "AP15");

  // LibreOffice clips these merged labels at the print-area edge when the
  // fixed scale is used; pinning them left and shrinking to the merge width
  // keeps the whole label on the page (the template relied on overflow into
  // the neighbouring blank cell, which a written value now occupies).
  for (const address of ["B6", "B7"]) {
    const cell = ws.getCell(address);
    cell.style = {
      ...cell.style,
      alignment: {
        horizontal: "left",
        vertical: "middle",
        wrapText: false,
        shrinkToFit: true,
      },
    };
  }
  for (const address of ["D16", "AJ75"]) {
    const cell = ws.getCell(address);
    cell.style = {
      ...cell.style,
      alignment: {
        ...(cell.alignment ?? {}),
        wrapText: false,
        shrinkToFit: true,
      },
    };
  }

  // The certification sentence in B74/B86 starts in the merged cell's first
  // column; the print area begins at column B, so a label with no indent loses
  // its opening "I " at the page edge. Pin it left with one indent step, exactly
  // as the official form prints it.
  for (const [sheet, address] of [
    [ws, "B74"],
    [page2, "B86"],
  ] as const) {
    if (!sheet) continue;
    const cell = sheet.getCell(address);
    cell.style = {
      ...cell.style,
      alignment: {
        ...(cell.alignment ?? {}),
        horizontal: "left",
        indent: 1,
        wrapText: false,
      },
    };
  }

  // An SF10 carries only the official DepEd seal (upper left) and logo (upper
  // right) — never a school crest (DepEd Service Marks manual; DO 009, s. 2026).
  // The school's editable workbook ships with no header images at all, so both
  // marks are drawn here.
  const [seal, deped] = await Promise.all([loadDepedSeal(), loadDepedLogo()]);
  const leftId = wb.addImage({ base64: seal.toString("base64"), extension: "png" });
  ws.addImage(leftId, {
    tl: { col: 9.5, row: 0.34 },
    ext: { width: 80, height: 80 },
  });
  const rightId = wb.addImage({ base64: deped.toString("base64"), extension: "png" });
  ws.addImage(rightId, {
    tl: { col: 48.5, row: 0.34 },
    ext: { width: 116, height: 59 },
  });
}

/**
 * True when this sheet carries the school template's own block geometry (its
 * quarter header cells read 1–4 exactly where the template puts them).
 */
function carriesJhsBlock(ws: Worksheet, block: GradeBlock): boolean {
  if (block.sheet !== ws.name) return false;
  const header = ws.getRow(block.subjectStart - 1);
  return QUARTER_COLS.every((col, i) => cellText(header.getCell(col).value) === String(i + 1));
}

/**
 * Apply the official DepEd JHS look (olive heading bands, credential
 * checkboxes, MSAT crest + DepEd logo) to an uploaded workbook that still
 * carries the school template's geometry. A form that already has its own
 * images (a real DepEd export or scan) keeps them untouched.
 */
export async function applySf10JhsLook(wb: Workbook): Promise<boolean> {
  const first = wb.getWorksheet("Sheet1");
  if (!first) return false;
  if (wb.worksheets.some((ws) => ws.getImages().length > 0)) return false;
  const matches = Object.values(GRADE_BLOCKS).some((block) => carriesJhsBlock(first, block));
  if (!matches) return false;
  await applyOfficialJhsLook(wb, first);
  return true;
}

export interface Sf10JhsHeaderValues {
  section: string;
  schoolYear: string;
  adviserName: string | null;
}

/**
 * Write the scholastic header of one grade block: the school details and the
 * block's grade number belong to the form; section, school year and adviser are
 * the learner's current enrollment. Shared by the template render and by the
 * patched registry upload so both paths print the same header.
 */
export function writeJhsBlockHeader(
  ws: Worksheet,
  block: { schoolRow: number; gradeRow: number },
  gradeKey: string,
  values: Sf10JhsHeaderValues,
): void {
  writeCell(ws, block.schoolRow, 5, SCHOOL_NAME);
  writeCell(ws, block.schoolRow, 21, SCHOOL_ID);
  writeCell(ws, block.schoolRow, 30, SCHOOL_DISTRICT);
  writeCell(ws, block.schoolRow, 42, SCHOOL_DIVISION);
  writeCell(ws, block.schoolRow, 54, SCHOOL_REGION);
  writeCell(ws, block.gradeRow, 9, gradeKey.replace(/^G/, ""));
  writeCell(ws, block.gradeRow, 14, values.section);
  writeCell(ws, block.gradeRow, 22, values.schoolYear);
  writeCell(ws, block.gradeRow, 35, values.adviserName ?? "");

  // The template's Section cell is a size smaller than the grade/adviser
  // values; print every filled header value in the adviser value's font.
  const headerRow = ws.getRow(block.gradeRow);
  const headerFont = headerRow.getCell(35);
  for (const col of [9, 14, 22, 35]) matchCellFont(headerRow.getCell(col), headerFont);
}

export async function fillSf10Template(input: Sf10TemplateInput): Promise<Buffer> {
  const ExcelJS = await excelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await loadTemplate()) as unknown as ArrayBuffer);

  const L = input.learner;
  const gradeKey = L.gradeLevel.toUpperCase().replace(/^GRADE\s*/i, "G");
  const block = GRADE_BLOCKS[gradeKey];
  if (!block) {
    throw new Error(`SF10-JHS template has no grade block for ${L.gradeLevel}`);
  }
  const ws = wb.getWorksheet(block.sheet) ?? wb.worksheets[0];
  if (!ws) throw new Error("SF10 template has no worksheet");

  // Learner block (merged value cells; writing the anchor is enough). Only the
  // first page repeats the learner's identity.
  const identity = wb.getWorksheet("Sheet1") ?? ws;
  await applyOfficialJhsLook(wb, identity);
  writeCell(identity, 6, 7, L.lastName ?? "");
  writeCell(identity, 6, 23, L.firstName ?? "");
  writeCell(identity, 6, 40, L.suffix ?? "");
  writeCell(identity, 6, 50, L.middleName ?? "");
  writeCell(identity, 7, 13, L.lrn);
  writeCell(identity, 7, 34, L.birthdate ?? "");
  writeCell(identity, 7, 48, L.sex ?? "");

  // Scholastic header for the learner's own grade block only. Other blocks stay
  // blank — the form is filled by hand as the learner reaches those grades, and
  // the current section/adviser does not apply to them.
  writeJhsBlockHeader(ws, block, gradeKey, {
    section: L.section,
    schoolYear: L.schoolYear,
    adviserName: L.adviserName ?? null,
  });

  const slots = assignSubjectRows(input.rows, (row) => row.subject);

  // Subject rows run from the block's first row to the row before its General
  // Average band (12 learning areas on every JHS block).
  const touchedRows: number[] = [];
  for (let i = 0; i < 12; i += 1) touchedRows.push(block.subjectStart + i);
  touchedRows.push(block.generalAverageRow);
  flattenRowsFormulas(ws, touchedRows, ws.columnCount);

  // The school template ships with the LEARNING AREAS column blank, so the
  // learning area is written from the learner's own subject, not a printed
  // DepEd default that would not match Zentra's subject names.
  for (const [offset, filled] of slots) {
    const rowNumber = block.subjectStart + offset;
    writeCell(ws, rowNumber, 2, filled.subject);
    QUARTER_COLS.forEach((col, i) => {
      writeCell(ws, rowNumber, col, filled.quarters[i] ?? null);
    });
    writeCell(ws, rowNumber, FINAL_COL, filled.rating);
    writeCell(ws, rowNumber, REMARKS_COL, filled.remarks);
  }

  // General average over the rows actually written. The template's own formula
  // expects four quarters per subject; Zentra runs trimesters, so the captured
  // rating is the correct basis. Cleared when nothing was written — the blank
  // template pre-prints a 100 in this cell, which is not the learner's average.
  const average =
    slots.size > 0
      ? Math.round(
          [...slots.values()].reduce((total, r) => total + r.rating, 0) / slots.size,
        )
      : null;
  writeCell(ws, block.generalAverageRow, FINAL_COL, average);

  // Every other grade block is left blank, as the form is filled by hand — but
  // the template pre-prints a 100 average in each, which would print as if the
  // learner had earned it. Clear those placeholder averages.
  for (const [key, other] of Object.entries(GRADE_BLOCKS)) {
    if (key === gradeKey) continue;
    const otherSheet = wb.getWorksheet(other.sheet);
    if (!otherSheet) continue;
    writeCell(otherSheet, other.generalAverageRow, FINAL_COL, null);
  }

  // Applied last so the print area and scale cover the filled content.
  applyPrintSetup(wb.worksheets);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ------------------------------- SHS fill --------------------------------- */

/**
 * The Strengthened SHS form (SF10-SHS v2026) is a different book from the JHS
 * one: it has no per-grade "block" section, but one FRONT sheet for Grade 11
 * and one BACK sheet for Grade 12, each carrying a FIRST and a SECOND semester
 * table plus a final-grades summary. Every semester table only has two quarter
 * columns (Q1/Q2 on the first, Q3/Q4 on the second), which fits Zentra's
 * trimester: terms 1–2 land in the first semester and term 3 in the second,
 * Q4 stays blank.
 *
 * The template ships with sample subjects, tags and formulas. The fill rewrites
 * the touched rows with plain values (formulas flattened first so a shared
 * formula master is never overwritten), clears the grade sheet that does not
 * belong to this learner, and leaves the printed page setup exactly as DepEd
 * shipped it.
 */
interface ShsSemBlock {
  headerRow: number;
  trackRow: number;
  subjectStart: number;
  subjectRows: number;
  /** Rows whose REMARK cells sit under the form's printed computation note. */
  noteRows?: [number, number];
}

interface ShsGradeSheet {
  sheet: string;
  blocks: [ShsSemBlock, ShsSemBlock];
  summaryStart: number;
  summaryRows: number;
  generalAverageRow: number;
}

const SHS_GRADE_SHEETS: Record<string, ShsGradeSheet> = {
  G11: {
    sheet: "FRONT",
    blocks: [
      { headerRow: 22, trackRow: 23, subjectStart: 28, subjectRows: 14, noteRows: [28, 34] },
      { headerRow: 61, trackRow: 62, subjectStart: 67, subjectRows: 14, noteRows: [67, 73] },
    ],
    summaryStart: 104,
    summaryRows: 18,
    generalAverageRow: 123,
  },
  G12: {
    sheet: "BACK",
    blocks: [
      { headerRow: 3, trackRow: 4, subjectStart: 9, subjectRows: 10 },
      { headerRow: 38, trackRow: 39, subjectStart: 44, subjectRows: 10 },
    ],
    summaryStart: 77,
    summaryRows: 12,
    generalAverageRow: 89,
  },
};

/** R = Q1/Q3, S = Q2/Q4, T = semestral grade, U = action taken, W = remark. */
const SHS_QUARTER_COLS = [18, 19] as const;
const SHS_SEMESTRAL_COL = 20;
const SHS_ACTION_COL = 21;
const SHS_REMARK_COL = 23;
/** Summary table: Q..T quarters, U/V semestral grades, W average, X action. */
const SHS_SUMMARY_COLS = { q: 17, q2: 18, q3: 19, q4: 20, sem1: 21, sem2: 22, ave: 23, action: 24 };
const SHS_HEADER_COLS = {
  school: 3,
  schoolId: 14,
  gradeLevel: 19,
  section: 23,
  track: 3,
  schoolYear: 19,
};

function meanOf(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length === 0) return null;
  return Math.round(clean.reduce((total, v) => total + v, 0) / clean.length);
}

function inNoteRows(block: ShsSemBlock, row: number): boolean {
  return !!block.noteRows && row >= block.noteRows[0] && row <= block.noteRows[1];
}

/** Every row the fill rewrites, so shared formulas can be flattened first. */

function clearShsSheet(ws: Worksheet, sheet: ShsGradeSheet): void {
  for (const block of sheet.blocks) {
    for (const col of [SHS_HEADER_COLS.school, SHS_HEADER_COLS.schoolId, SHS_HEADER_COLS.gradeLevel, SHS_HEADER_COLS.section]) {
      writeCell(ws, block.headerRow, col, null);
    }
    for (const col of [SHS_HEADER_COLS.track, SHS_HEADER_COLS.schoolYear]) {
      writeCell(ws, block.trackRow, col, null);
    }
    for (let i = 0; i < block.subjectRows; i += 1) {
      const row = block.subjectStart + i;
      writeCell(ws, row, 1, null);
      writeCell(ws, row, 2, null);
      writeCell(ws, row, 4, null);
      writeCell(ws, row, SHS_QUARTER_COLS[0], null);
      writeCell(ws, row, SHS_QUARTER_COLS[1], null);
      writeCell(ws, row, SHS_SEMESTRAL_COL, null);
      writeCell(ws, row, SHS_ACTION_COL, null);
      if (!inNoteRows(block, row)) writeCell(ws, row, SHS_REMARK_COL, null);
    }
  }
  for (let i = 0; i < sheet.summaryRows; i += 1) {
    const row = sheet.summaryStart + i;
    writeCell(ws, row, 1, null);
    writeCell(ws, row, 2, null);
    writeCell(ws, row, 4, null);
    for (const col of Object.values(SHS_SUMMARY_COLS)) writeCell(ws, row, col, null);
  }
  writeCell(ws, sheet.generalAverageRow, SHS_SUMMARY_COLS.ave, null);
  writeCell(ws, sheet.generalAverageRow, SHS_SUMMARY_COLS.action, null);
}

function writeShsHeaders(ws: Worksheet, sheet: ShsGradeSheet, gradeNumber: string, learner: Sf10TemplateLearner): void {
  for (const block of sheet.blocks) {
    writeCell(ws, block.headerRow, SHS_HEADER_COLS.school, SCHOOL_NAME);
    writeCell(ws, block.headerRow, SHS_HEADER_COLS.schoolId, SCHOOL_ID);
    writeCell(ws, block.headerRow, SHS_HEADER_COLS.gradeLevel, gradeNumber);
    writeCell(ws, block.headerRow, SHS_HEADER_COLS.section, learner.section);
    writeCell(ws, block.trackRow, SHS_HEADER_COLS.track, null);
    writeCell(ws, block.trackRow, SHS_HEADER_COLS.schoolYear, learner.schoolYear);
  }
}

function writeShsSemester(
  ws: Worksheet,
  block: ShsSemBlock,
  rows: Sf10TemplateSubjectRow[],
  quarterOffset: 0 | 2,
): void {
  for (let i = 0; i < block.subjectRows; i += 1) {
    const row = block.subjectStart + i;
    const filled = rows[i];
    if (!filled) {
      writeCell(ws, row, 1, null);
      writeCell(ws, row, 2, null);
      writeCell(ws, row, 4, null);
      writeCell(ws, row, SHS_QUARTER_COLS[0], null);
      writeCell(ws, row, SHS_QUARTER_COLS[1], null);
      writeCell(ws, row, SHS_SEMESTRAL_COL, null);
      writeCell(ws, row, SHS_ACTION_COL, null);
      if (!inNoteRows(block, row)) writeCell(ws, row, SHS_REMARK_COL, null);
      continue;
    }
    const quarterValues = [filled.quarters[quarterOffset], filled.quarters[quarterOffset + 1]];
    writeCell(ws, row, 1, i + 1);
    writeCell(ws, row, 4, filled.subject);
    writeCell(ws, row, SHS_QUARTER_COLS[0], quarterValues[0] ?? null);
    writeCell(ws, row, SHS_QUARTER_COLS[1], quarterValues[1] ?? null);
    writeCell(ws, row, SHS_SEMESTRAL_COL, meanOf(quarterValues));
    writeCell(ws, row, SHS_ACTION_COL, filled.remarks);
    if (!inNoteRows(block, row)) writeCell(ws, row, SHS_REMARK_COL, filled.remarks);
  }
}

function writeShsSummary(ws: Worksheet, sheet: ShsGradeSheet, rows: Sf10TemplateSubjectRow[]): void {
  for (let i = 0; i < sheet.summaryRows; i += 1) {
    const row = sheet.summaryStart + i;
    const filled = rows[i];
    if (!filled) {
      writeCell(ws, row, 1, null);
      writeCell(ws, row, 2, null);
      writeCell(ws, row, 4, null);
      for (const col of Object.values(SHS_SUMMARY_COLS)) writeCell(ws, row, col, null);
      continue;
    }
    writeCell(ws, row, 1, i + 1);
    writeCell(ws, row, 4, filled.subject);
    writeCell(ws, row, SHS_SUMMARY_COLS.q, filled.quarters[0] ?? null);
    writeCell(ws, row, SHS_SUMMARY_COLS.q2, filled.quarters[1] ?? null);
    writeCell(ws, row, SHS_SUMMARY_COLS.q3, filled.quarters[2] ?? null);
    writeCell(ws, row, SHS_SUMMARY_COLS.q4, filled.quarters[3] ?? null);
    writeCell(ws, row, SHS_SUMMARY_COLS.sem1, meanOf([filled.quarters[0], filled.quarters[1]]));
    writeCell(ws, row, SHS_SUMMARY_COLS.sem2, meanOf([filled.quarters[2], filled.quarters[3]]));
    writeCell(ws, row, SHS_SUMMARY_COLS.ave, filled.rating);
    writeCell(ws, row, SHS_SUMMARY_COLS.action, filled.remarks);
  }

  const average = meanOf(rows.map((r) => r.rating));
  writeCell(ws, sheet.generalAverageRow, SHS_SUMMARY_COLS.ave, average);
  writeCell(
    ws,
    sheet.generalAverageRow,
    SHS_SUMMARY_COLS.action,
    average === null ? null : average >= 75 ? "PASSED" : "FAILED",
  );
}

export async function fillShsSf10Template(input: Sf10TemplateInput): Promise<Buffer> {
  const ExcelJS = await excelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await loadShsTemplate()) as unknown as ArrayBuffer);

  const L = input.learner;
  const gradeKey = L.gradeLevel.toUpperCase().replace(/^GRADE\s*/i, "G");
  const sheetDef = SHS_GRADE_SHEETS[gradeKey];
  if (!sheetDef) throw new Error(`SF10-SHS template has no grade block for ${L.gradeLevel}`);
  const otherDef = SHS_GRADE_SHEETS[gradeKey === "G11" ? "G12" : "G11"];
  const ws = wb.getWorksheet(sheetDef.sheet);
  const otherWs = wb.getWorksheet(otherDef.sheet);
  if (!ws || !otherWs) throw new Error("SF10-SHS template is missing its grade sheets");

  // Learner identity lives on the FRONT sheet even when the grades are G12's.
  const identity = wb.getWorksheet("FRONT") ?? ws;
  writeCell(identity, 7, 3, L.lastName ?? "");
  writeCell(identity, 7, 11, L.firstName ?? "");
  writeCell(identity, 7, 19, L.middleName ?? "");
  writeCell(identity, 7, 24, L.suffix ?? "");
  writeCell(identity, 8, 3, L.lrn);
  writeCell(identity, 8, 11, L.birthdate ?? "");
  writeCell(identity, 8, 16, L.sex ?? "");

  // Flatten every formula on both record sheets: the fill rewrites cells that
  // sit inside shared-formula chains, and leaving an orphaned clone behind makes
  // the workbook unserializable.
  flattenRowsFormulas(
    ws,
    Array.from({ length: contentLastRow(ws) }, (_, i) => i + 1),
    ws.columnCount,
  );
  flattenRowsFormulas(
    otherWs,
    Array.from({ length: contentLastRow(otherWs) }, (_, i) => i + 1),
    otherWs.columnCount,
  );
  clearShsSheet(ws, sheetDef);
  clearShsSheet(otherWs, otherDef);

  writeShsHeaders(ws, sheetDef, gradeKey.replace(/^G/, ""), L);

  // Zentra runs trimesters: terms 1–2 are the first semester, term 3 the
  // second. Q4 is always blank on a trimestral record.
  const firstSem = input.rows.filter((r) => r.quarters[0] != null || r.quarters[1] != null);
  const secondSem = input.rows.filter((r) => r.quarters[2] != null || r.quarters[3] != null);
  writeShsSemester(ws, sheetDef.blocks[0], firstSem, 0);
  writeShsSemester(ws, sheetDef.blocks[1], secondSem, 2);
  writeShsSummary(ws, sheetDef, input.rows);

  // The workbook's own page setup (paper, scale, print areas) is already the
  // official form's; unlike the JHS fill, nothing here needs to be re-applied.
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* -------------------------------- PDF render ------------------------------- */

/**
 * Print the filled workbook as PDF. LibreOffice renders the workbook itself, so
 * the paper output is exactly what Excel prints (print area, scaling, row
 * heights, fonts, fills). When no soffice binary is available the hand-drawn
 * renderer below is used instead — it only approximates the printed layout.
 */
export async function renderSf10Pdf(xlsx: Buffer): Promise<Buffer> {
  try {
    const converted = await convertXlsxToPdf(xlsx);
    if (converted) return converted;
  } catch (err) {
    logger.warn({ err }, "LibreOffice SF10 conversion failed — using the built-in PDF renderer");
  }
  return renderSf10TemplatePdf(xlsx);
}

const PAGE_WIDTH = 10.4 * 72;
const PAGE_HEIGHT = 13 * 72;
const MARGIN_TOP = 0.1 * 72;
const MARGIN_LEFT = 0.25 * 72;
const MARGIN_RIGHT = 0.25 * 72;
const MARGIN_BOTTOM = 0.75 * 72;

/** Excel column width → pixels (Calibri 11 metric), then points at 96 dpi. */
function columnWidthPt(width: number | undefined): number {
  const w = width && width > 0 ? width : 8.43;
  const px = Math.round(((256 * w + Math.round(128 / 7)) / 256) * 7);
  return px * 0.75;
}

function argbToRgb(argb: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!argb) return fallback;
  const hex = argb.replace(/^#/, "").slice(-6);
  if (hex.length !== 6) return fallback;
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return fallback;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return "";
  if (value instanceof Date) return "";
  if (typeof value === "object") {
    const cell = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: unknown }>;
    };
    if (typeof cell.text === "string" && cell.text.trim() && cell.text !== "[object Object]") {
      return cell.text.trim();
    }
    if (typeof cell.result === "string" || typeof cell.result === "number") {
      return String(cell.result).trim();
    }
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((r) => String(r.text ?? "")).join("").trim();
    }
  }
  return "";
}

interface MergedCell {
  isMaster: boolean;
  width: number; // in columns
  height: number; // in rows
}

function addressToRC(addr: string): { row: number; col: number } | null {
  const m = /^\s*([A-Z]+)(\d+)\s*$/i.exec(addr);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}

function mergeLookup(ws: Worksheet): Map<string, MergedCell> {
  const map = new Map<string, MergedCell>();
  for (const merge of ws.model.merges ?? []) {
    const [a, b] = merge.split(":");
    const start = addressToRC(a);
    const end = addressToRC(b);
    if (!start || !end) continue;
    for (let r = start.row; r <= end.row; r += 1) {
      for (let c = start.col; c <= end.col; c += 1) {
        map.set(`${r}:${c}`, {
          isMaster: r === start.row && c === start.col,
          width: end.col - start.col + 1,
          height: end.row - start.row + 1,
        });
      }
    }
  }
  return map;
}

function lastContentRow(ws: Worksheet): number {
  const max = Math.min(ws.rowCount || 0, 200);
  for (let r = max; r >= 1; r -= 1) {
    const row = ws.getRow(r);
    let seen = false;
    row.eachCell({ includeEmpty: false }, () => {
      seen = true;
    });
    if (seen) return r;
  }
  return 0;
}

function borderOf(borders: Partial<Borders> | undefined, side: keyof Borders) {
  if (!borders) return undefined;
  const border = borders[side];
  return border && border.style ? border : undefined;
}

/**
 * Draw a filled workbook as PDF pages sized for the SF10 print layout. Fonts,
 * sizes, colours, alignment and the template's own borders are read from each
 * cell, so the output matches the workbook instead of a re-invented form.
 */
export async function renderSf10TemplatePdf(xlsx: Buffer): Promise<Buffer> {
  const ExcelJS = await excelJs();
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx as unknown as ArrayBuffer);

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const ws of wb.worksheets) {
    const merges = mergeLookup(ws);
    const lastRow = lastContentRow(ws);
    const lastCol = Math.min(ws.columnCount, 60);
    if (lastRow === 0) continue;

    const colPt: number[] = [0];
    for (let c = 1; c <= lastCol; c += 1) colPt[c] = columnWidthPt(ws.getColumn(c).width);
    const rowPt: number[] = [0];
    for (let r = 1; r <= lastRow; r += 1) {
      const height = ws.getRow(r).height;
      rowPt[r] = height && height > 0 ? height : 15;
    }

    const totalW = colPt.reduce((a, b) => a + (b ?? 0), 0);
    const totalH = rowPt.reduce((a, b) => a + (b ?? 0), 0);
    const availW = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    const availH = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
    const scale = Math.min(1, availW / totalW, availH / totalH);

    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const xAt = (col: number): number => {
      let x = MARGIN_LEFT;
      for (let c = 1; c < col; c += 1) x += (colPt[c] ?? 0) * scale;
      return x;
    };
    const yTopAt = (row: number): number => {
      let offset = MARGIN_TOP;
      for (let r = 1; r < row; r += 1) offset += (rowPt[r] ?? 0) * scale;
      return PAGE_HEIGHT - offset;
    };

    // Fills next (the section bands), then the header logos, then the rules.
    for (let r = 1; r <= lastRow; r += 1) {
      for (let c = 1; c <= lastCol; c += 1) {
        const merged = merges.get(`${r}:${c}`);
        if (merged && !merged.isMaster) continue;
        const fill = ws.getRow(r).getCell(c).fill as
          | { type?: string; fgColor?: { argb?: string } }
          | undefined;
        const argb = fill?.fgColor?.argb;
        if (fill?.type !== "pattern" || !argb) continue;
        const [red, green, blue] = argbToRgb(argb, [1, 1, 1]);
        if (red === 1 && green === 1 && blue === 1) continue;
        const spanCols = merged?.width ?? 1;
        const spanRows = merged?.height ?? 1;
        const x = xAt(c);
        const yTop = yTopAt(r);
        const yBottom = yTopAt(r + spanRows);
        page.drawRectangle({
          x,
          y: yBottom,
          width: xAt(c + spanCols) - x,
          height: yTop - yBottom,
          color: rgb(red, green, blue),
        });
      }
    }

    // Logos embedded in the workbook (the header crest and DepEd mark).
    type ImageRangeLike = {
      tl: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
      br?: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
      ext?: { width: number; height: number };
    };
    for (const image of ws.getImages()) {
      const media = wb.getImage(Number(image.imageId));
      if (!media?.buffer) continue;
      const isJpeg = String(media.extension).toLowerCase().startsWith("jp");
      const embedded = isJpeg
        ? await doc.embedJpg(media.buffer)
        : await doc.embedPng(media.buffer);
      const range = image.range as unknown as ImageRangeLike;
      const tl = range.tl;
      const x = xAt(tl.nativeCol + 1) + (tl.nativeColOff / 9525) * 0.75 * scale;
      const yTop = yTopAt(tl.nativeRow + 1) - (tl.nativeRowOff / 9525) * 0.75 * scale;
      let widthPt: number;
      let heightPt: number;
      if (range.ext) {
        widthPt = range.ext.width * 0.75 * scale;
        heightPt = range.ext.height * 0.75 * scale;
      } else {
        const br = range.br;
        if (!br) continue;
        widthPt = xAt(br.nativeCol + 1) + (br.nativeColOff / 9525) * 0.75 * scale - x;
        heightPt = yTop - (yTopAt(br.nativeRow + 1) - (br.nativeRowOff / 9525) * 0.75 * scale);
      }
      if (widthPt <= 0 || heightPt <= 0) continue;
      page.drawImage(embedded, { x, y: yTop - heightPt, width: widthPt, height: heightPt });
    }

    // Borders first so text sits on top of them.
    for (let r = 1; r <= lastRow; r += 1) {
      for (let c = 1; c <= lastCol; c += 1) {
        const cell = ws.getRow(r).getCell(c);
        const borders = cell.border;
        if (!borders) continue;
        const x1 = xAt(c);
        const x2 = xAt(c + 1);
        const yT = yTopAt(r);
        const yB = yTopAt(r + 1);
        const draw = (side: keyof Borders, from: { x: number; y: number }, to: { x: number; y: number }) => {
          const border = borderOf(borders, side);
          if (!border) return;
          const [red, green, blue] = argbToRgb(
            typeof border.color === "object" ? border.color?.argb : undefined,
            [0, 0, 0],
          );
          const width =
            border.style === "medium" || border.style === "thick"
              ? 1.1
              : border.style === "hair"
                ? 0.3
                : 0.6;
          page.drawLine({
            start: from,
            end: to,
            thickness: width,
            color: rgb(red, green, blue),
            ...(border.style === "dashed"
              ? { dashArray: [3, 2] }
              : border.style === "dotted"
                ? { dashArray: [1, 1.5] }
                : {}),
          });
        };
        draw("top", { x: x1, y: yT }, { x: x2, y: yT });
        draw("bottom", { x: x1, y: yB }, { x: x2, y: yB });
        draw("left", { x: x1, y: yT }, { x: x1, y: yB });
        draw("right", { x: x2, y: yT }, { x: x2, y: yB });
      }
    }

    // Text.
    for (let r = 1; r <= lastRow; r += 1) {
      for (let c = 1; c <= lastCol; c += 1) {
        const cell = ws.getRow(r).getCell(c);
        const text = cellText(cell.value);
        if (!text) continue;
        const merged = merges.get(`${r}:${c}`);
        if (merged && !merged.isMaster) continue;
        const spanCols = merged?.width ?? 1;
        const spanRows = merged?.height ?? 1;
        const x1 = xAt(c);
        const yT = yTopAt(r);
        const boxW = (xAt(c + spanCols) - x1) || (colPt[c] ?? 0) * scale;
        const boxH = (yTopAt(r + spanRows) - yTopAt(r)) * -1 || (rowPt[r] ?? 0) * scale;

        const isBold = !!cell.font?.bold;
        const font = isBold ? bold : regular;
        let size = Math.max(6, (cell.font?.size ?? 10) * scale);
        const [red, green, blue] = argbToRgb(
          typeof cell.font?.color === "object" ? cell.font?.color?.argb : undefined,
          [0, 0, 0],
        );
        const horizontal = cell.alignment?.horizontal;
        const vertical = cell.alignment?.vertical;

        // The checkbox glyph is outside Helvetica's WinAnsi set, so draw the
        // open square the form prints instead of trying to encode the glyph.
        if (text === "□") {
          const side = Math.max(5, Math.min(boxW, boxH) * 0.62);
          const x =
            horizontal === "right"
              ? x1 + boxW - side - 2
              : horizontal === "center"
                ? x1 + (boxW - side) / 2
                : x1 + 2;
          const y = yT - boxH + (boxH - side) / 2;
          page.drawRectangle({
            x,
            y,
            width: side,
            height: side,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.8,
          });
          continue;
        }

        // Wrap to the cell's printable width (a couple of points of padding).
        const maxW = Math.max(4, boxW - 2);
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (line && font.widthOfTextAtSize(next, size) > maxW) {
            lines.push(line);
            line = word;
          } else {
            line = next;
          }
        }
        if (line) lines.push(line);
        if (lines.length === 0) continue;

        let lineHeight = size * 1.15;
        let blockH = lineHeight * lines.length;
        // Shrink a wrapped block that does not fit the merged cell's height.
        if (blockH > boxH && boxH > 2) {
          const factor = boxH / blockH;
          size = Math.max(4, size * factor);
          lineHeight = size * 1.15;
          blockH = lineHeight * lines.length;
        }

        let y: number;
        if (vertical === "middle") y = yT - (boxH - blockH) / 2 - lineHeight * 0.8;
        else if (vertical === "top") y = yT - lineHeight * 0.8;
        else y = yT - boxH + 1.5; // bottom-aligned (Excel default)

        lines.forEach((content, i) => {
          const textW = font.widthOfTextAtSize(content, size);
          let x = x1 + 1;
          if (horizontal === "center") x = x1 + Math.max(0, (boxW - textW) / 2);
          else if (horizontal === "right") x = x1 + Math.max(0, boxW - textW - 1);
          page.drawText(content, {
            x,
            y: y + (lines.length - 1 - i) * lineHeight,
            size,
            font,
            color: rgb(red, green, blue),
          });
        });
      }
    }
  }

  return Buffer.from(await doc.save());
}
