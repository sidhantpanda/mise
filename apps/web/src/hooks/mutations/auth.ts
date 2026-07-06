import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Household, Me } from "common";
import { meKey } from "../keys";
import { invalidateAll } from "./cache";

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api.post<Me>("/auth/login", input),
    onSuccess: (data) => qc.setQueryData(meKey, data),
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      api.post<Me>("/auth/signup", input),
    onSuccess: (data) => qc.setQueryData(meKey, data),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.clear();
    },
  });
}

/** Create a household/restaurant (onboarding or the switcher's "Create" action). */
export function useCreateHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: "Household" | "Restaurant" }) =>
      api.post<Household>("/households", input),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Switch the active household (sidebar switcher). */
export function useSwitchHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (householdId: string) => api.post("/households/active", { householdId }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Accept a pending invitation - joins and switches to that household. */
export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => api.post(`/invitations/${invitationId}/accept`),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Reject a pending invitation. */
export function useRejectInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => api.post(`/invitations/${invitationId}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
}
