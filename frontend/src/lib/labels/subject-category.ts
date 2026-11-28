/**
 * Subject category labels/tones shared by every desk.
 *
 * `Subject.category` is CORE / APPLIED / SPECIALIZED. "ELECTIVE" is the legacy
 * value, kept readable so an old cached payload never renders blank.
 */
export type SubjectCategoryLabel = "Core" | "Applied" | "Specialized";

export function subjectCategoryLabel(category: string): SubjectCategoryLabel {
  if (category === "APPLIED") return "Applied";
  if (category === "SPECIALIZED" || category === "ELECTIVE") return "Specialized";
  return "Core";
}

/** Pill tone per category: Core = amber, Applied = sky, Specialized = violet. */
export function subjectCategoryTone(category: string): "amber" | "sky" | "violet" {
  if (category === "APPLIED") return "sky";
  if (category === "SPECIALIZED" || category === "ELECTIVE") return "violet";
  return "amber";
}
