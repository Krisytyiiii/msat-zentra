/**
 * GCForm-03 (ADM referral form) → PDF.
 *
 * The web desk fills the official workbook in the browser and exports it, so
 * the PDF here uses that same template, the same cell map and the same
 * LibreOffice conversion the SF10 forms use. Data is derived from the
 * referral + anecdotal record (there is no stored GCForm-03 payload).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/pino.js";
import { prisma } from "../../lib/prisma.js";
import { convertXlsxToPdf } from "../sf10/xlsx-to-pdf.service.js";

const ASSET_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "assets",
);
const TEMPLATE_PATH = path.join(ASSET_DIR, "gcform03-template.xlsx");
const CREST_PATH = path.join(ASSET_DIR, "msat-crest.png");
const SHEET_NAME = "Referral Form";
/** 1 css/excel px = 9525 EMU — image anchor offsets are stored in EMU. */
const EMU_PER_PX = 9525;

/* ExcelJS ships its own Buffer type; the runtime bytes are the same. */
type XlsxLoadInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];
type ImageInput = Parameters<ExcelJS.Workbook["addImage"]>[0];

const GRADE_LABEL: Record<string, string> = {
  G7: "Grade 7",
  G8: "Grade 8",
  G9: "Grade 9",
  G10: "Grade 10",
  G11: "Grade 11",
  G12: "Grade 12",
};

const CONCERN_LABELS = {
  absences: { label: "Absences/Tardiness/Cutting classes", doubleSpace: true },
  academic: { label: "Academic Problems", doubleSpace: true },
  personal: { label: "Personal Problems", doubleSpace: true },
  family: { label: "Family Problems", doubleSpace: false },
  peer: { label: "Peer Problems", doubleSpace: false },
} as const;

type ConcernKey = keyof typeof CONCERN_LABELS;

interface Concerns {
  absences: boolean;
  academic: boolean;
  personal: boolean;
  family: boolean;
  peer: boolean;
  others: boolean;
  othersText: string;
}

export interface GcForm03Data {
  studentName: string;
  gradeSection: string;
  concerns: Concerns;
  detailsOfConcern: string;
  referrerRecommendations: string;
  referredByName: string;
  referredDate: string;
  receivedBy: string;
  receivedDate: string;
  guidanceRecommendations: string;
  counselorName: string;
  counselorDate: string;
}

let cachedTemplate: Buffer | null = null;
let cachedCrest: Buffer | null = null;

async function loadTemplate(): Promise<Buffer> {
  if (!cachedTemplate) cachedTemplate = await readFile(TEMPLATE_PATH);
  return cachedTemplate;
}

async function loadCrest(): Promise<Buffer | null> {
  if (!cachedCrest) {
    try {
      cachedCrest = await readFile(CREST_PATH);
    } catch {
      cachedCrest = null;
    }
  }
  return cachedCrest;
}

function manilaDate(value: Date | null | undefined): string {
  if (!value) return "";
  const manila = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  return manila.toISOString().slice(0, 10);
}

function concernsFor(category: string | null | undefined): Concerns {
  const base: Concerns = {
    absences: false,
    academic: false,
    personal: false,
    family: false,
    peer: false,
    others: false,
    othersText: "",
  };
  switch ((category ?? "").toLowerCase()) {
    case "attendance":
      return { ...base, absences: true };
    case "academic":
      return { ...base, academic: true };
    case "bullying":
      return { ...base, peer: true };
    default:
      return category ? { ...base, others: true, othersText: category } : base;
  }
}

/** The guidance recommendation lives in the referral's `[ADM endorsed]` note. */
export function endorsedRecommendation(notes: string | null): string {
  if (!notes) return "";
  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const endorsed = [...lines]
    .reverse()
    .find((line) => line.startsWith("[ADM endorsed]"));
  if (!endorsed) return "";
  const body = endorsed.slice("[ADM endorsed]".length).trim();
  const kept: string[] = [];
  for (const segment of body.split(" | ").map((part) => part.trim())) {
    if (
      ["Concerns:", "Details:", "Actions taken:", "Follow-up:"].some((key) =>
        segment.startsWith(key),
      )
    ) {
      break;
    }
    if (segment) kept.push(segment);
  }
  return kept.join(" | ").trim();
}

export function templateConcernLabel(
  key: ConcernKey,
  checked: boolean,
): string {
  const { label, doubleSpace } = CONCERN_LABELS[key];
  return `${checked ? "☑" : "☐"}${doubleSpace ? "  " : " "}${label}`;
}

export function splitBlock(
  text: string,
  maxRows: number,
  perRow: number,
): string[] {
  const clean = (text ?? "").replace(/\r\n/g, "\n");
  if (!clean.trim()) return Array<string>(maxRows).fill("");
  const rows: string[] = [];
  for (const line of clean.split("\n")) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      rows.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > perRow && current) {
        rows.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    rows.push(current);
  }
  if (rows.length <= maxRows) {
    while (rows.length < maxRows) rows.push("");
    return rows;
  }
  const head = rows.slice(0, maxRows - 1);
  head.push(rows.slice(maxRows - 1).join("\n"));
  return head;
}

export async function buildGcForm03Data(
  referralId: string,
): Promise<GcForm03Data> {
  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    include: {
      student: { include: { user: true, section: true } },
      roster: { include: { section: true } },
      referredByUser: true,
      anecdotalRecord: true,
    },
  });
  if (!referral) {
    throw new AppError(404, "NOT_FOUND", "Referral not found.");
  }
  const anecdotal = referral.anecdotalRecord;
  const studentName =
    referral.student?.user.fullName ??
    referral.roster?.fullName ??
    "Learner";
  const gradeLevel =
    referral.student?.gradeLevel ?? referral.roster?.gradeLevel ?? "";
  const grade = GRADE_LABEL[gradeLevel] ?? gradeLevel;
  const section =
    referral.student?.section?.name ?? referral.roster?.section?.name ?? "";
  const counselor = await prisma.user.findFirst({
    where: { role: "guidance_counselor", status: "active" },
    select: { fullName: true },
    orderBy: { fullName: "asc" },
  });
  const profile = await prisma.admLearnerProfile.findFirst({
    where: { referralId },
    select: { createdAt: true },
  });
  const referralDate =
    anecdotal?.observationDatetime ?? profile?.createdAt ?? new Date();
  return {
    studentName,
    gradeSection: [grade, section].filter(Boolean).join(" - "),
    concerns: concernsFor(anecdotal?.category),
    detailsOfConcern:
      anecdotal?.descriptionOfIncident ?? referral.reason ?? "",
    referrerRecommendations: anecdotal?.notesRecommendationsActions ?? "",
    referredByName: referral.referredByUser.fullName,
    referredDate: manilaDate(referralDate),
    receivedBy: counselor?.fullName ?? "",
    receivedDate: manilaDate(profile?.createdAt ?? new Date()),
    guidanceRecommendations: endorsedRecommendation(referral.notes),
    counselorName: counselor?.fullName ?? "",
    counselorDate: manilaDate(profile?.createdAt ?? new Date()),
  };
}

function setValue(
  ws: ExcelJS.Worksheet,
  address: string,
  value: string,
): void {
  ws.getCell(address).value = value ?? "";
}

function setPara(
  ws: ExcelJS.Worksheet,
  address: string,
  value: string,
): void {
  const cell = ws.getCell(address);
  cell.value = value ?? "";
  cell.alignment = {
    ...(cell.alignment ?? {}),
    wrapText: true,
    vertical: "middle",
  };
}

function centerCell(ws: ExcelJS.Worksheet, address: string): void {
  const cell = ws.getCell(address);
  cell.alignment = { ...(cell.alignment ?? {}), horizontal: "center" };
}

function fitBlock(
  ws: ExcelJS.Worksheet,
  lastRow: number,
  baseHeight: number,
  text: string,
  perRowChars: number,
): void {
  const value = (text ?? "").trim();
  if (!value) return;
  const lines = Math.max(
    1,
    Math.ceil(value.length / perRowChars) + (value.match(/\n/g)?.length ?? 0),
  );
  const needed = lines * 15;
  if (needed > baseHeight) {
    ws.getRow(lastRow).height = baseHeight + (needed - baseHeight);
  }
}

type EmbeddedImage = {
  imageId?: number;
  range?: {
    tl?: {
      nativeColOff?: number;
      nativeRowOff?: number;
    };
  };
};

function embeddedImages(ws: ExcelJS.Worksheet): EmbeddedImage[] {
  const getImages = (
    ws as unknown as { getImages?: () => EmbeddedImage[] }
  ).getImages;
  return typeof getImages === "function" ? getImages.call(ws) : [];
}

function setImageOffsets(
  ws: ExcelJS.Worksheet,
  imageId: number,
  offset: { x?: number; y?: number },
): void {
  const image = embeddedImages(ws).find((img) => img.imageId === imageId);
  const tl = image?.range?.tl;
  if (!tl) return;
  if (offset.x !== undefined) tl.nativeColOff = Math.round(offset.x * EMU_PER_PX);
  if (offset.y !== undefined) tl.nativeRowOff = Math.round(offset.y * EMU_PER_PX);
}

/**
 * Header text (rows 1–7) centers across B:I instead of B:J — the crest sits in
 * column J — and the DepEd logo is inset 60px from the left edge, exactly like
 * the web preview/export.
 */
function applyHeaderLayout(ws: ExcelJS.Worksheet): void {
  setImageOffsets(ws, 0, { x: 60 });
  for (let row = 1; row <= 7; row += 1) {
    try {
      ws.unMergeCells(`B${row}:J${row}`);
    } catch {
      // Not merged in the template — nothing to undo.
    }
    ws.mergeCells(`B${row}:I${row}`);
  }
}

function fillSheet(ws: ExcelJS.Worksheet, data: GcForm03Data): void {
  setValue(ws, "C11", data.studentName);
  setValue(ws, "I11", data.gradeSection);

  setValue(ws, "A13", templateConcernLabel("absences", data.concerns.absences));
  setValue(
    ws,
    "E13",
    templateConcernLabel("academic", data.concerns.academic),
  );
  setValue(
    ws,
    "H13",
    templateConcernLabel("personal", data.concerns.personal),
  );
  setValue(ws, "A14", templateConcernLabel("family", data.concerns.family));
  setValue(ws, "E14", templateConcernLabel("peer", data.concerns.peer));
  setValue(ws, "H14", `${data.concerns.others ? "☑" : "☐"} Others:`);
  setValue(ws, "I14", data.concerns.others ? data.concerns.othersText : "");

  const detailsBase = ws.getRow(18).height ?? 26;
  const detailRows = splitBlock(data.detailsOfConcern, 3, 120);
  setPara(ws, "A16", detailRows[0]);
  setPara(ws, "A17", detailRows[1]);
  setPara(ws, "A18", detailRows[2]);
  fitBlock(ws, 18, detailsBase, detailRows[2], 120);

  const recommendationsBase = ws.getRow(27).height ?? 28;
  const recommendationRows = splitBlock(data.referrerRecommendations, 2, 120);
  setPara(ws, "A26", recommendationRows[0]);
  setPara(ws, "A27", recommendationRows[1]);
  fitBlock(ws, 27, recommendationsBase, recommendationRows[1], 120);

  setValue(ws, "F28", data.referredByName);
  centerCell(ws, "F28");

  setValue(ws, "C31", data.receivedBy);
  centerCell(ws, "C31");
  setValue(ws, "G31", data.receivedDate);
  centerCell(ws, "G31");

  for (const row of [36, 37, 38]) {
    setValue(ws, `C${row}`, "☐");
  }

  const guidanceBase = ws.getRow(41).height ?? 28;
  const guidanceRows = splitBlock(data.guidanceRecommendations, 3, 100);
  setPara(ws, "C39", guidanceRows[0]);
  setPara(ws, "A40", guidanceRows[1]);
  setPara(ws, "A41", guidanceRows[2]);
  fitBlock(ws, 41, guidanceBase, guidanceRows[2], 100);

  setValue(ws, "A46", data.counselorName);
  centerCell(ws, "A46");
  setValue(ws, "G46", data.counselorDate);
  centerCell(ws, "G46");
}

async function buildWorkbook(data: GcForm03Data): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await loadTemplate()) as unknown as XlsxLoadInput);
  const ws = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!ws) {
    throw new AppError(500, "FORM_TEMPLATE_MISSING", "The GCForm-03 template is missing.");
  }
  fillSheet(ws, data);
  applyHeaderLayout(ws);
  const crest = await loadCrest();
  if (crest) {
    try {
      const imageId = workbook.addImage({
        buffer: crest,
        extension: "png",
      } as unknown as ImageInput);
      ws.addImage(imageId, {
        tl: { col: 8, row: 0 },
        ext: { width: 90, height: 90 },
      });
      setImageOffsets(ws, imageId, { x: 36, y: 12.5 });
    } catch (error) {
      logger.warn({ error }, "GCForm-03 crest could not be stamped");
    }
  }
  return workbook;
}

export function gcForm03Filename(studentName: string): string {
  const safe =
    (studentName ?? "")
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "referral";
  const date = new Date().toISOString().slice(0, 10);
  return `GCForm-03_${safe}_${date}.pdf`;
}

export async function renderGcForm03Pdf(
  referralId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const data = await buildGcForm03Data(referralId);
  const workbook = await buildWorkbook(data);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  const pdf = await convertXlsxToPdf(xlsx);
  if (!pdf) {
    throw new AppError(
      503,
      "PDF_UNAVAILABLE",
      "The PDF form service is not available right now.",
    );
  }
  return { buffer: pdf, filename: gcForm03Filename(data.studentName) };
}
