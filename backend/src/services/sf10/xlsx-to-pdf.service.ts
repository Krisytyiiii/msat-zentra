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
    if (path.isAbsolute(candidate)) {
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

/**
 * Convert an XLSX buffer to PDF. Returns null when LibreOffice is unavailable
 * so the caller can fall back; throws when the conversion itself fails.
 */
export async function convertXlsxToPdf(xlsx: Buffer): Promise<Buffer | null> {
  const bin = resolveSoffice();
  if (!bin) return null;

  return enqueue(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "zentra-sf10-pdf-"));
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
          `-env:UserInstallation=${profileUrl(path.join(dir, "profile"))}`,
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
      return await readFile(output);
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
