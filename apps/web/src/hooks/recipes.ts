import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Recipe } from "common";
import { keys } from "./keys";

export function useRecipes() {
  return useQuery({ queryKey: keys.recipes, queryFn: () => api.get<Recipe[]>("/recipes") });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: keys.recipe(id),
    queryFn: () => api.get<Recipe>(`/recipes/${id}`),
    enabled: !!id,
  });
}
