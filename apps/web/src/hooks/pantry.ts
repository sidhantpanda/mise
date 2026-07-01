import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PantryItem } from "@/lib/mock-data";
import { keys } from "./keys";

export function usePantry() {
  return useQuery({ queryKey: keys.pantry, queryFn: () => api.get<PantryItem[]>("/pantry") });
}
