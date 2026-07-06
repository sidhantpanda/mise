import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Household } from "common";
import { keys } from "./keys";

export function useHousehold() {
  return useQuery({ queryKey: keys.household, queryFn: () => api.get<Household>("/household") });
}
