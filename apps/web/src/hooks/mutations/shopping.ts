import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ShoppingItem } from "common";
import { keys } from "../keys";

export type ShoppingInput = Omit<ShoppingItem, "id">;

export function useCreateShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<ShoppingInput> & { name: string }) =>
      api.post<ShoppingItem>("/shopping", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shopping }),
  });
}

export function useUpdateShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ShoppingInput> }) =>
      api.patch<ShoppingItem>(`/shopping/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shopping }),
  });
}

export function useDeleteShopping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/shopping/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shopping }),
  });
}

export function useClearChecked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ShoppingItem[]>("/shopping/clear-checked"),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shopping }),
  });
}

export function useSetShoppingChecked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, checked }: { ids: string[]; checked: boolean }) =>
      api.patch<ShoppingItem[]>("/shopping", { ids, checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shopping }),
  });
}

export function useAddFromRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) =>
      api.post<{ added: number; items: ShoppingItem[] }>(`/shopping/from-recipe/${recipeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.shopping }),
  });
}
