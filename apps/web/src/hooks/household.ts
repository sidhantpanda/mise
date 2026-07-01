import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Household } from "@/lib/mock-data";
import { keys } from "./keys";

export function useHousehold() {
  return useQuery({ queryKey: keys.household, queryFn: () => api.get<Household>("/household") });
}
