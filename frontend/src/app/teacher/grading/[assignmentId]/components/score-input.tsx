"use client";
import { typedCache } from "./score-storage";
import styles from "./ScoreGrid.module.css";
import type { ClassAssessment } from "@/services/teacher/grading.types";
export function sanitizeScore(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
}
export function scoreOf(assessment: ClassAssessment, drafts: Record<string, string>, editing: boolean, studentId: string): { text: string; num: number | null } {
  const text = editing ? (drafts[studentId] ?? "") : assessment.scores[studentId] != null ? String(assessment.scores[studentId]) : "";
  const num = Number(text);
  return { text, num: text.trim() !== "" && Number.isFinite(num) ? num : null };
}
export function ScoreCellInput({ cacheKey, initial, studentName, assessmentTitle, maxScore, onDraft }: { cacheKey: string; initial: string; studentName: string; assessmentTitle: string; maxScore: number; onDraft: (value: string) => void }) {
  return (
    <input
      className={styles.scoreInput}
      inputMode="decimal"
      defaultValue={typedCache.get(cacheKey) ?? initial}
      aria-label={`${assessmentTitle} score for ${studentName}`}
      onChange={(e) => {
        let next = sanitizeScore(e.target.value);
        // Keep the encoded score inside the assessment's range as it is typed,
        // so an over-max entry can never show a >100% percentage.
        const parsed = Number(next);
        if (next !== "" && Number.isFinite(parsed) && parsed > maxScore) {
          next = String(maxScore);
        }
        e.target.value = next;
        typedCache.set(cacheKey, next);
        onDraft(next);
      }}
    />
  );
}
