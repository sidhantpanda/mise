import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Household, HouseholdSummary, PendingInvitation } from "@/lib/mock-data";
import { meKey } from "./keys";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
};

export type Me = {
  user: AuthUser;
  household: Household | null;
  households: HouseholdSummary[];
  invitations: PendingInvitation[];
};

/**
 * Current session. A 401 is an expected "logged out" state, so don't retry it -
 * callers branch on `isError` / `data`.
 */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: () => api.get<Me>("/auth/me"),
    retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
    staleTime: 5 * 60 * 1000,
  });
}
