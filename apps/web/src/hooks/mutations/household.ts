import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Household, InvitableRole } from "common";
import { keys, meKey } from "../keys";

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    // `role` is optional; the server defaults it to Member, which is what every
    // invite did before roles were selectable.
    mutationFn: ({ email, role }: { email: string; role?: InvitableRole }) =>
      api.post<Household>("/household/invitations", { email, role }),
    onSuccess: (data) => qc.setQueryData(keys.household, data),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<Household>(`/household/invitations/${id}`),
    onSuccess: (data) => qc.setQueryData(keys.household, data),
  });
}

export function useUpdateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; type?: Household["type"] }) =>
      api.patch<Household>("/household", patch),
    onSuccess: (data) => {
      qc.setQueryData(keys.household, data);
      // The household name/type also shows in the sidebar switcher.
      qc.invalidateQueries({ queryKey: meKey });
    },
  });
}
