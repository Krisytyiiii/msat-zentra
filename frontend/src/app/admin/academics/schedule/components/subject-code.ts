/**
 * Client mirror of the server's subject-code minting (`subjectCodeBase` in
 * `backend/src/services/schedule/schedule.service.ts`): the meaningful part of
 * the name + the grade number — `Mathematics 7` → `MATH7`, `Araling Panlipunan
 * 7` → `AP7`. Only used for the live preview and the optimistic row; the
 * server remains the source of truth (it appends `-2`, `-3`… on a clash).
 */
export function subjectCodePreview(name: string, gradeLevel: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const words = cleaned.split(" ").filter((word) => word && !/^(GRADE|G)$/.test(word));
  while (words.length > 1 && /^\d{1,2}$/.test(words[words.length - 1] ?? "")) words.pop();
  const gradeNumber = gradeLevel.replace(/^G/, "");
  if (words.length === 0) return `SUBJ${gradeNumber}`;
  const base =
    words.length === 1
      ? (words[0] ?? "SUBJ").slice(0, 4) || "SUBJ"
      : words
          .map((word) => word[0])
          .join("")
          .slice(0, 4) || "SUBJ";
  return `${base}${gradeNumber}`;
}
