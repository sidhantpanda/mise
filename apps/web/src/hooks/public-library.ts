import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PublicRecipeSummary, Recipe } from "common";
import { keys } from "./keys";

// Public library file_locations all look like "recipes/<slug>.json". The browse
// URL only needs the slug, so we strip the fixed prefix/suffix for the query
// param and re-add them (see publicRecipeLocation) before hitting the API. The
// two are exact inverses, so ids that don't match the convention round-trip
// unchanged.
export function publicRecipeSlug(fileLocation: string): string {
  return fileLocation.replace(/^recipes\//, "").replace(/\.json$/, "");
}

export function publicRecipeLocation(slug: string): string {
  return `recipes/${slug}.json`;
}

export function usePublicLibrary() {
  return useQuery({
    queryKey: keys.publicLibrary,
    queryFn: () => api.get<PublicRecipeSummary[]>("/public-library"),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicRecipe(id: string) {
  return useQuery({
    queryKey: keys.publicRecipe(id),
    queryFn: () => api.get<Recipe>(`/public-library/recipe?id=${encodeURIComponent(id)}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}
