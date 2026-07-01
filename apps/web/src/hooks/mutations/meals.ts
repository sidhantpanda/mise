import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PlannedMeal } from "@/lib/mock-data";
import { keys } from "../keys";

export type MealInput = Omit<PlannedMeal, "identifier">;

export function useCreateMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MealInput) => api.post<PlannedMeal>("/meals", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.meals }),
  });
}

export function useUpdateMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<MealInput> }) =>
      api.patch<PlannedMeal>(`/meals/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.meals }),
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/meals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.meals }),
  });
}
