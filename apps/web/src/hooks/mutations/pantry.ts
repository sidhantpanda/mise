import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PantryItem } from "@/lib/mock-data";
import { keys } from "../keys";

export type PantryInput = Omit<PantryItem, "@type" | "identifier">;

export function useCreatePantry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PantryInput) => api.post<PantryItem>("/pantry", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pantry }),
  });
}

export function useUpdatePantry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PantryInput> }) =>
      api.patch<PantryItem>(`/pantry/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pantry }),
  });
}

export function useDeletePantry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/pantry/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pantry }),
  });
}
