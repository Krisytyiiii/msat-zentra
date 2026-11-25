import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export type NoClassScope = "whole_day" | "am" | "pm";

export interface NoClassDay {
  id: string;
  date: string;
  scope: NoClassScope;
  reason: string;
  schoolYearId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoClassDayList {
  schoolYearId: string;
  from: string;
  to: string;
  entries: NoClassDay[];
}

export interface SaveNoClassDayInput {
  date: string;
  scope: NoClassScope;
  reason: string;
  schoolYearId?: string;
}

export const NO_CLASS_KEY = ["admin", "no-class-days"] as const;

export function useNoClassDays() {
  return useQuery({
    queryKey: NO_CLASS_KEY,
    queryFn: async (): Promise<NoClassDayList> => {
      const { data } = await apiClient.get<NoClassDayList>("/api/admin/no-class-days");
      return data;
    },
    staleTime: 15_000,
  });
}

export function useSaveNoClassDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveNoClassDayInput): Promise<NoClassDay> => {
      const { data } = await apiClient.post<NoClassDay>("/api/admin/no-class-days", input);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NO_CLASS_KEY }),
  });
}

export function useDeleteNoClassDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string; removed: boolean }> => {
      const { data } = await apiClient.delete<{ id: string; removed: boolean }>(
        `/api/admin/no-class-days/${id}`,
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NO_CLASS_KEY }),
  });
}
