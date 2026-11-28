"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export type StudentPlacementState = "placed" | "unplaced";

export interface StudentPlacement {
  state: StudentPlacementState;
  lrn: string | null;
  sectionId: string | null;
  sectionName: string | null;
  hasProfile: boolean;
  hasRosterRow: boolean;
}

export interface StudentPortalMe {
  learner: {
    studentId: string;
    lrn: string;
    name: string;
    mascot: string | null;
    photoUrl: string | null;
    gradeLevel: string;
    sectionId: string | null;
    sectionName: string | null;
    adviserName: string | null;
  } | null;
  term: {
    id: string;
    termNumber: number;
    schoolYearId: string;
    schoolYearName: string;
    startDate: string | null;
    endDate: string | null;
  };
  profile: unknown;
  placement: StudentPlacement;
}

const ME_KEY = ["student-portal", "me"] as const;

async function fetchStudentMe(): Promise<StudentPortalMe> {
  const { data } = await apiClient.get<StudentPortalMe>("/api/student/me");
  return data;
}

/** Placement state for the learner portal gate (server-resolved school year). */
export function useStudentMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: fetchStudentMe,
    retry: false,
  });
}

export interface RedeemLearnerCodeResult {
  lrn: string;
  sectionId: string;
  sectionName: string;
  alreadyPlaced: boolean;
  placement: StudentPlacement;
}

/** `POST /api/student/link` — redeem the school-issued class code. */
export function useRedeemLearnerCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await apiClient.post<RedeemLearnerCodeResult>("/api/student/link", { code });
      return data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(ME_KEY, (prev: StudentPortalMe | undefined) =>
        prev ? { ...prev, placement: result.placement } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
