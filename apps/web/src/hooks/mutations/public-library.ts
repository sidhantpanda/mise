import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PublicLibraryImportResult } from "common";
import { api } from "@/lib/api";
import { keys } from "../keys";

export function useImportPublicRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<PublicLibraryImportResult>("/public-library/import", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.recipes }),
  });
}
