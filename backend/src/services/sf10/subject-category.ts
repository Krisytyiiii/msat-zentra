/**
 * DepEd Senior High School subject classification.
 *
 * `Subject.category` stores the classification (CORE / APPLIED / SPECIALIZED),
 * but a subject created before the field was introduced — or named by hand —
 * may still need a best-effort tag. The SF10-SHS form prints the tag in column A
 * and its ANNEX formulas compare the exact title-case strings "Core", "Applied"
 * and "Specialized", so this module owns both the name matrix and that casing.
 */
export type ShsSubjectCategory = "CORE" | "APPLIED" | "SPECIALIZED";

const CORE_SUBJECTS = [
  // JHS core learning areas (G7–G10), so the JHS catalog is not mislabelled.
  "math",
  "mathematics",
  "english",
  "science",
  "filipino",
  "araling panlipunan",
  "edukasyon sa pagpapakatao",
  "mapeh",
  "music",
  "arts",
  "physical education",
  "health",
  "technology and livelihood education",
  "tle",
  // SHS core subjects.
  "oral communication",
  "reading and writing",
  "komunikasyon at pananaliksik",
  "pagbasa at pagsusuri",
  "21st century literature",
  "contemporary philippine arts",
  "media and information literacy",
  "general mathematics",
  "statistics and probability",
  "earth and life science",
  "earth science",
  "physical science",
  "disaster readiness and risk reduction",
  "personal development",
  "understanding culture society and politics",
  "introduction to the philosophy of the human person",
  "pambungad sa pilosopiya ng tao",
  "physical education and health",
] as const;

const APPLIED_SUBJECTS = [
  "english for academic and professional purposes",
  "practical research 1",
  "practical research 2",
  "filipino sa piling larang",
  "empowerment technolog",
  "entrepreneurship",
  "inquiries investigations and immersion",
] as const;

/** Lowercase, punctuation-free form used to match a subject name. */
function normalizeName(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Classification from the subject name, or null when the name is unknown. */
export function knownSubjectCategory(subject: string): ShsSubjectCategory | null {
  const name = normalizeName(subject);
  if (APPLIED_SUBJECTS.some((known) => name.startsWith(known))) return "APPLIED";
  if (CORE_SUBJECTS.some((known) => name.startsWith(known))) return "CORE";
  return null;
}

/** Best-effort classification from the subject name (unknown -> SPECIALIZED). */
export function classifyShsSubject(subject: string): ShsSubjectCategory {
  return knownSubjectCategory(subject) ?? "SPECIALIZED";
}

/**
 * Coerce a stored/legacy category string. The pre-matrix enum used CORE /
 * ELECTIVE, so "ELECTIVE" maps to SPECIALIZED rather than failing a fill.
 */
export function normalizeSubjectCategory(raw: string | null | undefined): ShsSubjectCategory | null {
  if (raw == null) return null;
  const norm = raw.trim().toUpperCase();
  if (norm === "CORE") return "CORE";
  if (norm === "APPLIED") return "APPLIED";
  if (norm === "SPECIALIZED" || norm === "ELECTIVE") return "SPECIALIZED";
  return null;
}

/** Title case the workbook's own formulas compare against. */
export function shsCategoryTag(category: ShsSubjectCategory): "Core" | "Applied" | "Specialized" {
  if (category === "APPLIED") return "Applied";
  if (category === "SPECIALIZED") return "Specialized";
  return "Core";
}
