/** Shared shapes for the teacher's My Classes board. Mirrors `/api/teacher/my-load`. */
export interface MyClass {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  sectionId: string;
  sectionName: string;
  gradeLevel: string;
}

export interface MySlot {
  day: number;
  period: number;
  status: string;
  subject: { id: string; name: string; code: string };
  section: { id: string; name: string; gradeLevel: string };
}

/** Period → clock range, from the school-day shape the API sends with the load. */
export type PeriodTimes = Map<number, { startMin: number; endMin: number }>;
