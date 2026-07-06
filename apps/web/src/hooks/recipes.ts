import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Recipe } from "common";
import { keys } from "./keys";

export function useRecipes() {
  return useQuery({ queryKey: keys.recipes, queryFn: () => api.get<Recipe[]>("/recipes") });
}

// Server-side recipe search (Meilisearch), scoped to the household. Only runs for
// a non-empty query; keeps the previous results visible while the next query loads
// so the list doesn't flash empty as the user types.
export function useRecipeSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: keys.recipeSearch(q),
    queryFn: () => api.get<Recipe[]>(`/recipes/search?q=${encodeURIComponent(q)}&limit=100`),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: keys.recipe(id),
    queryFn: () => api.get<Recipe>(`/recipes/${id}`),
    enabled: !!id,
  });
}
