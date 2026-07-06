import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Recipe } from "common";
import { keys } from "./keys";

export function useRecipes() {
  return useQuery({ queryKey: keys.recipes, queryFn: () => api.get<Recipe[]>("/recipes") });
}

export const RECIPE_SEARCH_PAGE_SIZE = 24;

type RecipeSearchPage = {
  hits: Recipe[];
  total: number;
  limit: number;
  offset: number;
};

// Server-side recipe search (Meilisearch), scoped to the household and paginated.
// Only runs for a non-empty query; keeps previous results visible while the next
// query loads so the list doesn't flash empty as the user types. Pass an optional
// category to filter server-side (so it composes correctly with pagination).
export function useRecipeSearch(query: string, category?: string) {
  const q = query.trim();
  const cat = category && category !== "All" ? category : undefined;
  return useInfiniteQuery({
    queryKey: keys.recipeSearch(q, cat),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        q,
        limit: String(RECIPE_SEARCH_PAGE_SIZE),
        offset: String(pageParam),
      });
      if (cat) params.set("category", cat);
      return api.get<RecipeSearchPage>(`/recipes/search?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.limit;
      return next < last.total ? next : undefined;
    },
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
