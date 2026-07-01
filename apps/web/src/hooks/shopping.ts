import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShoppingItem } from "@/lib/mock-data";
import { keys } from "./keys";

export function useShopping() {
  return useQuery({ queryKey: keys.shopping, queryFn: () => api.get<ShoppingItem[]>("/shopping") });
}
