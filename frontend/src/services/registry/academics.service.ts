import { apiClient } from "@/lib/api/client";

/** One row of the record-keeper G7–10 subject catalog. */
export interface RegistrySubject {
  id: string;
  code: string;
  name: string;
  gradeLevel: number;
  category: string;
  active: boolean;
  enrolled: number;
  passed: number;
  failed: number;
}

export interface RegistrySubjectsResponse {
  subjects: RegistrySubject[];
}

/** One learner row for a subject (drill-down on the academics desk). */
export interface RegistrySubjectStudent {
  id: string;
  lrn: string;
  name: string;
  gradeLevel: number;
  section: string;
  finalGrade: number;
  remarks: "Passed" | "Failed" | "No grade yet";
  hasAccount: boolean;
  status: "active" | "pending" | "suspended";
}

export interface RegistrySubjectStudentsResponse {
  subject: {
    id: string;
    code: string;
    name: string;
    gradeLevel: number;
    category: string;
  };
  students: RegistrySubjectStudent[];
}

/**
 * Banded subject catalog for either registry desk. The record keeper reads
 * G7–10, the registrar G11–12; the backend bands both by the caller's role.
 */
export async function fetchRegistrySubjects(
  desk: "record-keeper" | "registrar",
  signal?: AbortSignal,
): Promise<RegistrySubject[]> {
  const { data } = await apiClient.get<RegistrySubjectsResponse>(
    `/api/${desk}/academics/subjects`,
    { signal },
  );
  return data.subjects;
}

export async function fetchRecordKeeperSubjects(
  signal?: AbortSignal,
): Promise<RegistrySubject[]> {
  return fetchRegistrySubjects("record-keeper", signal);
}

/**
 * Learners sitting in a subject with their final grade / remarks. Served by
 * `GET /api/<desk>/academics/subjects/:id/students`; banded server-side.
 */
export async function fetchSubjectStudents(
  desk: "record-keeper" | "registrar",
  subjectId: string,
  signal?: AbortSignal,
): Promise<RegistrySubjectStudentsResponse> {
  const { data } = await apiClient.get<RegistrySubjectStudentsResponse>(
    `/api/${desk}/academics/subjects/${encodeURIComponent(subjectId)}/students`,
    { signal },
  );
  return data;
}
