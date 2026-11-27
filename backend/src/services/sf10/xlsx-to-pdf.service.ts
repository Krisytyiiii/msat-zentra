/**
 * XLSX → PDF conversion through LibreOffice.
 *
 * The SF10 template is a real workbook: merged cells, an Excel print area, row
 * heights, Calibri metrics and Excel's own scaling rules. Re-drawing it with
 * `pdf-lib` (the `renderSf10TemplatePdf` fallback) can only approximate that, so
 * the PDF is produced by LibreOffice itself whenever the binary is available.
 *
 * LibreOffice serialises on a single user profile and is heavy to start, so
 * conversions are queued (one at a time) and each run gets its own throwaway
 * profile directory. A missing binary is not an error here: the caller falls
 * back to the hand renderer.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { logger } from "../../lib/pino.js";

const execFileAsync = promisify(execFile);

/** Where LibreOffice usually lives when it is not on PATH. */
const KNOWN_PATHS = [
  // Windows ships both; the .com wrapper is the console one that waits for the
  // conversion to finish, so it is preferred over the .exe launcher.
  "C:\\Program Files\\LibreOffice\\program\\soffice.com",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/local/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
];

const CONVERT_TIMEOUT_MS = 120_000;
/** How long to wait for the output file when the launcher returns early. */
const OUTPUT_WAIT_MS = 15_000;

let resolved = false;
let binary: string | null = null;

/** Absolute soffice path (env override, then known installs, then PATH). */
export function resolveSoffice(): string | null {
  if (resolved) return binary;
  resolved = true;
  const override = process.env.SF10_SOFFICE_PATH?.trim();
  const candidates = override ? [override, ...KNOWN_PATHS] : KNOWN_PATHS;
  for (const candidate of candidates) {
    // Windows install paths are not absolute on POSIX, so recognise their
    // drive-letter form too; otherwise `path.isAbsolute` would treat them as a
    // bare binary name and exec would fail with ENOENT on Linux/macOS.
    const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(candidate);
    if (path.isAbsolute(candidate) || windowsAbsolute) {
      if (existsSync(candidate)) binary = candidate;
    } else {
      // Bare name: let the OS resolve it on PATH (checked on first run).
      binary = candidate;
      break;
    }
    if (binary) break;
  }
  if (!binary) {
    logger.warn(
      "LibreOffice not found — SF10 PDFs fall back to the built-in renderer (layout will not match Excel 1:1). Set SF10_SOFFICE_PATH to the soffice binary to enable exact conversion.",
    );
  }
  return binary;
}

/* One conversion at a time: LibreOffice instances fight over the shared
 * profile and each cold start is expensive. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * One LibreOffice user profile for the whole server process. A throwaway
 * profile per conversion forced a brand-new soffice instance every time
 * (measured ~6s on Windows); with a shared profile the next `--convert-to`
 * call is forwarded to the already-running instance instead.
 */
let sharedProfileDir: string | null = null;

async function sharedProfile(): Promise<string> {
  if (!sharedProfileDir) {
    sharedProfileDir = await mkdtemp(path.join(os.tmpdir(), "zentra-sf10-profile-"));
  }
  return sharedProfileDir;
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function profileUrl(dir: string): string {
  return `file:///${dir.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

/** Poll for the converted file: Windows' launcher can return before it is written. */
async function waitForFile(file: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(file)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Rendered PDFs keyed by the workbook's hash — a repeated download is instant. */
const pdfCache = new Map<string, Buffer>();
const PDF_CACHE_MAX = 20;

function rememberPdf(key: string, pdf: Buffer): void {
  pdfCache.set(key, pdf);
  while (pdfCache.size > PDF_CACHE_MAX) {
    const oldest = pdfCache.keys().next().value;
    if (oldest === undefined) break;
    pdfCache.delete(oldest);
  }
}

/**
 * Convert an XLSX buffer to PDF. Returns null when LibreOffice is unavailable
 * so the caller can fall back; throws when the conversion itself fails.
 */
export async function convertXlsxToPdf(xlsx: Buffer): Promise<Buffer | null> {
  const bin = resolveSoffice();
  if (!bin) return null;

  // Same workbook in, same PDF out — LibreOffice costs ~3-6s per run, and the
  // desk downloads the same learner's file repeatedly (Excel, then PDF).
  const cacheKey = createHash("sha256").update(xlsx).digest("hex");
  const cached = pdfCache.get(cacheKey);
  if (cached) return cached;

  return enqueue(async () => {
    // A queued twin of the same workbook may have finished while we waited.
    const raced = pdfCache.get(cacheKey);
    if (raced) return raced;
    const dir = await mkdtemp(path.join(os.tmpdir(), "zentra-sf10-pdf-"));
    const profile = await sharedProfile();
    try {
      const input = path.join(dir, "sf10.xlsx");
      const output = path.join(dir, "sf10.pdf");
      await writeFile(input, xlsx);

      await execFileAsync(
        bin,
        [
          "--headless",
          "--norestore",
          "--nolockcheck",
          "--nodefault",
          `-env:UserInstallation=${profileUrl(profile)}`,
          "--convert-to",
          "pdf:calc_pdf_Export",
          "--outdir",
          dir,
          input,
        ],
        { timeout: CONVERT_TIMEOUT_MS, windowsHide: true },
      );

      if (!(await waitForFile(output, OUTPUT_WAIT_MS))) {
        throw new Error("LibreOffice did not produce a PDF");
      }
      const pdf = await readFile(output);
      rememberPdf(cacheKey, pdf);
      return pdf;
    } catch (err) {
      // A bare `soffice` name that is not installed surfaces here as ENOENT.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        binary = null;
        logger.warn(
          "LibreOffice binary could not be executed — SF10 PDFs fall back to the built-in renderer.",
        );
        return null;
      }
      throw err;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
}
