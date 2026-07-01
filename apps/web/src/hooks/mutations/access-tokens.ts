import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "../keys";
import type { CreatedAccessToken } from "../access-tokens";

export function useCreateAccessToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scopes: string[]; expiresAt?: string | null }) =>
      api.post<CreatedAccessToken>("/auth/tokens", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.accessTokens }),
  });
}

export function useRevokeAccessToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/auth/tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.accessTokens }),
  });
}
