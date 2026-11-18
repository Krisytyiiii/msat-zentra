export type Sf10Status = "attach" | "available" | "released";
export type Sf10Source = "ocr_upload" | "manual" | "auto_populated";
export type Sf10Desk = "registrar" | "record_keeper";

export type Sf10Version = {
  versionNumber: number;
  changedBy: string;
  changeReason: string;
  changedAt: string;
};

export type Sf10Record = {
  id: string;
  /** Desk that filed this record — each desk keeps its own file per LRN. */
  desk: Sf10Desk;
  /** The record's identity: the LRN written on the filed SF10. */
  lrn: string;
  fullName: string;
  /** Highest grade the file classifies; null when the form says nothing. */
  gradeLevel: "G7" | "G8" | "G9" | "G10" | "G11" | "G12" | null;
  section: string;
  status: Sf10Status;
  source: Sf10Source;
  uploadedFileUrl: string | null;
  uploadedAt: string | null;
  verifiedBy: string | null;
  /** Verifier display name — resolved by the detail endpoint only. */
  verifiedByName?: string | null;
  verifiedAt: string | null;
  validatedBy: string | null;
  /** Validator display name — resolved by the detail endpoint only. */
  validatedByName?: string | null;
  validatedAt: string | null;
  releasedAt: string | null;
  archivedAt: string | null;
  currentVersion: number;
  updatedAt: string;
  /** Adviser read access granted on the adviser-access desk — NOT a release. */
  adviserAccess?: boolean;

  versions?: Sf10Version[];
};

export type Sf10RecordsResponse = {
  records: Sf10Record[];
  total: number;
  page: number;
  pageSize: number;
  counts: { attach: number; available: number; released: number; total: number };
};

export type Sf10OcrSubject = {
  rawName: string;
  norm: string;
  grade?: number | null;
};

export type Sf10SubjectMapEntry = {
  code: string;
  name: string;
  norm: string;
  /** Subject name exactly as written on the file (SHS semester tables show it). */
  rawName?: string | null;
  rating?: number | null;
  quarters?: Array<number | null> | null;
  /** SHS only: per-semester finals [1st sem, 2nd sem], if read. */
  semFinals?: Array<number | null> | null;
  remarks?: string | null;
  /** File position: grade tables list subjects as on record. */
  order?: number | null;
};

export type Sf10FileOnlyEntry = {
  rawName: string;
  norm: string;
  gradeLevel: string | null;
  rating: number | null;
  quarters: Array<number | null> | null;
  remarks: string | null;
};

export type Sf10DeficiencyEntry = Sf10SubjectMapEntry & {
  gradeLevel: string;
  category: string;
  reason: "not-taken";
};

export type Sf10PerGradeExtra = {
  rawName: string;
  norm: string;
  rating: number | null;
  quarters: Array<number | null> | null;
  /** SHS only: per-semester finals [1st sem, 2nd sem], if read. */
  semFinals?: Array<number | null> | null;
  remarks: string | null;
  /** File position: grade tables list subjects as on record. */
  order?: number | null;
};

export type Sf10PerGradeMap = {
  gradeLevel: string;
  matched: Sf10SubjectMapEntry[];
  missing: (Sf10SubjectMapEntry & { category: string })[];
  /** File rows for this grade matching no catalog subject (previous school). */
  extras: Sf10PerGradeExtra[];
  total: number;
};

export type Sf10SubjectMapResponse = {
  id: string;
  lrn?: string;
  /** Null when the filed form classifies no grade level. */
  gradeLevel: string | null;
  ocrStatus: "ready" | "processing";
  confidence: number;
  /** Learner name read from the uploaded file itself. */
  learner: Sf10LearnerIdentity | null;
  /** Extractor that read the file (e.g. "local-ocr-tesseract-v1"). */
  engine?: string | null;
  /** ISO timestamp of the extraction run. */
  ocrAt?: string | null;
  /** First ~2k chars of the raw text read from the file, for traceability. */
  rawTextPreview?: string | null;
  needsReview: boolean;
  schoolSubjectCount: number;
  ocrSubjectCount: number;
  matched: Sf10SubjectMapEntry[];
  sf10Only: Sf10FileOnlyEntry[];
  missing: Sf10SubjectMapEntry[];
  perGrade: Sf10PerGradeMap[];
  deficiencies: Sf10DeficiencyEntry[];
  /** File rows with no grade indicated: add-ons, own table. */
  addons: Sf10PerGradeExtra[];
  coverage: { gradesDetected: string[] };
};

export type Sf10DetailResponse = {
  record: Sf10Record;
  versions: Sf10Version[];
  map: Sf10SubjectMapResponse;
};

export type Sf10UploadResult = {
  id: string;
  source: Sf10Source;
  uploadedFileUrl: string;
  ocrStatus: "processing" | "ready";
};

export type Sf10AutoUploadResult = Sf10UploadResult & {
  studentCreated: boolean;
  learner: Sf10LearnerIdentity | null;
  /** The record's identity: the LRN read off the file. */
  lrn: string;
  /** Learner name as written on the file (display only). */
  learnerName: string | null;
  matched: { kind: string; score: number; fullName: string } | null;
  /** Null when the file classifies no grade level. */
  gradeLevel: string | null;
  deficiencies: Array<{ code: string; name: string; norm: string; gradeLevel: string; category: string }>;
  /** Subjects the extractor read out of the file (0 when nothing was read). */
  subjectsRead: number;
  /** Extractor that read the file (e.g. "local-ocr-tesseract-v1"). */
  engine: string;
  /** Extractor confidence, 0–1. */
  confidence: number;
};

export type Sf10LearnerIdentity = {
  lrn: string | null;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  suffix: string | null;
  fullName: string | null;
  confidence: number;
};

export type Sf10RosterCandidate = {
  studentId: string;
  lrn: string;
  fullName: string;
  gradeLevel: string;
  section: string;
  matchKind: string;
  score: number;
};

export type Sf10AnalyzeResponse = {
  learner: Sf10LearnerIdentity;
  candidates: Sf10RosterCandidate[];
  rosterOnlyLrn: boolean;
};

export const SF10_STATUS_LABEL: Record<Sf10Status, string> = {
  attach: "Attached",
  available: "Available",
  released: "Released",
};

export const SF10_SOURCE_LABEL: Record<Sf10Source, string> = {
  ocr_upload: "OCR Upload",
  manual: "Manual",
  auto_populated: "Auto-populated",
};

export const GRADE_LABEL: Record<string, string> = {
  G7: "Grade 7",
  G8: "Grade 8",
  G9: "Grade 9",
  G10: "Grade 10",
  G11: "Grade 11",
  G12: "Grade 12",
};
