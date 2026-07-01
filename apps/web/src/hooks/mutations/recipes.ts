import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Recipe } from "@/lib/mock-data";
import { keys } from "../keys";

export type RecipeInput = Partial<Omit<Recipe, "@context" | "@type" | "identifier">>;

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeInput) => api.post<Recipe>("/recipes", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.recipes }),
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RecipeInput }) =>
      api.patch<Recipe>(`/recipes/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: keys.recipes });
      qc.invalidateQueries({ queryKey: keys.recipe(id) });
    },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/recipes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.recipes });
      qc.invalidateQueries({ queryKey: keys.meals });
    },
  });
}
