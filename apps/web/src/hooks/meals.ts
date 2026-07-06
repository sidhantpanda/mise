import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PlannedMeal } from "common";
import { keys } from "./keys";

export function useMeals() {
  return useQuery({ queryKey: keys.meals, queryFn: () => api.get<PlannedMeal[]>("/meals") });
}
